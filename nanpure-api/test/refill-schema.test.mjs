import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db.mjs';

test('refill baseline seeds all 427 profiles without changing the published 104619 count', t => {
  const DB = database();
  t.after(() => DB.raw.close());
  const snapshot = DB.raw.prepare('SELECT * FROM refill_baseline_snapshots WHERE id=1').get();
  assert.equal(snapshot.catalog_release, '2026.10.27.65');
  assert.equal(snapshot.total_count, 104619);
  assert.equal(snapshot.profile_count, 427);

  const rows = DB.raw.prepare('SELECT * FROM refill_profiles ORDER BY profile_key').all();
  assert.equal(rows.length, 427);
  assert.equal(rows.reduce((sum, row) => sum + row.baseline_count, 0), 104619);
  assert.equal(rows.filter(row => row.baseline_count > 0).length, 302);
  assert.equal(rows.filter(row => row.baseline_count === 0).length, 125);
  assert.equal(rows.filter(row => row.baseline_count > 0 && row.baseline_count < 100).length, 82);
  assert.equal(rows.filter(row => row.baseline_count >= 100).length, 220);

  for (const row of rows) {
    assert.equal(row.target_count, 100);
    assert.equal(row.enabled, 0, 'profiles stay disabled until server validation and catalogue export are ready');
    assert.equal(row.catalog_release, snapshot.catalog_release);
    const descriptor = JSON.parse(row.descriptor);
    assert.equal(descriptor.profile, row.profile_key);
    assert.equal(row.baseline_count > 0, row.catalogue_key !== null);
  }
});
