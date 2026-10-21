import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const url = 'https://puzzle-api.puzzle-hub-4826.workers.dev/api/health';
const request = (init) => new Request(url, init);
const database = (names = []) => ({ prepare: () => ({ bind: () => ({
  all: async () => ({ results: names.map(name => ({ name })) }),
}) }) });

test('empty database connects but does not claim the migration is complete', async () => {
  const response = await worker.fetch(request(), { DB: database() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.database, 'connected');
  assert.equal(body.schema, 'pending');
  assert.equal(body.gameApi, 'pending');
  assert.doesNotMatch(JSON.stringify(body), /7bb28b61|database_id|SELECT/);
});

test('missing or failing D1 gives an error without exposing provider details', async () => {
  for (const env of [{}, { DB: { prepare() { throw Error('secret-provider-details'); } } }]) {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, database: 'unavailable' });
  }
});

test('only the actual GitHub origin gets a CORS allow header', async () => {
  const good = await worker.fetch(request({ headers: { Origin: 'https://atugari.github.io' } }), { DB: database() });
  assert.equal(good.headers.get('Access-Control-Allow-Origin'), 'https://atugari.github.io');
  assert.equal(good.headers.get('Vary'), 'Origin');
  for (const origin of ['null', 'https://atugari.github.io.evil.test', 'https://evil.test']) {
    const bad = await worker.fetch(request({ headers: { Origin: origin } }), {});
    assert.equal(bad.status, 403);
    assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
  }
});

test('public callers cannot mutate the database or reach an SQL endpoint', async () => {
  const env = { DB: { prepare() { throw Error('database must not be touched'); } } };
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const response = await worker.fetch(request({ method }), env);
    assert.equal(response.status, 405);
  }
  assert.equal((await worker.fetch(new Request(new URL('/api/sql', url)), env)).status, 404);
});

test('GET preflight works, write preflight is rejected', async () => {
  const headers = { Origin: 'https://atugari.github.io', 'Access-Control-Request-Method': 'GET' };
  const response = await worker.fetch(request({ method: 'OPTIONS', headers }), {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  headers['Access-Control-Request-Method'] = 'POST';
  assert.equal((await worker.fetch(request({ method: 'OPTIONS', headers }), {})).status, 405);
});
