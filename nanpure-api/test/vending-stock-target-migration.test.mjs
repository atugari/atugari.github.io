import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db.mjs';

test('expanded vending catalogue target is 100 and legacy targets stay independent', t => {
  const { DB } = { DB: database() };
  t.after(() => DB.raw.close());
  const expanded = DB.raw.prepare("SELECT target FROM vending_catalogue WHERE expanded=1 ORDER BY profile LIMIT 1").get();
  const legacy = DB.raw.prepare("SELECT target FROM vending_catalogue WHERE expanded=0 ORDER BY profile LIMIT 1").get();
  assert.equal(expanded.target, 100);
  assert.equal(legacy.target, 3);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM vending_catalogue").get().n, 427);
});

test('catalogue counters remain trigger-maintained after migration', t => {
  const DB = database();
  t.after(() => DB.raw.close());
  const profile = DB.raw.prepare("SELECT profile FROM vending_catalogue WHERE expanded=1 LIMIT 1").get().profile;
  const before = DB.raw.prepare("SELECT available FROM vending_catalogue WHERE profile=?").get(profile).available;
  const puzzle = {
    digest: 'd'.repeat(64), uid: 'migration-test-puzzle', job_id: 'migration-test-job',
    payload: Buffer.from('test'), created: 1, order_id: null, collected: null, profile
  };
  DB.raw.prepare(`INSERT INTO vending_devices (id,token_hash,name,created,last_seen) VALUES ('migration-test-device','t'.repeat(64),'migration test',1,1)`).run();
  DB.raw.prepare(`INSERT INTO vending_jobs (id,device_id,lease,lease_until,created,done,digest,profile)
    VALUES ('migration-test-job','migration-test-device','l'.repeat(64),9999999999999,1,NULL,NULL,?)`).run(profile);
  DB.raw.prepare(`INSERT INTO vending_puzzles (digest,uid,job_id,payload,created,order_id,collected,profile)
    VALUES (?,?,?,?,?,NULL,NULL,?)`).run(puzzle.digest,puzzle.uid,puzzle.job_id,puzzle.payload,puzzle.created,profile);
  assert.equal(DB.raw.prepare("SELECT available FROM vending_catalogue WHERE profile=?").get(profile).available,before+1);
  DB.raw.prepare("DELETE FROM vending_puzzles WHERE digest=?").run(puzzle.digest);
  assert.equal(DB.raw.prepare("SELECT available FROM vending_catalogue WHERE profile=?").get(profile).available,before);
});
