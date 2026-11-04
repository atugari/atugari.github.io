import { fail, hash, identity, input, json, limit, newKey, owner, validKey } from './http.js';
import { candidate } from './generation.js';
import { fingerprintPuzzle } from './shared/stock-puzzle.js';
import { verifyVendingProof } from './shared/vending-proof.js';
import { hasVendingUniqueSolution } from './shared/vending-unique.js';
import { normalProfileShape, validateNormalProfile } from './shared/vending-normal.js';

const rule = { kind: 'normal', n: 9, level: 18 };
const pilotProfile = 'normal:9:18:0::::';
const size = 81;
const regions = Array.from({ length: size }, (_, i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));
const pairLifetime = 10 * 60_000;
const leaseLifetime = 8 * 60_000;
const stockReportInterval = 15 * 60_000;
const orderLifetime = 7 * 24 * 60 * 60_000;
const receiptLifetime = orderLifetime;
const maxDevices = 30;
const maxOpenPerClient = 5;
const maxOutstanding = 200;
const maxOrder = 10;
const maxResultBytes = 196_608;
const publicStock = profile => `SELECT COUNT(*) FROM vending_puzzles
  WHERE profile=${profile} AND order_id IS NULL AND payload IS NOT NULL`;
const waitingCount = (profile = null) => `SELECT COALESCE(SUM(count-assigned),0) FROM vending_orders
  WHERE cancelled IS NULL AND assigned<count${profile ? ` AND profile=${profile}` : ''}`;
const outstandingCount = 'SELECT COALESCE(SUM(count-received),0) FROM vending_orders WHERE closed IS NULL';
const openDeviceJob = 'device_id=? AND done IS NULL AND lease_until>?';
const orderColumns = 'id,profile,count,created,cancelled,received,assigned-received AS ready';
const selectOrder = `SELECT ${orderColumns} FROM vending_orders o WHERE id=? AND client=?`;
const deviceEnabled = 'EXISTS(SELECT 1 FROM vending_devices WHERE id=? AND revoked IS NULL)';
const profileFields = 'profile,kind,n,level,complexity,multi_shape AS multiShape,linked_shape AS linkedShape';
const pilotLiteral = "'normal:9:18:0::::'";
const profileStock = `SELECT ${profileFields},p.last_job,
    CASE WHEN p.profile=${pilotLiteral} THEN s.low_water ELSE p.target END AS lowWater,
    CASE WHEN p.profile=${pilotLiteral} THEN s.target ELSE p.target END AS target,
    CASE WHEN p.profile=${pilotLiteral} THEN s.refilling ELSE 1 END AS refilling,
    (${publicStock('p.profile')}) AS available,
    (${waitingCount('p.profile')}) AS waiting
  FROM vending_profiles p CROSS JOIN vending_settings s WHERE s.id=1`;

export const vendingEnabled = env => env.VENDING_ENABLED === '1';

function serializeOrder(row) {
  return {
    id: row.id, profile: row.profile, count: row.count, ready: row.ready, received: row.received,
    waiting: row.cancelled ? 0 : row.count - row.ready - row.received,
    created: row.created, expires: row.created + orderLifetime, cancelled: row.cancelled !== null
  };
}

async function shelf(db) {
  const row = await db.prepare(`SELECT low_water AS lowWater,target,(${publicStock(pilotLiteral)}) AS available
    FROM vending_settings WHERE id=1`).first();
  return { ...rule, ...row };
}

function profileInfo(row) {
  const { profile, kind, n, level, complexity, multiShape, linkedShape } = row;
  return {
    profile, kind, n, level, ...(complexity == null ? {} : { complexity }),
    ...(multiShape == null ? {} : { multiShape }), ...(linkedShape == null ? {} : { linkedShape })
  };
}

async function profiles(db, includeWaiting) {
  const { results } = await db.prepare(`${profileStock} ORDER BY kind,n,level,p.profile`).all();
  return results.map(row => ({
    ...profileInfo(row), lowWater: row.lowWater, target: row.target, available: row.available,
    ...(includeWaiting ? { waiting: row.waiting } : {})
  }));
}

const wantsProfiles = request => new URL(request.url).searchParams.get('profiles') === '1';

async function getOrder(db, client, id) {
  const row = await db.prepare(selectOrder).bind(id, client).first();
  if (!row) fail(404, 'この受け取り番号は見つかりません。');
  return serializeOrder(row);
}

async function encodePuzzle(p) {
  const stream = new Response(JSON.stringify(p)).body.pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function decodePuzzle(bytes) {
  const compressed = new Response(new Uint8Array(bytes)).body;
  return new Response(compressed.pipeThrough(new DecompressionStream('gzip'))).json();
}

async function orders(request, db, now) {
  if (request.method === 'GET') {
    const client = await identity(request, 'x-nanpure-key', false);
    const [stock, list] = await Promise.all([shelf(db), wantsProfiles(request) ? profiles(db, false) : null]);
    const response = { enabled: true, shelf: stock, ...(list ? { profiles: list } : {}) };
    if (!client) return json(response);
    const { results } = await db.prepare(`SELECT ${orderColumns} FROM vending_orders o
      WHERE client=? ORDER BY closed IS NULL DESC,created DESC,id DESC LIMIT 20`).bind(client).all();
    return json({ ...response, orders: results.map(serializeOrder) });
  }

  const client = await identity(request);
  const data = await input(request, 1000);
  if (!validKey(data.id)) fail(400, '受け取り番号を確認してください。');

  if (data.action === 'order') {
    if (!Number.isInteger(data.count) || data.count < 1 || data.count > maxOrder || typeof data.reserve !== 'boolean')
      fail(400, '受け取る数を選び直してください。');
    const reserve = Number(data.reserve);
    const profile = data.profile === undefined ? pilotProfile : data.profile;
    if (typeof profile !== 'string' || profile.length > 90 ||
        !await db.prepare('SELECT 1 FROM vending_profiles WHERE profile=?').bind(profile).first())
      fail(400, '補充する問題の条件を選び直してください。');
    const replay = async () => {
      const old = await db.prepare('SELECT client,original_count,reserve,profile FROM vending_orders WHERE id=?').bind(data.id).first();
      if (!old) return null;
      if (old.client !== client || old.original_count !== data.count || old.reserve !== reserve || old.profile !== profile)
        fail(409, '別の受け取り番号でやり直してください。');
      return json({ order: await getOrder(db, client, data.id) });
    };
    const prior = await replay();
    if (prior) return prior;
    await limit(db, request, 'vending-order', 20, 600_000);
    const inserted = await db.prepare(`INSERT INTO vending_orders (id,client,count,original_count,reserve,created,profile)
      SELECT ?,?,CASE WHEN ?=1 THEN ? ELSE MIN(?,available) END,?,?,?,?
      FROM (SELECT (${publicStock('?')}) AS available,(${outstandingCount}) AS outstanding)
      WHERE (?=1 OR available>0)
        AND outstanding+(CASE WHEN ?=1 THEN ? ELSE MIN(?,available) END)<=?
        AND (SELECT COUNT(*) FROM vending_orders WHERE client=? AND closed IS NULL)<?
      ON CONFLICT(id) DO NOTHING RETURNING id`)
      .bind(data.id, client, reserve, data.count, data.count, data.count, reserve, now, profile, profile,
        reserve, reserve, data.count, data.count, maxOutstanding, client, maxOpenPerClient).first();
    if (!inserted) {
      const raced = await replay();
      if (raced) return raced;
      if (!reserve && !(await db.prepare(`SELECT (${publicStock('?')}) AS available`).bind(profile).first()).available)
        fail(409, '在庫がなくなりました。予約するか、少し後にお試しください。');
      fail(429, '受け取り待ちが多いため、少し後にお試しください。');
    }
    return json({ order: await getOrder(db, client, data.id) });
  }

  if (data.action === 'collect') {
    const [ , , status, received ] = await db.batch([
      db.prepare(`UPDATE vending_puzzles SET collected=?
        WHERE collected IS NULL AND order_id=(SELECT id FROM vending_orders WHERE id=? AND client=? AND cancelled IS NULL)`)
        .bind(now, data.id, client),
      db.prepare(`UPDATE vending_orders SET received=assigned,closed=CASE WHEN assigned=count THEN ? ELSE NULL END
        WHERE id=? AND client=? AND closed IS NULL AND received<assigned`).bind(now, data.id, client),
      db.prepare(selectOrder).bind(data.id, client),
      db.prepare(`SELECT payload FROM vending_puzzles
        WHERE order_id=(SELECT id FROM vending_orders WHERE id=? AND client=?)
          AND collected IS NOT NULL AND payload IS NOT NULL ORDER BY created,digest`).bind(data.id, client)
    ]);
    if (!status.results[0]) fail(404, 'この受け取り番号は見つかりません。');
    const puzzles = await Promise.all(received.results.map(row => decodePuzzle(row.payload)));
    return json({ order: serializeOrder(status.results[0]), puzzles });
  }

  if (data.action === 'cancel') {
    await db.prepare(`UPDATE vending_orders SET cancelled=?,closed=?
      WHERE id=? AND client=? AND closed IS NULL`).bind(now, now, data.id, client).run();
    return json({ order: await getOrder(db, client, data.id) });
  }

  fail(400, '操作を確認してください。');
}

async function admin(request, env, now) {
  if (!await owner(request, env)) fail(403, '管理用キーを確認してください。');
  const db = env.DB;
  if (request.method === 'GET') {
    const [stock, devices, state, list] = await Promise.all([
      shelf(db),
      db.prepare(`SELECT id,name,created,last_seen AS lastSeen,
        stock_count AS stockCount,stock_bytes AS stockBytes,stock_updated AS stockUpdatedAt,
        EXISTS(SELECT 1 FROM vending_jobs WHERE device_id=vending_devices.id AND done IS NULL AND lease_until>?) AS working
        FROM vending_devices WHERE revoked IS NULL ORDER BY created,id`).bind(now).all(),
      db.prepare(`SELECT (${waitingCount()}) AS waiting,
        (SELECT COUNT(*) FROM vending_jobs WHERE done IS NULL AND lease_until>?) AS leased`).bind(now).first(),
      wantsProfiles(request) ? profiles(db, true) : null
    ]);
    return json({ shelf: stock, devices: devices.results.map(d => ({ ...d, working: Boolean(d.working) })), ...state,
      ...(list ? { profiles: list } : {}) });
  }

  const data = await input(request, 1000);
  if (data.action === 'pair') {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name || name.length > 40) fail(400, '端末名を1〜40文字で入力してください。');
    const code = newKey(), expires = now + pairLifetime;
    await db.prepare('INSERT INTO vending_pairs (code_hash,name,created,expires) VALUES (?,?,?,?)')
      .bind(await hash('vending-pair:' + code), name, now, expires).run();
    return json({ code, expires });
  }

  if (data.action === 'revoke' && validKey(data.id)) {
    await db.batch([
      db.prepare('UPDATE vending_devices SET revoked=? WHERE id=? AND revoked IS NULL').bind(now, data.id),
      db.prepare('UPDATE vending_jobs SET lease_until=? WHERE device_id=? AND lease_until>? AND done IS NULL')
        .bind(now, data.id, now)
    ]);
    return json({ ok: true });
  }

  fail(400, '操作を確認してください。');
}

async function register(db, data, now) {
  if (!validKey(data.code) || !validKey(data.token)) fail(400, '登録コードを確認してください。');
  const [code, token] = await Promise.all([hash('vending-pair:' + data.code), hash('vending-device:' + data.token)]);
  const id = newKey();
  const [, , found] = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO vending_devices (id,token_hash,name,created,last_seen)
      SELECT ?,?,name,?,? FROM vending_pairs WHERE code_hash=? AND expires>? AND device_id IS NULL
        AND (SELECT COUNT(*) FROM vending_devices WHERE revoked IS NULL)<?`)
      .bind(id, token, now, now, code, now, maxDevices),
    db.prepare(`UPDATE vending_pairs SET device_id=?
      WHERE code_hash=? AND expires>? AND device_id IS NULL AND EXISTS(SELECT 1 FROM vending_devices WHERE id=?)`)
      .bind(id, code, now, id),
    db.prepare(`SELECT d.id FROM vending_pairs p JOIN vending_devices d ON p.device_id=d.id
      WHERE p.code_hash=? AND p.expires>? AND d.token_hash=? AND d.revoked IS NULL`).bind(code, now, token)
  ]);
  if (!found.results[0]) fail(409, 'この登録コードは使えません。新しいコードを発行してください。');
  return json({ ok: true, id: found.results[0].id });
}

async function getDevice(request, db) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!validKey(token)) fail(403, '補充端末を登録してください。');
  const device = await db.prepare('SELECT id,stock_updated FROM vending_devices WHERE token_hash=? AND revoked IS NULL')
    .bind(await hash('vending-device:' + token)).first();
  if (!device) fail(403, 'この補充端末の登録は解除されています。');
  return device;
}

async function jobResult(db, row, modern) {
  if (!modern) {
    const job = row ? { ...rule, id: row.id, lease: row.lease, expires: row.expires } : null;
    return json({ ok: true, job });
  }
  const profile = row && await db.prepare(`SELECT ${profileFields} FROM vending_profiles WHERE profile=?`)
    .bind(row.profile).first();
  const job = profile ? { ...profileInfo(profile), id: row.id, lease: row.lease, expires: row.expires } : null;
  return json({ ok: true, version: 2, job });
}

async function poll(db, device, now, data) {
  const modern = data.version === 2;
  const ready = modern && Array.isArray(data.ready) ? data.ready : [];
  if (ready.length > 427 || ready.some(profile => typeof profile !== 'string' || profile.length > 90))
    fail(400, '補充する問題の条件を選び直してください。');

  const stock = data.stock;
  if (modern && Number.isSafeInteger(stock?.count) && stock.count >= 0 &&
      Number.isSafeInteger(stock?.bytes) && stock.bytes >= 0 && stock.bytes <= 32_000_000_000 &&
      (device.stock_updated === null || device.stock_updated <= now - stockReportInterval)) {
    await db.prepare(`UPDATE vending_devices SET stock_count=?,stock_bytes=?,stock_updated=?
      WHERE id=? AND revoked IS NULL AND (stock_updated IS NULL OR stock_updated<=?)`)
      .bind(stock.count, stock.bytes, now, device.id, now - stockReportInterval).run();
  }

  const current = await db.prepare(`SELECT id,lease,lease_until AS expires,profile FROM vending_jobs
    WHERE ${openDeviceJob}`).bind(device.id, now).first();
  if (current) {
    if (!modern && current.profile !== pilotProfile) return jobResult(db, null, modern);
    if (current.expires <= now + leaseLifetime / 2) {
      const renewed = await db.prepare(`UPDATE vending_jobs SET lease_until=?
        WHERE id=? AND ${openDeviceJob} AND ${deviceEnabled}
        RETURNING id,lease,lease_until AS expires,profile`)
        .bind(now + leaseLifetime, current.id, device.id, now, device.id).first();
      return jobResult(db, renewed, modern);
    }
    return jobResult(db, current, modern);
  }

  // Only the indexed, uncollected shelf and active leases participate in this
  // calculation. The identity ledger grows independently of the online shelf.
  const demand = `WITH stock AS (${profileStock} AND (?=1 OR p.profile=${pilotLiteral})),
    demand AS (SELECT stock.*, (SELECT COUNT(*) FROM vending_jobs j
      WHERE j.profile=stock.profile AND j.done IS NULL AND j.lease_until>?) AS leased FROM stock)`;
  const needed = 'waiting+CASE WHEN refilling=1 THEN MAX(0,target-available) ELSE 0 END>leased';
  const work = await db.prepare(`${demand} SELECT 1 FROM demand WHERE ${needed} LIMIT 1`)
    .bind(Number(modern), now).first();
  if (!work) return jobResult(db, null, modern);

  // Recheck demand inside the insert so simultaneous polls cannot over-lease.
  const acquired = await db.prepare(`${demand} INSERT INTO vending_jobs (id,device_id,lease,lease_until,created,profile)
    SELECT ?,?,?,?,?,profile FROM demand
    WHERE ${deviceEnabled} AND NOT EXISTS(SELECT 1 FROM vending_jobs WHERE ${openDeviceJob}) AND ${needed}
    ORDER BY (waiting>leased) DESC,(available+leased)*1.0/target,last_job,
      profile IN (SELECT value FROM json_each(?)) DESC,profile
    LIMIT 1 RETURNING id,lease,lease_until AS expires,profile`)
    .bind(Number(modern), now, newKey(), device.id, newKey(), now + leaseLifetime, now, device.id,
      device.id, now, JSON.stringify(ready)).first();
  if (acquired) return jobResult(db, acquired, modern);

  const other = await db.prepare(`SELECT id,lease,lease_until AS expires,profile FROM vending_jobs
    WHERE ${openDeviceJob} AND ${deviceEnabled}`).bind(device.id, now, device.id).first();
  return jobResult(db, modern || other?.profile === pilotProfile ? other : null, modern);
}

function validateCandidate(value, now) {
  const p = candidate(value, rule.level);
  if (typeof p.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(p.uid)
    || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(p.id)
    || p.resolutionVersion !== 1 || !Array.isArray(p.logicProof)
    || p.logicProof.length < 1 || p.logicProof.length > 250
    || p.rating?.humanSolvable !== true || p.rating?.noGuess !== true || p.rating?.unique !== true
    || !hasVendingUniqueSolution(p.puzzle, p.solution) || !verifyVendingProof(p))
    fail(400, '至高の解法証明または唯一解を確認できません。');
  const resolutionSteps = p.logicProof.filter(step => step.type === 'resolution');
  return {
    ...rule, uid: p.uid, id: p.id, created: Number.isSafeInteger(p.created) && p.created > 0 ? p.created : now,
    puzzle: p.puzzle, solution: p.solution, grid: [...p.puzzle], elapsed: 0, completed: false, notes: {},
    resolutionVersion: p.resolutionVersion, logicProof: p.logicProof,
    rating: {
      level: rule.level, humanSolvable: true, unique: true, noGuess: true,
      clues: p.puzzle.filter(Boolean).length, technique: 'bounded-clause-resolution'
    },
    verification: {
      unique: true, method: 'independent-set-proof-replay', legacySolverSolved: false, coverSolverSolved: false,
      steps: p.logicProof.length, resolutionCount: resolutionSteps.length,
      maxProofClauses: Math.max(...resolutionSteps.map(step => step.clauses.length))
    }
  };
}

const resultConflict = (code, error) => json({ code, error }, 409);
const expiredLease = () => resultConflict('lease_expired', '補充の割り当てが終了しました。');

async function submit(db, device, data, now) {
  const selected = await db.prepare(`SELECT j.lease_until,j.digest,p.profile,p.kind,p.n,p.level
    FROM vending_jobs j JOIN vending_profiles p ON p.profile=j.profile
    WHERE j.id=? AND j.device_id=? AND j.lease=? AND ${deviceEnabled}`).bind(data.id, device, data.lease, device).first();
  if (!selected || (!selected.digest && selected.lease_until <= now)) return expiredLease();
  const legacy = selected.profile === pilotProfile;
  const raw = legacy ? candidate(data.p, rule.level) : data.p;
  const boxes = legacy ? regions : normalProfileShape(raw, selected);
  if (!boxes) fail(400, '割り当てられた問題の条件や盤面と一致しません。');

  // A replay after a lost acknowledgement can be checked by identity alone.
  if (selected.digest) {
    const digest = await fingerprintPuzzle({ kind: selected.kind, n: selected.n,
      puzzle: raw.puzzle, solution: raw.solution, regions: boxes });
    if (selected.digest === digest && await db.prepare('SELECT uid FROM vending_puzzles WHERE digest=? AND uid=?')
      .bind(digest, raw.uid ?? '').first()) return json({ ok: true });
    return resultConflict('already_finished', 'この補充の結果は確定しています。');
  }

  const p = legacy ? validateCandidate(raw, now) : validateNormalProfile(raw, selected, boxes, now);
  if (!p) fail(400, '唯一解または指定難易度を確認できません。');
  const [digest, payload] = await Promise.all([
    fingerprintPuzzle({ kind: p.kind, n: p.n, puzzle: p.puzzle, solution: p.solution, regions: boxes }),
    encodePuzzle(p)
  ]);
  const saved = await db.prepare(`INSERT OR IGNORE INTO vending_puzzles (digest,uid,job_id,payload,created,profile)
    SELECT ?,?,?,?,?,profile FROM (${profileStock} AND p.profile=?)
    WHERE (waiting>0 OR available<target)
      AND EXISTS(SELECT 1 FROM vending_jobs WHERE id=? AND device_id=? AND lease=? AND done IS NULL AND lease_until>?)
      AND ${deviceEnabled}
    RETURNING digest`)
    .bind(digest, p.uid, data.id, payload, now, selected.profile, data.id, device, data.lease, Date.now(), device).first();
  if (saved) return json({ ok: true });
  const prior = await db.prepare('SELECT job_id,digest,uid FROM vending_puzzles WHERE digest=? OR uid=?')
    .bind(digest, p.uid).first();
  if (prior?.job_id === data.id && prior.digest === digest && prior.uid === p.uid) return json({ ok: true });
  if (prior) return resultConflict('duplicate', '同じ問題がすでに入庫しています。');
  const live = await db.prepare(`SELECT id FROM vending_jobs WHERE id=? AND device_id=? AND lease=?
    AND done IS NULL AND lease_until>? AND ${deviceEnabled}`).bind(data.id, device, data.lease, Date.now(), device).first();
  if (!live) return expiredLease();
  return resultConflict('shelf_full', '補充する分がそろいました。');
}

async function worker(request, db, now) {
  if (request.method !== 'POST') fail(405, 'POSTで送信してください。');
  const data = await input(request, maxResultBytes);
  if (data.action === 'register') return register(db, data, now);
  const device = await getDevice(request, db);
  if (data.action === 'poll') return poll(db, device, now, data);
  if (!validKey(data.id) || !validKey(data.lease)) fail(400, '補充の割り当てを確認してください。');
  if (data.action === 'result') return submit(db, device.id, data, now);
  if (data.action === 'release') {
    await db.prepare(`UPDATE vending_jobs SET lease_until=?
      WHERE id=? AND device_id=? AND lease=? AND done IS NULL AND lease_until>?`)
      .bind(now, data.id, device.id, data.lease, now).run();
    return json({ ok: true });
  }
  fail(400, '操作を確認してください。');
}

export async function vending(request, env, pathname) {
  if (!vendingEnabled(env)) fail(503, '問題の受け取り機能は準備中です。');
  const now = Date.now();
  if (pathname === '/api/vending/admin') return admin(request, env, now);
  if (pathname === '/api/vending/worker') return worker(request, env.DB, now);
  return orders(request, env.DB, now);
}

export async function cleanVending(db, now = Date.now()) {
  const cutoff = now - receiptLifetime;
  await db.batch([
    // Expired orders return uncollected puzzles using the cancellation trigger.
    db.prepare('UPDATE vending_orders SET cancelled=?,closed=? WHERE closed IS NULL AND created<=?')
      .bind(now, now, now - orderLifetime),
    // Retain the compact identity ledger after the replayable receipt expires.
    db.prepare(`UPDATE vending_puzzles SET payload=NULL,order_id=NULL,collected=NULL
      WHERE order_id IN (SELECT id FROM vending_orders WHERE closed IS NOT NULL AND closed<?)`).bind(cutoff),
    db.prepare('DELETE FROM vending_orders WHERE closed IS NOT NULL AND closed<?').bind(cutoff),
    db.prepare('DELETE FROM vending_jobs WHERE lease_until<?').bind(cutoff),
    db.prepare('DELETE FROM vending_pairs WHERE expires<?').bind(now)
  ]);
}
