import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('read-only collection refill audit validates a bounded real collection slice', () => {
  const raw = execFileSync(process.execPath, [
    'scripts/inspect-vending-collection-refill.mjs', '--limit-config', '1'
  ], { cwd: apiRoot, encoding: 'utf8', timeout: 120000 });
  const result = JSON.parse(raw);
  assert.equal(result.configsChecked, 1);
  assert.equal(result.matchedConfigs, 1);
  assert.ok(result.packsChecked > 0);
  assert.ok(result.recordsRead > 0);
  assert.ok(result.validRecords > 0);
  assert.equal(result.invalidRecords, 0);
});
