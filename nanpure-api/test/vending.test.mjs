import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import worker from '../src/index.js';
import { database } from './db.mjs';
import { hash } from '../src/http.js';
import { cleanVending } from '../src/vending.js';

const validPuzzles = JSON.parse(gunzipSync(Buffer.from(readFileSync(
  new URL('../../nanpure/collection/data/C149/0000.gz.b64', import.meta.url), 'utf8'
), 'base64'))).map(row => row.puzzle);
const owner = 'a'.repeat(64), one = 'b'.repeat(64), two = 'c'.repeat(64);
const key = n => n.toString(16).padStart(64, '0');
const trial = '/api/vending', admin = trial + '/admin', device = trial + '/worker';

async function setup(t) {
  const DB = database();
  const env = { DB, OWNER_KEY_HASH: await hash(owner), VENDING_ENABLED: '1' };
  t.after(() => DB.raw.close());
  async function call(path, data, { auth, client, origin = 'https://atugari.github.io' } = {}) {
    const result = await worker.fetch(new Request('https://api.test' + path, {
      method: data ? 'POST' : 'GET',
      headers: {
        ...(origin && { Origin: origin }),
        ...(data && { 'Content-Type': 'application/json' }),
        ...(auth && { Authorization: 'Bearer ' + auth }),
        ...(client && { 'X-Nanpure-Key': client })
      },
      ...(data && { body: JSON.stringify(data) })
    }), env);
    return { status: result.status, data: await result.json() };
  }
  const mobile = (auth, data) => call(device, data, { auth, origin: '' });
  async function pair(token, name) {
    const { data: { code } } = await call(admin, { action: 'pair', name }, { auth: owner });
    const response = await mobile(null, { action: 'register', code, token });
    assert.equal(response.status, 200);
    return { id: response.data.id, code };
  }
  const makeOrder = (client, id, count, reserve = true) => call(trial, { action: 'order', id, count, reserve }, { client });
  const collect = (client, id) => call(trial, { action: 'collect', id }, { client });
  const result = (token, job, p) => mobile(token, { action: 'result', id: job.id, lease: job.lease, p });
  const poll = async token => (await mobile(token, { action: 'poll' })).data.job;
  return { DB, env, call, mobile, pair, makeOrder, collect, result, poll };
}

test('pilot flag, scoped phone registration, repeated claim and revocation', async t => {
  const { env, call, mobile, pair, poll } = await setup(t);
  env.VENDING_ENABLED = '0';
  assert.equal((await call(trial)).status, 503);
  assert.equal((await call('/api/health')).data.schema, 'installed');
  env.VENDING_ENABLED = '1';
  assert.equal((await mobile(one, { action: 'poll' })).status, 403);
  assert.equal((await call(admin)).status, 403);
  assert.equal((await call(admin, { action: 'pair', name: 'Xperia' }, { auth: owner, origin: '' })).status, 403);
  const { id, code } = await pair(one, 'Xperia 1');
  const repeated = await mobile(null, { action: 'register', code, token: one });
  assert.deepEqual(repeated, { status: 200, data: { ok: true, id } });
  assert.equal((await mobile(null, { action: 'register', code, token: two })).status, 409);
  const [first, same] = await Promise.all([poll(one), poll(one)]);
  assert.equal(first.id, same.id);
  assert.equal(first.lease, same.lease);
  const second = await pair(two, 'Xperia 2');
  assert.notEqual((await poll(two)).id, first.id);
  const { data } = await call(admin, null, { auth: owner });
  assert.equal(data.leased, 2);
  assert.equal(data.devices.length, 2);
  assert(data.devices.every(d => d.working));
  assert(!JSON.stringify(data).includes(first.lease));
  await call(admin, { action: 'revoke', id }, { auth: owner });
  assert.equal((await mobile(one, { action: 'poll' })).status, 403);
  assert.equal((await call(admin, null, { auth: owner })).data.devices[0].id, second.id);
});

test('oldest reservations receive checked puzzles exactly once and receipts replay safely', async t => {
  const { DB, call, pair, poll, result, makeOrder, collect } = await setup(t);
  await Promise.all([pair(one, 'First phone'), pair(two, 'Second phone')]);
  const a = key(1), b = key(2);
  assert.equal((await makeOrder(one, key(3), 1, false)).status, 409);
  assert.equal((await makeOrder(one, a, 2)).data.order.waiting, 2);
  assert.equal((await makeOrder(one, a, 2)).data.order.waiting, 2);
  assert.equal((await makeOrder(two, a, 2)).status, 409);
  assert.equal((await makeOrder(two, b, 1)).data.order.waiting, 1);
  const first = await poll(one), second = await poll(two);
  const [p, q, r, s] = validPuzzles;
  const forged = { ...p, puzzle: Array(81).fill(0) };
  assert.equal((await result(one, first, forged)).status, 400);
  const unproven = { ...p, logicProof: p.logicProof.slice(0, 10) };
  assert.equal((await result(one, first, unproven)).status, 400);
  assert.deepEqual(await result(one, first, p), { status: 200, data: { ok: true } });
  assert.deepEqual(await result(one, first, p), { status: 200, data: { ok: true } });
  assert.equal((await result(two, second, { ...p, uid: 'duplicate_uid' })).data.code, 'duplicate');
  assert.equal((await result(two, second, q)).status, 200);
  const third = await poll(one);
  assert.equal((await result(one, third, r)).status, 200);
  const summary = (await call(trial, null, { client: one })).data;
  assert.equal(summary.shelf.available, 0);
  assert.deepEqual(summary.orders.map(o => [o.id, o.ready, o.received, o.waiting]), [[a, 2, 0, 0]]);
  assert.equal((await collect(two, a)).status, 404);
  const received = (await collect(one, a)).data;
  assert.equal(received.order.received, 2);
  assert.deepEqual(received.puzzles.map(row => row.uid).sort(), [p.uid, q.uid].sort());
  assert.deepEqual((await collect(one, a)).data, received);
  assert.equal((await collect(two, b)).data.puzzles[0].uid, r.uid);

  const abandoned = await poll(one);
  DB.raw.prepare('UPDATE vending_jobs SET lease_until=0 WHERE id=?').run(abandoned.id);
  assert.equal((await result(one, abandoned, s)).data.code, 'lease_expired');
  assert.notEqual((await poll(one)).id, abandoned.id);
  await cleanVending(DB, Date.now() + 8 * 86_400_000);
  assert.equal((await collect(one, a)).status, 404);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM vending_puzzles WHERE payload IS NULL').get().n, 3);
  assert.equal((await result(one, await poll(one), p)).data.code, 'duplicate');
});

test('stock hysteresis, simultaneous receipt, and cancelling a reservation reassigns its held puzzle', async t => {
  const { DB, call, pair, poll, result, makeOrder, collect } = await setup(t);
  DB.raw.exec('UPDATE vending_settings SET low_water=2,target=3');
  await pair(one, 'Phone');
  for (const puzzle of validPuzzles.slice(0, 3)) assert.equal((await result(one, await poll(one), puzzle)).status, 200);
  assert.equal(await poll(one), null);
  const quiet = DB.raw.prepare('SELECT last_seen FROM vending_devices').get().last_seen;
  assert.equal(await poll(one), null);
  assert.equal(DB.raw.prepare('SELECT last_seen FROM vending_devices').get().last_seen, quiet);
  assert.equal((await makeOrder(one, key(10), 1, false)).data.order.ready, 1);
  assert.equal(await poll(one), null, 'equal to low-water mark remains quiet');
  const stockClaims = await Promise.all([makeOrder(one, key(11), 2, false), makeOrder(two, key(12), 2, false)]);
  assert.deepEqual(stockClaims.map(r => r.status).sort(), [200, 409]);
  assert.equal((await call(trial)).data.shelf.available, 0);
  const waiting = key(13);
  assert.equal((await makeOrder(two, waiting, 1)).data.order.waiting, 1);
  const cancelled = (await call(trial, { action: 'cancel', id: key(10) }, { client: one })).data.order;
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.ready, 0);
  assert.equal((await collect(two, waiting)).data.puzzles.length, 1);
  assert(await poll(one), 'drop below low-water mark activates replenishment');
});

test('the global cap includes allocated puzzles and expired holds return stock', async t => {
  const { DB, pair, poll, result, makeOrder, collect } = await setup(t);
  const now = Date.now();
  const insert = DB.raw.prepare(`INSERT INTO vending_orders (id,client,count,original_count,reserve,created)
    VALUES (?,?,10,10,1,?)`);
  const old = key(100), recent = key(101);
  insert.run(old, await hash('x-nanpure-key:' + one), now - 8 * 86_400_000);
  insert.run(recent, await hash('x-nanpure-key:' + two), now);
  for (let i = 102; i < 120; i++) insert.run(key(i), key(i + 1000), now + i);
  await pair(one, 'Xperia');
  const puzzle = validPuzzles[0];
  assert.equal((await result(one, await poll(one), puzzle)).status, 200);
  assert.equal((await makeOrder(one, key(121), 1)).status, 429, 'a filled but uncollected puzzle still consumes a slot');
  await cleanVending(DB, now);
  const expired = (await collect(one, old)).data.order;
  assert.equal(expired.cancelled, true);
  assert.equal(expired.ready, 0);
  const restored = (await collect(two, recent)).data;
  assert.equal(restored.puzzles[0].uid, puzzle.uid);
  assert.equal(restored.puzzles[0].verification.maxProofClauses, puzzle.verification.maxProofClauses);
  assert.equal((await makeOrder(one, key(121), 1)).status, 200, 'expiry frees order slots');
});
