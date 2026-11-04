import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createContext, runInContext } from 'node:vm';
import worker from '../src/index.js';
import { database } from './db.mjs';
import { hash } from '../src/http.js';
import { cleanVending } from '../src/vending.js';
import { fingerprintPuzzle } from '../src/shared/stock-puzzle.js';
import { listProfiles } from '../../android/nanpure-vending-worker/prepare-engine.cjs';

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

function notebookGenerator() {
  const html = readFileSync(new URL('../../nanpure/releases/2026.11.04.95/notebook/index.html', import.meta.url), 'utf8');
  const math = Object.create(Math);
  let seed = 0x5b6aa6c3;
  math.random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
  const context = createContext({ Math: math, performance, crypto, TextEncoder, TextDecoder });
  context.window = context.self = context;
  for (const [, name, source] of html.matchAll(/<script id="([^"]+)">([\s\S]*?)<\/script>/g))
    if (name.startsWith('core-') || name === 'common-source' || name === 'generator-source')
      runInContext(source, context);
  return ({ kind = 'normal', n, level, complexity }) =>
    context.NPGenerate({ kind, n, level, count: 1, ...(complexity == null ? {} : { complexity }) }, () => {});
}

test('profile leases verify exact release difficulty, keep legacy isolated and replay safely', async t => {
  const { DB, call, pair, mobile, poll, result, collect } = await setup(t);
  const generate = notebookGenerator();
  await pair(one, 'Legacy'); await pair(two, 'Profile-aware');
  assert.equal((await call(trial)).data.profiles, undefined);
  const list = (await call(trial + '?profiles=1')).data.profiles.filter(p => p.kind === 'normal');
  const pilot = 'normal:9:18:0::::';
  assert.deepEqual(list.map(p => [p.n, p.level]), [[9, 1], [9, 2], [9, 3], [9, 18], [16, 1], [25, 1]]);
  const reserve = (id, profile) => call(trial, { action: 'order', id, count: 1, reserve: true, profile }, { client: one });
  assert.equal((await reserve(key(200), 'normal:100:10:0::::')).status, 400);
  for (const [index, profile] of list.filter(p => p.profile !== pilot).entries()) {
    const id = key(index + 201);
    assert.equal((await reserve(id, profile.profile)).data.order.profile, profile.profile);
    assert.equal((await reserve(id, pilot)).status, 409);
    const legacyJob = await poll(one);
    assert.equal(legacyJob.level, 18);
    assert.equal(legacyJob.profile, undefined);
    const pollRequest = { action: 'poll', version: 2, ready: [profile.profile], stock: { count: 11, bytes: 12435 } };
    const [first, second] = await Promise.all([mobile(two, pollRequest), mobile(two, pollRequest)]);
    const { job, version } = first.data;
    assert.equal(version, 2);
    assert.equal(second.data.job.id, job.id);
    assert.equal(job.profile, profile.profile);
    const p = generate(job);
    assert.equal((await result(two, job, { ...p, rating: { ...p.rating, level: 18 } })).status, 400);
    assert.equal((await result(two, job, { ...p, puzzle: Array(p.puzzle.length).fill(0) })).status, 400);
    assert.equal((await result(two, job, { ...p, puzzle: p.solution })).status, 400);
    assert.deepEqual(await result(two, job, p), { status: 200, data: { ok: true } });
    assert.deepEqual(await result(two, job, p), { status: 200, data: { ok: true } });
    const receipt = (await collect(one, id)).data;
    assert.equal(receipt.order.profile, profile.profile);
    assert.equal(receipt.puzzles[0].uid, p.uid);
    assert.equal(receipt.puzzles[0].rating.level, p.level);
    assert.equal(receipt.puzzles[0].verification.unique, true);
  }
  const { data: overview } = await call(admin + '?profiles=1', null, { auth: owner });
  assert.equal(overview.profiles.filter(p => p.kind === 'normal').length, list.length);
  assert.equal(overview.devices.find(d => d.name === 'Profile-aware').stockCount, 11);
  assert.equal(overview.devices.find(d => d.name === 'Profile-aware').stockBytes, 12435);
  const job = (await mobile(two, { action: 'poll', version: 2, stock: { count: 21, bytes: 22222 } })).data.job;
  assert(job);
  assert.equal(DB.raw.prepare('SELECT stock_count FROM vending_devices WHERE name=?').get('Profile-aware').stock_count, 11);
});

test('empty profiles get turns and missing profiles do not mix reservations on release or cancellation', async t => {
  const { DB, call, pair, mobile, result, collect } = await setup(t);
  const generate = notebookGenerator();
  await pair(one, 'Phone');
  DB.raw.exec('UPDATE vending_profiles SET target=1; UPDATE vending_settings SET low_water=1,target=1');
  const visited = new Set();
  const profiles = (await call(trial + '?profiles=1')).data.profiles;
  for (const _ of profiles) {
    const { data: { job } } = await mobile(one, { action: 'poll', version: 2 });
    assert(!visited.has(job.profile));
    visited.add(job.profile);
    const p = job.level === 18 ? validPuzzles[0] : generate(job);
    assert.equal((await result(one, job, p)).status, 200);
  }
  assert.equal((await mobile(one, { action: 'poll', version: 2 })).data.job, null);
  const a = key(230), b = key(231), c = key(232);
  const profile = 'normal:16:1:0::::', other = 'normal:25:1:0::::';
  const reserve = (id, which) => call(trial, { action: 'order', id, count: 1, reserve: true, profile: which }, { client: one });
  assert.equal((await reserve(a, profile)).data.order.ready, 1);
  assert.equal((await reserve(b, other)).data.order.ready, 1);
  assert.equal((await reserve(c, profile)).data.order.ready, 0);
  assert.equal((await call(trial, { action: 'cancel', id: a }, { client: one })).data.order.ready, 0);
  assert.equal((await collect(one, c)).data.puzzles[0].n, 16);
  assert.equal((await collect(one, b)).data.puzzles[0].n, 25);
});

test('variant shelves deliver verified constraints and reject equivalent stock', async t => {
  const { DB, call, pair, mobile, poll, result, collect } = await setup(t);
  const generate = notebookGenerator();
  await pair(one, 'Variant-capable phone');
  await pair(two, 'Legacy phone');
  assert.equal((await poll(two)).level, 18);

  const variants = (await call(trial + '?profiles=1')).data.profiles.filter(p => p.kind !== 'normal');
  assert.deepEqual(variants.map(({ profile, kind, n, level, complexity }) => [profile, kind, n, level, complexity]), [
    ['jigsaw:25:1:2::::', 'jigsaw', 25, 1, 2], ['killer:16:1:2::::', 'killer', 16, 1, 2]
  ]);
  for (const [i, profile] of variants.entries()) {
    const id = key(300 + i * 2);
    const order = (id, reserve) => call(trial, { action: 'order', id, count: 1, reserve, profile: profile.profile }, { client: one });
    const lease = async () => {
      const { data: { job } } = await mobile(one, { action: 'poll', version: 2 });
      assert.equal(job.profile, profile.profile);
      assert.equal(job.complexity, 2);
      return job;
    };

    assert.equal((await order(id, true)).data.order.waiting, 1);
    const job = await lease(), p = generate(job);
    const jigsaw = job.kind === 'jigsaw';
    const malformed = jigsaw ? { regions: Array(p.puzzle.length).fill(0) }
      : { cages: [{ ...p.cages[0], sum: p.cages[0].sum + 1 }, ...p.cages.slice(1)] };
    for (const change of [malformed, { complexity: 3 }, { rating: { ...p.rating, level: 2 } }, { puzzle: p.solution }])
      assert.equal((await result(one, job, { ...p, ...change })).status, 400);
    assert.equal((await result(one, job, { ...p, padding: 'x'.repeat(200_000) })).status, 413);
    assert.deepEqual(await result(one, job, p), { status: 200, data: { ok: true } });

    // Equivalent labels and cage/cell order must produce the same durable fingerprint.
    const equivalent = jigsaw ? { ...p, regions: p.regions.map(region => (region + 1) % p.n) }
      : { ...p, cages: p.cages.toReversed().map(cage => ({ ...cage, cells: cage.cells.toReversed() })) };
    assert.deepEqual(await result(one, job, equivalent), { status: 200, data: { ok: true } });
    const { order: receipt, puzzles: [received] } = (await collect(one, id)).data;
    assert.equal(receipt.profile, profile.profile);
    assert.equal(received.uid, p.uid);
    assert.equal(received.id, p.id);
    assert.equal(received.complexity, 2);
    assert.equal(received.rating.level, 1);
    assert.equal(received.verification.unique, true);
    assert.deepEqual(received.grid, [...p.puzzle]);
    assert.equal(received.regions.length, p.n * p.n);
    if (!jigsaw) assert.equal(received.cages.length, p.cages.length);
    const digest = DB.raw.prepare('SELECT digest FROM vending_puzzles WHERE uid=?').get(p.uid).digest;
    const original = { ...p, regions: jigsaw ? p.regions : received.regions };
    assert.equal(digest, await fingerprintPuzzle(original));
    assert.equal(digest, await fingerprintPuzzle(received));

    const next = key(301 + i * 2);
    assert.equal((await order(next, false)).status, 409);
    assert.equal((await order(next, true)).status, 200);
    const duplicate = await result(one, await lease(), { ...equivalent, uid: 'variant_equivalent_' + i });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.code, 'duplicate');
    await call(trial, { action: 'cancel', id: next }, { client: one });
    const open = await lease();
    assert.equal((await mobile(one, { action: 'release', id: open.id, lease: open.lease })).status, 200);
  }
});

test('the gated catalogue exactly matches all 427 APK conditions and serves registered-device stock', async t => {
  const { DB, env, call, mobile, pair, poll, result, collect } = await setup(t);
  const list = async () => (await call(trial + '?profiles=1')).data.profiles;
  assert.equal((await list()).length, 8);
  assert((await list()).every(p => p.verification === 'server'));
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM vending_profiles').get().n, 8,
    'the old Worker table does not advertise the new conditions');

  const profile = 'diagonal:9:1:0::::';
  const reserve = (id, which, count = 1) => call(trial,
    { action: 'order', id, count, reserve: true, profile: which }, { client: one });
  assert.equal((await reserve(key(400), profile)).status, 400);
  env.VENDING_CATALOGUE_ENABLED = '1';
  const expanded = await list();
  const appProfiles = listProfiles();
  const fromApi = new Map(expanded.map(p => [p.profile, p]));
  assert.equal(fromApi.size, 427);
  assert.equal(expanded.filter(p => p.verification === 'server').length, 9);
  for (const p of appProfiles) {
    const { kind, n, level, complexity, multiShape, linkedShape } = fromApi.get(p.key);
    assert.deepEqual([kind, n, level, complexity, multiShape, linkedShape],
      [p.kind, p.n, p.level, p.complexity, p.multiShape, p.linkedShape], p.key);
  }
  assert.equal(fromApi.get('normal:100:1:0::::').maxCount, 1);
  assert.equal(fromApi.get('normal:49:1:0::::').maxCount, 3);
  assert.equal((await reserve(key(401), 'normal:100:1:0::::', 2)).status, 400);
  assert.equal((await reserve(key(402), 'normal:49:1:0::::', 4)).status, 400);
  const id = key(403);
  assert.equal((await reserve(id, profile)).data.order.waiting, 1);
  await pair(one, 'App 0.2.0');
  await pair(two, 'Legacy');
  assert.equal((await poll(two)).level, 18);
  const { data: { job } } = await mobile(one, { action: 'poll', version: 2, ready: appProfiles.map(p => p.key) });
  assert.equal(job.profile, profile);
  const p = notebookGenerator()(job);
  assert.equal((await result(one, job, { ...p, kind: 'normal' })).status, 400);
  assert.deepEqual(await result(one, job, p), { status: 200, data: { ok: true } });
  assert.deepEqual(await result(one, job, p), { status: 200, data: { ok: true } });
  assert.equal(DB.raw.prepare('SELECT payload FROM vending_puzzles WHERE uid=?').get(p.uid).payload[0], '{'.charCodeAt(0));
  // Disabling the rollout freezes new orders while preserving existing receipts.
  env.VENDING_CATALOGUE_ENABLED = '0';
  assert.equal((await list()).length, 8);
  assert.equal((await reserve(id, profile)).status, 200);
  const { puzzles: [received] } = (await collect(one, id)).data;
  assert.equal(received.uid, p.uid);
  assert.equal(received.verification.method, 'registered-refill-generator');
  assert.equal(received.verification.uniquenessCheckedBy, 'registered-device');
  assert.equal(received.verification.difficultyCheckedBy, 'registered-device');
  assert.equal((await reserve(key(404), profile)).status, 400);
});

test('catalogue reserves first, backs off long unfinished releases, and keeps counts accurate', async t => {
  const { DB, env, call, mobile, pair, result } = await setup(t);
  env.VENDING_CATALOGUE_ENABLED = '1';
  await pair(one, 'App 0.2.0');
  const profile = 'normal:100:1:0::::';
  const orderId = key(410);
  const order = (id, which) => call(trial, { action: 'order', id, count: 1, reserve: true, profile: which }, { client: one });
  const pollModern = async () => (await mobile(one, { action: 'poll', version: 2 })).data.job;
  const release = job => mobile(one, { action: 'release', id: job.id, lease: job.lease });
  const cancel = id => call(trial, { action: 'cancel', id }, { client: one });
  const checkCounters = () => assert.equal(DB.raw.prepare(`SELECT COUNT(*) AS n FROM vending_catalogue c
    WHERE available<>(SELECT COUNT(*) FROM vending_puzzles p
      WHERE p.profile=c.profile AND p.order_id IS NULL AND p.payload IS NOT NULL)
    OR waiting<>(SELECT COALESCE(SUM(o.count-o.assigned),0) FROM vending_orders o
      WHERE o.profile=c.profile AND o.cancelled IS NULL AND o.assigned<o.count)`).get().n, 0);
  await order(orderId, profile);
  checkCounters();
  let job = await pollModern();
  assert.equal(job.profile, profile);
  await release(job);
  const quick = DB.raw.prepare('SELECT retry_after,failures FROM vending_catalogue WHERE profile=?').get(profile);
  assert(quick.retry_after > Date.now());
  assert.equal(quick.failures, 0);
  DB.raw.prepare('UPDATE vending_catalogue SET retry_after=0 WHERE profile=?').run(profile);
  job = await pollModern();
  assert.equal(job.profile, profile);
  DB.raw.prepare('UPDATE vending_jobs SET created=? WHERE id=?').run(Date.now() - 61_000, job.id);
  await release(job);
  assert(DB.raw.prepare('SELECT retry_after FROM vending_catalogue WHERE profile=?').get(profile).retry_after > Date.now());
  const other = await pollModern();
  assert.notEqual(other.profile, profile);
  await release(other);
  DB.raw.prepare('UPDATE vending_catalogue SET retry_after=0 WHERE profile=?').run(profile);
  job = await pollModern();
  assert.equal(job.profile, profile);
  const p = notebookGenerator()(job);
  assert.deepEqual(await result(one, job, p), { status: 200, data: { ok: true } });
  assert.equal(DB.raw.prepare('SELECT failures FROM vending_catalogue WHERE profile=?').get(profile).failures, 0);
  const stored = DB.raw.prepare('SELECT payload FROM vending_puzzles WHERE uid=?');
  assert.equal(stored.get(p.uid).payload[0], '{'.charCodeAt(0));
  checkCounters();
  await cancel(orderId);
  checkCounters();
  assert.equal(DB.raw.prepare('SELECT available FROM vending_catalogue WHERE profile=?').get(profile).available, 1);
  const next = key(411);
  assert.equal((await order(next, profile)).data.order.ready, 1);
  checkCounters();
  const { data: receipt } = await call(trial, { action: 'collect', id: next }, { client: one });
  assert.equal(receipt.puzzles[0].uid, p.uid);
  assert.equal(receipt.puzzles[0].verification.unique, true);
  assert.equal(receipt.puzzles[0].n, 100);
  checkCounters();
  const old = validPuzzles[0], oldOrder = key(412), oldProfile = 'normal:9:18:0::::';
  await order(oldOrder, oldProfile);
  const legacyJob = (await mobile(one, { action: 'poll' })).data.job;
  assert.deepEqual(await result(one, legacyJob, old), { status: 200, data: { ok: true } });
  assert.deepEqual([...stored.get(old.uid).payload.subarray(0, 2)], [0x1f, 0x8b]);
  const { data: legacyReceipt } = await call(trial, { action: 'collect', id: oldOrder }, { client: one });
  assert.equal(legacyReceipt.puzzles[0].uid, old.uid);
  checkCounters();
});
