import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import pilot from '../pilot/worker.js';
import {publicPath} from '../pilot/public-vending.js';
import {hash, siteOrigin} from '../src/http.js';
import {database} from './db.mjs';

const trial = 'https://trial.test';
const key = n => n.toString(16).padStart(64, '0');
const owner = key(101), device = key(102), lease = key(103);
const classic = 'normal:9:18:0::::';
const alternate = 'normal:9:1:0::::';
const expanded = 'antiknight:9:1:0::::';
const [{puzzle: verifiedPuzzle}] = JSON.parse(gunzipSync(Buffer.from(readFileSync(
  new URL('../../nanpure/collection/data/C149/0000.gz.b64', import.meta.url), 'utf8'
), 'base64')));

async function setup(t) {
  const DB = database();
  DB.raw.exec(readFileSync(new URL('../pilot/session.sql', import.meta.url), 'utf8'));
  t.after(() => DB.raw.close());
  const env = {DB, OWNER_KEY_HASH: await hash(owner), VENDING_ENABLED: '1',
    VENDING_CATALOGUE_ENABLED: '1', VENDING_PUBLIC_PLAY: '1'};
  DB.raw.prepare('INSERT INTO vending_devices (id,token_hash,name,created,last_seen) VALUES (?,?,?,?,?)')
    .run(key(99), await hash('vending-device:' + device), 'Private device', 1, 1);
  const makeJob = (id, profile) => DB.raw.prepare(`INSERT INTO vending_jobs
    (id,device_id,lease,lease_until,created,profile) VALUES (?,?,?,?,?,?)`)
    .run(id, key(99), lease, Date.now() + 600_000, Date.now(), profile);
  function seed(n, profile = classic) {
    const id = key(10_000 + n), uid = `seed_${n}`;
    makeJob(id, profile);
    const payload = {...verifiedPuzzle, uid, id: uid, verification: {method: 'private'}};
    DB.raw.prepare(`INSERT INTO vending_puzzles (digest,uid,job_id,payload,created,profile)
      VALUES (?,?,?,?,?,?)`).run(key(20_000 + n), uid, id, new TextEncoder().encode(JSON.stringify(payload)), n, profile);
    return payload;
  }
  const request = (path = publicPath, {data, method = data ? 'POST' : 'GET', origin = siteOrigin,
    browser, ip, headers = {}} = {}) => pilot.fetch(new Request(trial + path, {
    method,
    headers: {
      ...(origin !== null ? {Origin: origin} : {}), ...(browser ? {'X-Nanpure-Key': browser} : {}),
      ...(ip ? {'CF-Connecting-IP': ip} : {}), ...(data ? {'Content-Type': 'application/json'} : {}), ...headers
    },
    ...(data ? {body: JSON.stringify(data)} : {})
  }), env);
  const claim = (id, {browser = key(1), profile = classic, ip = '192.0.2.1', ...options} = {}) =>
    request(publicPath, {data: {action: 'take', id: key(id), profile}, browser, ip, ...options});
  return {env, DB, makeJob, seed, request, claim};
}

test('the public route is explicitly enabled and grants no credentialed or cross-site private access', async t => {
  const {env, request, claim} = await setup(t);
  delete env.VENDING_PUBLIC_PLAY;
  assert.equal((await request()).status, 503);
  env.VENDING_PUBLIC_PLAY = '1';
  const list = await request();
  assert.equal(list.headers.get('access-control-allow-origin'), siteOrigin);
  assert.equal(list.headers.get('access-control-allow-credentials'), null);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await list.json(), {profiles: []});

  const preflight = await request(publicPath, {method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-nanpure-key'
  }});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), siteOrigin);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type, X-Nanpure-Key');
  assert.equal((await request(publicPath, {method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization'
  }})).status, 405);

  const hostile = await request(publicPath, {origin: 'https://untrusted.test'});
  assert.equal(hostile.status, 403);
  assert.equal(hostile.headers.get('access-control-allow-origin'), null);
  assert.equal((await claim(1, {origin: 'https://untrusted.test'})).status, 403);
  assert.equal((await claim(1, {origin: null})).status, 403);
  assert.equal((await claim(1, {headers: {Authorization: 'Bearer ' + owner}})).status, 403);
  assert.equal((await claim(1, {headers: {Cookie: 'any=private'}})).status, 403);
  assert.equal((await request('/api/vending')).status, 403);
  assert.equal((await request('/api/vending', {origin: trial})).status, 401);
  assert.equal((await request('/api/vending/admin', {origin: trial})).status, 403);
  assert.equal((await request('/api/vending/worker', {origin: null, data: {action: 'poll'}})).status, 403);
  const login = await request('/nanpure/vending/', {origin: null});
  assert.equal(login.status, 200);
  assert.match(await login.text(), /試験用の管理者キー/);
});

test('a validated Android refill can be played; other public clients cannot queue or see private receipts', async t => {
  const {DB, env, makeJob, seed, request, claim} = await setup(t);
  const job = key(110);
  makeJob(job, classic);
  const submission = await request('/api/vending/worker', {origin: null,
    headers: {Authorization: 'Bearer ' + device}, data: {action: 'result', id: job, lease, p: verifiedPuzzle}});
  assert.deepEqual(await submission.json(), {ok: true});
  seed(2, expanded);

  env.VENDING_CATALOGUE_ENABLED = '0';
  assert.deepEqual((await (await request()).json()).profiles, [
    {profile: classic, kind: 'normal', n: 9, level: 18, available: 1}
  ]);
  assert.equal((await claim(111, {profile: expanded})).status, 409);
  env.VENDING_CATALOGUE_ENABLED = '1';
  assert.equal((await (await request()).json()).profiles.length, 2);
  for (const data of [
    {action: 'order', id: key(111), profile: classic, count: 1, reserve: true},
    {action: 'take', id: key(111), profile: classic, count: 10},
    {action: 'take', id: key(111), profile: classic, reserve: true},
    {action: 'collect', id: key(111), profile: classic}
  ]) assert.equal((await request(publicPath, {data, browser: key(1)})).status, 400);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM vending_orders').get().n, 0);

  const [left, right] = await Promise.all([claim(111), claim(112, {browser: key(2), ip: '192.0.2.2'})]);
  assert.deepEqual([left.status, right.status].sort(), [200, 409]);
  const succeeded = left.status === 200 ? left : right;
  const winner = left.status === 200 ? 111 : 112;
  const browser = left.status === 200 ? key(1) : key(2);
  const reply = await succeeded.json();
  assert.equal(reply.puzzle.uid, verifiedPuzzle.uid);
  assert.equal(reply.puzzle.id, verifiedPuzzle.id);
  assert.deepEqual(reply.puzzle.puzzle, verifiedPuzzle.puzzle);
  assert.ok(reply.puzzle.logicProof.length);
  assert.equal(reply.puzzle.verification, undefined);
  assert.deepEqual(await (await claim(winner, {browser})).json(), reply);
  assert.equal((await claim(winner, {browser, profile: expanded})).status, 409);
  assert.equal((await claim(winner, {browser: key(3)})).status, 409);
  const [row] = DB.raw.prepare('SELECT id,client,reserve,assigned,received,closed FROM vending_orders').all();
  assert.match(row.id, /^public:/);
  assert.match(row.client, /^public:/);
  assert.deepEqual([row.reserve, row.assigned, row.received, Boolean(row.closed)], [0, 1, 1, true]);
  assert.equal(DB.raw.prepare('SELECT SUM(waiting) AS n FROM vending_catalogue').get().n, 0);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM vending_jobs').get().n, 2);

  const session = key(120);
  DB.raw.prepare('INSERT INTO pilot_sessions (token_hash,expires) VALUES (?,?)')
    .run(await hash('nanpure-vending-pilot:' + session), Date.now() + 60_000);
  const privateHeaders = {Cookie: '__Host-nanpure-pilot=' + session};
  const orders = await request('/api/vending', {origin: trial, browser, headers: privateHeaders});
  assert.deepEqual((await orders.json()).orders, []);
  const collect = await request('/api/vending', {origin: trial, browser, headers: privateHeaders,
    data: {action: 'collect', id: row.id}});
  assert.equal(collect.status, 400);
});

test('new claims share atomic browser, source-IP and global quotas while matching retries still work', async t => {
  const {DB, seed, claim} = await setup(t);
  for (let i = 1; i <= 34; i++) seed(i, alternate);
  const take = (id, options = {}) => claim(id, {profile: alternate, ...options});
  const sameId = await Promise.all([take(1), take(1)]);
  assert.equal(sameId[0].status, 200);
  assert.deepEqual(await sameId[0].json(), await sameId[1].json());
  for (const id of [2, 3]) assert.equal((await take(id)).status, 200);
  assert.equal((await take(4)).status, 429);
  for (let id = 4; id <= 8; id++) assert.equal((await take(id, {browser: key(id)})).status, 200);
  assert.equal((await take(9, {browser: key(9)})).status, 429);
  const rest = await Promise.all(Array.from({length: 23}, (_, i) =>
    take(9 + i, {browser: key(9 + i), ip: `192.0.2.${9 + i}`})));
  assert.equal(rest.filter(response => response.status === 200).length, 22);
  assert.equal(rest.filter(response => response.status === 429).length, 1);
  assert.equal((await take(1)).status, 200);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM vending_orders WHERE received=1 AND closed IS NOT NULL').get().n, 30);
  assert.equal(DB.raw.prepare('SELECT available FROM vending_catalogue WHERE profile=?').get(alternate).available, 4);
});
