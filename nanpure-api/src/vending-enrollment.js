import { hash, json, newKey, validKey } from './http.js';

// Keep both legacy registrations while admitting a fleet of 30 installations.
// The job candidate limit must use the same total as registration admission.
export const maxVendingDevices = 32;
const maxEnrollmentDevices = 30;
const publicFields = `g.id,g.name,g.max_devices AS maxDevices,g.created,g.expires,g.revoked,
  (SELECT COUNT(*) FROM vending_enrollment_members m
    JOIN vending_devices d ON d.id=m.device_id
    WHERE m.enrollment_id=g.id AND d.revoked IS NULL) AS activeDevices`;
const activeMembers = `SELECT COUNT(*) FROM vending_enrollment_members m
  JOIN vending_devices d ON d.id=m.device_id
  WHERE m.enrollment_id=g.id AND d.revoked IS NULL`;
const totalActive = 'SELECT COUNT(*) FROM vending_devices WHERE revoked IS NULL';
const tokenOwner = `SELECT d.id,d.revoked,m.enrollment_id FROM vending_devices d
  LEFT JOIN vending_enrollment_members m ON m.device_id=d.id WHERE d.token_hash=?`;

const error = (code, message, status = 400) => json({ code, error: message }, status);
const invalid = () => error('enrollment_invalid_request', '自動登録の設定を確認してください。');
const allowed = (data, fields) => Object.keys(data).every(key => fields.includes(key));
const nameOf = value => typeof value === 'string' ? value.trim() : '';
const validName = name => name.length > 0 && name.length <= 40 && !/[\u0000-\u001f\u007f]/.test(name);

function publicEnrollment(row) {
  const { revoked, ...rest } = row;
  return { ...rest, revoked: revoked !== null, revokedAt: revoked };
}

export async function listEnrollments(db) {
  const { results } = await db.prepare(`SELECT ${publicFields}
    FROM vending_enrollments g ORDER BY g.created,g.id`).all();
  return results.map(publicEnrollment);
}

export async function createEnrollment(db, data, now, ownerKeyHash) {
  const name = nameOf(data.name);
  const maximum = data.maxDevices ?? maxEnrollmentDevices;
  const expires = data.expires ?? null;
  if (!allowed(data, ['action', 'enrollmentKey', 'name', 'maxDevices', 'expires']) ||
      !validKey(data.enrollmentKey) || !validName(name) ||
      !Number.isSafeInteger(maximum) || maximum < 1 || maximum > maxEnrollmentDevices ||
      (expires !== null && (!Number.isSafeInteger(expires) || expires < 1))) return invalid();
  const [keyHash, ownerHash, deviceHash] = await Promise.all([
    hash('vending-enrollment:' + data.enrollmentKey),
    hash(data.enrollmentKey),
    hash('vending-device:' + data.enrollmentKey)
  ]);
  // This is a registration-only capability, never an alias for a known
  // administrator or worker credential.
  if (ownerHash === ownerKeyHash || await db.prepare('SELECT id FROM vending_devices WHERE token_hash=?')
    .bind(deviceHash).first()) return invalid();
  const select = db.prepare(`SELECT ${publicFields} FROM vending_enrollments g WHERE g.key_hash=?`).bind(keyHash);
  let row = await select.first();
  if (!row) {
    if (expires !== null && expires <= now) return invalid();
    // The caller persists its random enrollmentKey before this request. The
    // unique hash makes a lost response and concurrent retries recoverable.
    await db.prepare(`INSERT OR IGNORE INTO vending_enrollments
      (id,key_hash,name,max_devices,created,expires) VALUES (?,?,?,?,?,?)`)
      .bind(newKey(), keyHash, name, maximum, now, expires).run();
    row = await select.first();
  }
  if (!row) return error('enrollment_unavailable', '自動登録の設定を保存できませんでした。再試行してください。', 503);
  if (row.name !== name || row.maxDevices !== maximum || row.expires !== expires)
    return error('enrollment_conflict', 'この自動登録キーは別の設定で作成されています。', 409);
  return json({ ok: true, ...publicEnrollment(row) });
}

export async function revokeEnrollment(db, data, now) {
  if (!allowed(data, ['action', 'id']) || !validKey(data.id)) return invalid();
  const row = await db.prepare(`UPDATE vending_enrollments SET revoked=COALESCE(revoked,?)
    WHERE id=? RETURNING id`).bind(now, data.id).first();
  if (!row) return error('enrollment_not_found', 'この自動登録の設定は見つかりません。', 404);
  // Revoking enrollment stops new installations; enrolled workers retain
  // their own credentials and can be revoked separately by the owner.
  return json({ ok: true, id: row.id });
}

function priorResult(prior, enrollmentId) {
  if (!prior) return null;
  if (prior.enrollment_id !== enrollmentId)
    return error('token_conflict', 'この端末の認証情報は別の登録に使われています。', 409);
  if (prior.revoked !== null)
    return error('device_revoked', 'この補充端末の登録は解除されています。', 403);
  return json({ ok: true, id: prior.id });
}

function grantFailure(grant, now) {
  if (!grant) return error('enrollment_invalid', '自動登録キーを確認できません。', 403);
  if (grant.revoked !== null)
    return error('enrollment_revoked', 'この自動登録キーによる新しい登録は停止されています。', 403);
  if (grant.expires !== null && grant.expires <= now)
    return error('enrollment_expired', '自動登録キーの有効期限が切れています。', 403);
  return null;
}

export async function enrollDevice(db, data, now) {
  const name = nameOf(data.name);
  if (!allowed(data, ['action', 'enrollmentKey', 'token', 'name']) ||
      !validKey(data.enrollmentKey) || !validKey(data.token) ||
      data.enrollmentKey === data.token || !validName(name)) return invalid();
  const [keyHash, tokenHash, tokenAsGrantHash] = await Promise.all([
    hash('vending-enrollment:' + data.enrollmentKey),
    hash('vending-device:' + data.token),
    hash('vending-enrollment:' + data.token)
  ]);
  const grant = await db.prepare('SELECT id,expires,revoked FROM vending_enrollments WHERE key_hash=?')
    .bind(keyHash).first();
  if (!grant) return grantFailure(grant, now);
  const prior = await db.prepare(tokenOwner).bind(tokenHash).first();
  const replay = priorResult(prior, grant.id);
  if (replay) return replay;
  const blocked = grantFailure(grant, now);
  if (blocked) return blocked;
  if (await db.prepare('SELECT id FROM vending_enrollments WHERE key_hash=?').bind(tokenAsGrantHash).first())
    return invalid();

  const id = newKey();
  // D1 batch is a transaction. Both caps are checked in the INSERT itself,
  // then membership and the final authoritative result commit together.
  // A concurrent duplicate token inserts nothing and replays its prior row.
  const [, , found, status] = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO vending_devices (id,token_hash,name,created,last_seen)
      SELECT ?,?,?,?,? FROM vending_enrollments g
      WHERE g.id=? AND g.key_hash=? AND g.revoked IS NULL AND (g.expires IS NULL OR g.expires>?)
        AND (${activeMembers})<g.max_devices AND (${totalActive})<?`)
      .bind(id, tokenHash, name, now, now, grant.id, keyHash, now, maxVendingDevices),
    db.prepare(`INSERT INTO vending_enrollment_members (device_id,enrollment_id,created)
      SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM vending_devices WHERE id=? AND token_hash=? AND created=?)`)
      .bind(id, grant.id, now, id, tokenHash, now),
    db.prepare(tokenOwner).bind(tokenHash),
    db.prepare(`SELECT g.id,g.revoked,g.expires,g.max_devices AS maxDevices,
      (${activeMembers}) AS activeDevices,(${totalActive}) AS totalDevices
      FROM vending_enrollments g WHERE g.id=?`).bind(grant.id)
  ]);
  const accepted = priorResult(found.results[0], grant.id);
  if (accepted) return accepted;
  const current = status.results[0];
  const changed = grantFailure(current, now);
  if (changed) return changed;
  if (current.activeDevices >= current.maxDevices)
    return error('enrollment_full', 'この自動登録キーの端末枠が埋まっています。', 409);
  if (current.totalDevices >= maxVendingDevices)
    return error('device_limit', '補充端末の登録数が上限に達しています。', 409);
  return error('enrollment_unavailable', '端末を登録できませんでした。同じ設定で再試行してください。', 503);
}
