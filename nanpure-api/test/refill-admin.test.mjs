import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { database } from './db.mjs';
import { hash } from '../src/http.js';

const ownerKey = 'a'.repeat(64);
const origin = 'https://atugari.github.io';

async function setup(t) {
  const DB = database();
  const env = { DB, OWNER_KEY_HASH: await hash(ownerKey) };
  t.after(() => DB.raw.close());
  async function call({ method = 'GET', auth, query = '' } = {}) {
    const response = await worker.fetch(new Request(origin + '/api/refill/admin' + query, {
      method,
      headers: { Origin: origin, ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }
    }), env);
    return { status: response.status, data: await response.json() };
  }
  return { call };
}

test('refill inventory inspection is owner-only and does not expose profile rows by default', async t => {
  const { call } = await setup(t);
  assert.equal((await call()).status, 403);
  assert.equal((await call({ auth: 'b'.repeat(64) })).status, 403);
  const response = await call({ auth: ownerKey });
  assert.equal(response.status, 200);
  assert.equal(response.data.enabled, false);
  assert.equal(response.data.snapshot.baselineCount, 104619);
  assert.equal(response.data.snapshot.profileCount, 427);
  assert.equal(response.data.totals.profileCount, 427);
  assert.equal(response.data.totals.baselineCount, 104619);
  assert.equal(response.data.totals.shortageProfiles, 207);
  assert.equal(response.data.totals.emptyProfiles, 125);
  assert.equal(response.data.totals.enabledProfiles, 0);
  assert.equal('profiles' in response.data, false);
});

test('refill inventory detail calculates the 100-puzzle shortage from the published baseline', async t => {
  const { call } = await setup(t);
  const response = await call({ auth: ownerKey, query: '?profiles=1' });
  assert.equal(response.status, 200);
  assert.equal(response.data.profiles.length, 427);
  const row = response.data.profiles.find(item => item.profileKey === 'normal:100:3:0::::');
  assert(row);
  assert.equal(row.baselineCount, 60);
  assert.equal(row.pendingItems, 0);
  assert.equal(row.inventoryCount, 60);
  assert.equal(row.shortage, 40);
  assert.equal(row.descriptor.complexity, 0);
});

test('refill inventory inspection is read-only', async t => {
  const { call } = await setup(t);
  assert.equal((await call({ method: 'POST', auth: ownerKey })).status, 405);
});
