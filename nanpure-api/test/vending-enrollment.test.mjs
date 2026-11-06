import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';
import { database } from './db.mjs';
import { hash } from '../src/http.js';
import { createEnrollment, enrollDevice } from '../src/vending-enrollment.js';

// All credentials and origins in this file are synthetic. No requests leave
// worker.fetch, and its D1 binding uses a real in-memory SQLite transaction.
const owner = 'a'.repeat(64);
const key = n => n.toString(16).padStart(64, '0');
const adminPath = '/api/vending/admin';
const workerPath = '/api/vending/worker';
const origin = 'https://enrollment.test';
const enrollmentKey = key(100);

async function setup(t) {
  const DB = database();
  const env = { DB, OWNER_KEY_HASH: await hash(owner), VENDING_ENABLED: '1' };
  t.after(() => DB.raw.close());
  async function call(path, body, { auth, from = origin } = {}) {
    const response = await worker.fetch(new Request(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body && { 'Content-Type': 'application/json' }),
        ...(from && { Origin: from }),
        ...(auth && { Authorization: 'Bearer ' + auth })
      },
      ...(body && { body: JSON.stringify(body) })
    }), env);
    return { status: response.status, data: await response.json() };
  }
  const admin = body => call(adminPath, body, { auth: owner });
  const mobile = (body, token) => call(workerPath, body, { auth: token, from: '' });
  const create = (extra = {}) => admin({ action: 'enrollment_create', enrollmentKey,
    name: 'Xperia fleet', maxDevices: 30, expires: null, ...extra });
  const enroll = (token, extra = {}) => mobile({ action: 'enroll', enrollmentKey,
    token, name: 'Xperia', ...extra });
  async function legacy(token, name) {
    const pair = await admin({ action: 'pair', name });
    assert.equal(pair.status, 200);
    const enrolled = await mobile({ action: 'register', code: pair.data.code, token });
    assert.equal(enrolled.status, 200);
    return enrolled.data.id;
  }
  const count = table => DB.raw.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n;
  return { DB, env, call, admin, mobile, create, enroll, legacy, count };
}

test('enrollment owner controls retain authorization, origin and bounded input checks', async t => {
  const { call, create, mobile, count, env } = await setup(t);
  const body = { action: 'enrollment_create', enrollmentKey, name: 'Xperia' };
  assert.equal((await call(adminPath, body)).status, 403);
  assert.equal((await call(adminPath, body, { auth: key(1) })).status, 403);
  assert.equal((await call(adminPath, body, { auth: owner, from: '' })).status, 403);
  assert.equal((await call(adminPath, body, { auth: owner, from: 'https://other.test' })).status, 403);
  assert.equal(count('vending_enrollments'), 0);
  assert.equal((await create()).status, 200);
  assert.equal((await call(adminPath, null, { auth: enrollmentKey })).status, 403);
  assert.equal((await mobile({ action: 'poll' }, enrollmentKey)).status, 403);
  assert.equal((await mobile({ action: 'enroll', enrollmentKey, token: key(1),
    name: 'Xperia', padding: 'x'.repeat(1001) })).status, 413);
  env.VENDING_ENABLED = '0';
  assert.equal((await mobile({ action: 'enroll', enrollmentKey, token: key(1), name: 'Xperia' })).status, 503);
});

test('client-persisted grant key makes creation and lost-response retries idempotent', async t => {
  const { DB, create, admin, count } = await setup(t);
  const responses = await Promise.all(Array.from({ length: 8 }, () => create()));
  assert(responses.every(r => r.status === 200));
  assert.equal(new Set(responses.map(r => r.data.id)).size, 1);
  assert.equal(count('vending_enrollments'), 1);
  const first = responses[0].data;
  assert.equal(first.maxDevices, 30);
  assert.equal(first.activeDevices, 0);
  assert.equal(first.expires, null);
  assert.equal(first.revoked, false);
  assert.deepEqual((await create()).data, first);
  for (const changed of [{ name: 'Different fleet' }, { maxDevices: 29 }, { expires: Date.now() + 60_000 }]) {
    const response = await create(changed);
    assert.equal(response.status, 409);
    assert.equal(response.data.code, 'enrollment_conflict');
  }
  const grant = DB.raw.prepare('SELECT * FROM vending_enrollments').get();
  assert.equal(grant.key_hash, await hash('vending-enrollment:' + enrollmentKey));
  const state = (await admin()).data;
  assert.deepEqual(state.enrollments, [Object.fromEntries(Object.entries(first).filter(([k]) => k !== 'ok'))]);
  for (const text of [JSON.stringify(first), JSON.stringify(state), JSON.stringify(grant)]) {
    assert(!text.includes(enrollmentKey));
    assert(!text.includes(owner));
  }
  assert(!JSON.stringify(state).includes(grant.key_hash));
});

test('grant validation rejects malformed configuration and credential aliasing', async t => {
  const { create, legacy, count } = await setup(t);
  await legacy(key(77), 'Existing manual device');
  for (const changed of [
    { enrollmentKey: 'short' }, { enrollmentKey: 'A'.repeat(64) }, { enrollmentKey: owner },
    { enrollmentKey: key(77) }, { name: '' }, { name: 'x'.repeat(41) }, { name: 'Xperia\nTwo' },
    { maxDevices: 0 }, { maxDevices: 31 }, { maxDevices: 1.5 }, { maxDevices: '30' },
    { expires: 0 }, { expires: Date.now() - 1 }, { expires: 'tomorrow' }, { unknown: true }
  ]) {
    const response = await create(changed);
    assert.equal(response.status, 400, JSON.stringify(Object.keys(changed)));
    assert.equal(response.data.code, 'enrollment_invalid_request');
  }
  assert.equal(count('vending_enrollments'), 0);
  assert.equal(count('vending_devices'), 1);
});

test('different installations get independent credentials while one installation replays the same id', async t => {
  const { create, enroll, admin, mobile, count } = await setup(t);
  await create();
  const token = key(1);
  const responses = await Promise.all(Array.from({ length: 12 }, () => enroll(token)));
  assert(responses.every(r => r.status === 200));
  assert.equal(new Set(responses.map(r => r.data.id)).size, 1);
  assert.equal(count('vending_devices'), 1);
  assert.equal(count('vending_enrollment_members'), 1);
  const other = await enroll(key(2), { name: 'Second Xperia' });
  assert.equal(other.status, 200);
  assert.notEqual(other.data.id, responses[0].data.id);
  const [oneJob, twoJob] = await Promise.all([
    mobile({ action: 'poll' }, token), mobile({ action: 'poll' }, key(2))
  ]);
  assert.equal(oneJob.status, 200);
  assert.equal(twoJob.status, 200);
  assert.notEqual(oneJob.data.job.id, twoJob.data.job.id);
  assert.equal((await admin()).data.leased, 2);
  assert.equal((await admin()).data.enrollments[0].activeDevices, 2);
  assert.equal((await mobile({ action: 'release', id: oneJob.data.job.id,
    lease: oneJob.data.job.lease }, key(2))).status, 200);
  assert.equal((await mobile({ action: 'poll' }, token)).data.job.id, oneJob.data.job.id,
    'another registered device cannot release this device lease');
});

test('30 parallel admissions preserve two legacy devices and reject the 31st new installation', async t => {
  const { DB, legacy, create, enroll, admin, count } = await setup(t);
  await legacy(key(1), 'Old 0.2.2');
  await legacy(key(2), 'Shared 0.3.0');
  const before = DB.raw.prepare('SELECT * FROM vending_devices ORDER BY id').all();
  const pairs = DB.raw.prepare('SELECT * FROM vending_pairs ORDER BY code_hash').all();
  await create();
  const responses = await Promise.all(Array.from({ length: 31 }, (_, i) =>
    enroll(key(1000 + i), { name: 'Xperia ' + (i + 1) })));
  assert.equal(responses.filter(r => r.status === 200).length, 30);
  const denied = responses.filter(r => r.status !== 200);
  assert.equal(denied.length, 1);
  assert.equal(denied[0].status, 409);
  assert.equal(denied[0].data.code, 'enrollment_full');
  assert.equal(count('vending_devices'), 32);
  assert.equal(count('vending_enrollment_members'), 30);
  assert.deepEqual(DB.raw.prepare(`SELECT d.* FROM vending_devices d
    LEFT JOIN vending_enrollment_members m ON m.device_id=d.id WHERE m.device_id IS NULL ORDER BY d.id`).all(), before);
  assert.deepEqual(DB.raw.prepare('SELECT * FROM vending_pairs ORDER BY code_hash').all(), pairs);
  assert.equal((await admin()).data.enrollments[0].activeDevices, 30);
});

test('revoking a device frees its fleet slot but the revoked token never resurrects', async t => {
  const { create, enroll, admin, count } = await setup(t);
  await create({ maxDevices: 1 });
  const first = await enroll(key(1));
  assert.equal((await enroll(key(2))).data.code, 'enrollment_full');
  assert.equal((await enroll(key(1))).data.id, first.data.id, 'full grant still replays');
  assert.equal((await admin({ action: 'revoke', id: first.data.id })).status, 200);
  assert.equal((await admin()).data.enrollments[0].activeDevices, 0);
  const rejected = await enroll(key(1));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.data.code, 'device_revoked');
  assert.equal((await enroll(key(2))).status, 200);
  assert.equal((await admin()).data.enrollments[0].activeDevices, 1);
  assert.equal(count('vending_enrollment_members'), 2, 'membership history remains durable');
  assert.equal((await enroll(key(1))).data.code, 'device_revoked');
});

test('the global 32-device cap also applies across grants and legacy registration', async t => {
  const { create, legacy, enroll, admin, mobile, count } = await setup(t);
  for (let i = 1; i <= 3; i++) await legacy(key(i), 'Legacy ' + i);
  await create();
  const responses = await Promise.all(Array.from({ length: 30 }, (_, i) => enroll(key(1000 + i))));
  assert.equal(responses.filter(r => r.status === 200).length, 29);
  assert.equal(responses.find(r => r.status !== 200).data.code, 'device_limit');
  const otherGrant = key(200);
  await create({ enrollmentKey: otherGrant, name: 'Other fleet' });
  assert.equal((await enroll(key(2000), { enrollmentKey: otherGrant })).data.code, 'device_limit');
  const pair = await admin({ action: 'pair', name: 'Another manual device' });
  const rejected = await mobile({ action: 'register', code: pair.data.code, token: key(3000) });
  assert.equal(rejected.status, 409);
  assert.equal(count('vending_devices'), 32);
});

test('manual and other-grant tokens cannot be claimed or renamed', async t => {
  const { DB, legacy, create, enroll, count } = await setup(t);
  await legacy(key(1), 'Manual');
  const first = await create();
  const otherKey = key(200);
  await create({ enrollmentKey: otherKey, name: 'Other fleet' });
  await enroll(key(2));
  const before = DB.raw.prepare('SELECT * FROM vending_devices ORDER BY id').all();
  const manual = await enroll(key(1));
  assert.equal(manual.status, 409);
  assert.equal(manual.data.code, 'token_conflict');
  const other = await enroll(key(2), { enrollmentKey: otherKey, name: 'Taken over' });
  assert.equal(other.status, 409);
  assert.equal(other.data.code, 'token_conflict');
  assert.deepEqual(DB.raw.prepare('SELECT * FROM vending_devices ORDER BY id').all(), before);
  assert.equal(count('vending_enrollment_members'), 1);
  assert.equal(DB.raw.prepare('SELECT enrollment_id FROM vending_enrollment_members').get().enrollment_id, first.data.id);
});

test('revoked enrollment blocks new devices but keeps live members and creation retries usable', async t => {
  const { create, enroll, admin, mobile, count } = await setup(t);
  const grant = await create();
  const device = await enroll(key(1));
  assert.equal((await admin({ action: 'enrollment_revoke', id: grant.data.id })).status, 200);
  const revokedAt = (await admin()).data.enrollments[0].revokedAt;
  assert.equal((await admin({ action: 'enrollment_revoke', id: grant.data.id })).status, 200);
  assert.equal((await admin()).data.enrollments[0].revokedAt, revokedAt);
  const newDevice = await enroll(key(2));
  assert.equal(newDevice.status, 403);
  assert.equal(newDevice.data.code, 'enrollment_revoked');
  assert.deepEqual((await enroll(key(1))).data, device.data);
  assert.equal((await mobile({ action: 'poll' }, key(1))).status, 200);
  const replay = await create();
  assert.equal(replay.status, 200);
  assert.equal(replay.data.id, grant.data.id);
  assert.equal(replay.data.revoked, true);
  assert.equal(count('vending_enrollments'), 1);
});

test('expiry limits new admissions only, including a lost creation response after the deadline', async t => {
  const { DB, env } = await setup(t);
  const now = 1_000_000;
  const body = { action: 'enrollment_create', enrollmentKey, name: 'Timed fleet',
    maxDevices: 1, expires: now + 1000 };
  const created = await (await createEnrollment(DB, body, now, env.OWNER_KEY_HASH)).json();
  const request = { action: 'enroll', enrollmentKey, token: key(1), name: 'Xperia' };
  const first = await (await enrollDevice(DB, request, now + 500)).json();
  const denied = await enrollDevice(DB, { ...request, token: key(2) }, now + 1000);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'enrollment_expired');
  assert.deepEqual(await (await enrollDevice(DB, request, now + 1000)).json(), first);
  const retry = await createEnrollment(DB, body, now + 2000, env.OWNER_KEY_HASH);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, created.id);
});

test('unknown keys and malformed enrollment requests cannot create devices', async t => {
  const { create, enroll, count } = await setup(t);
  await create();
  const unknown = await enroll(key(1), { enrollmentKey: key(999) });
  assert.equal(unknown.status, 403);
  assert.equal(unknown.data.code, 'enrollment_invalid');
  for (const changed of [{ token: 'short' }, { token: enrollmentKey },
    { enrollmentKey: 'bad' }, { name: '' }, { name: 'x'.repeat(41) }, { adminKey: owner }]) {
    const response = await enroll(key(1), changed);
    assert.equal(response.status, 400);
    assert.equal(response.data.code, 'enrollment_invalid_request');
  }
  const otherKey = key(200);
  await create({ enrollmentKey: otherKey, name: 'Other fleet' });
  assert.equal((await enroll(otherKey)).data.code, 'enrollment_invalid_request');
  assert.equal(count('vending_devices'), 0);
});

test('a grant revoked after preflight cannot race its transactional admission check', async t => {
  const { DB, create, enroll, count } = await setup(t);
  const grant = await create();
  const batch = DB.batch;
  DB.batch = async statements => {
    DB.raw.prepare('UPDATE vending_enrollments SET revoked=? WHERE id=?').run(Date.now(), grant.data.id);
    DB.batch = batch;
    return batch(statements);
  };
  const response = await enroll(key(1));
  assert.equal(response.status, 403);
  assert.equal(response.data.code, 'enrollment_revoked');
  assert.equal(count('vending_devices'), 0);
  assert.equal(count('vending_enrollment_members'), 0);
});

test('membership failure rolls back device admission and the same persisted token can retry', async t => {
  const { DB, create, enroll, count } = await setup(t);
  await create();
  DB.raw.exec(`CREATE TRIGGER test_membership_failure BEFORE INSERT ON vending_enrollment_members
    BEGIN SELECT RAISE(ABORT,'synthetic membership failure'); END`);
  const failed = await enroll(key(1));
  assert.equal(failed.status, 503);
  assert.equal(count('vending_devices'), 0);
  assert.equal(count('vending_enrollment_members'), 0);
  DB.raw.exec('DROP TRIGGER test_membership_failure');
  const succeeded = await enroll(key(1));
  assert.equal(succeeded.status, 200);
  assert.deepEqual((await enroll(key(1))).data, succeeded.data);
  assert.equal(count('vending_devices'), 1);
});

test('additive enrollment migration preserves existing devices, leases, orders and stock', () => {
  const raw = new DatabaseSync(':memory:');
  try {
    const migrations = new URL('../migrations/', import.meta.url);
    for (const name of readdirSync(migrations).sort().filter(name => name < '0015'))
      raw.exec(readFileSync(new URL(name, migrations), 'utf8'));
    raw.prepare(`INSERT INTO vending_devices (id,token_hash,name,created,last_seen,stock_count,stock_bytes,stock_updated)
      VALUES (?,?,?,?,?,?,?,?)`).run(key(1), key(11), 'Old device', 100, 100, 50, 8000, 100);
    raw.prepare(`INSERT INTO vending_pairs (code_hash,name,created,expires,device_id) VALUES (?,?,?,?,?)`)
      .run(key(20), 'Old device', 100, 200, key(1));
    raw.prepare(`INSERT INTO vending_jobs (id,device_id,lease,lease_until,created) VALUES (?,?,?,?,?)`)
      .run(key(2), key(1), key(3), 1000, 101);
    raw.prepare(`INSERT INTO vending_orders (id,client,count,original_count,reserve,created) VALUES (?,?,1,1,1,?)`)
      .run(key(4), key(5), 102);
    raw.prepare(`INSERT INTO vending_puzzles (digest,uid,job_id,payload,created) VALUES (?,?,?,?,?)`)
      .run(key(6), 'existing-puzzle', key(2), new Uint8Array([1, 2, 3]), 103);
    const tables = ['vending_devices', 'vending_pairs', 'vending_jobs', 'vending_orders',
      'vending_puzzles', 'vending_catalogue', 'vending_settings'];
    const snapshot = () => Object.fromEntries(tables.map(table => [table,
      raw.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]));
    const before = snapshot();
    raw.exec(readFileSync(new URL('0015_vending_enrollment.sql', migrations), 'utf8'));
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM vending_catalogue').get().n, 427);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM vending_enrollments').get().n, 0);
  } finally {
    raw.close();
  }
});
