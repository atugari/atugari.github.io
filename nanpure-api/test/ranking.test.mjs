import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { database } from './db.mjs';
import { hash } from '../src/http.js';
import { dailySummary, japanDay } from '../src/shared/daily-plan.js';
import { dailyScore, scorePeriod } from '../src/shared/ranking.js';

const key = '7'.repeat(64);
const identity = () => hash('x-nanpure-key:' + key);
async function ranking(DB, query = '', token = key) {
  const response = await worker.fetch(new Request('https://worker.test/api/ranking' + query, {
    headers: { Origin: 'https://atugari.github.io', ...(token ? { 'X-Nanpure-Key': token } : {}) },
  }), { DB });
  return { status: response.status, data: await response.json() };
}
function publish(DB, { player, day = japanDay(), level = 1, elapsed = 405000, name = '表示名', n, finished, ...extra } = {}) {
  const done = finished ?? Date.parse(day + 'T03:00:00Z');
  const row = { id: crypto.randomUUID(), player, day: day + ':cloudflare-v1', level, started: done - elapsed, finished: done, solved: done, elapsed, name, abandoned: null, excluded: null, ...extra };
  if (n) DB.raw.prepare('INSERT INTO daily_assignments VALUES(?,?,?,?,?,?) ON CONFLICT(slot) DO NOTHING').run(day + ':' + level, day, level, 'p-' + day + '-' + level, JSON.stringify({ n }), done);
  const fields = Object.keys(row);
  DB.raw.prepare('INSERT INTO attempts (' + fields.join(',') + ') VALUES (' + fields.map(() => '?').join(',') + ')').run(...Object.values(row));
  return row;
}

test('score rewards both completion and speed, with board-size normalization', () => {
  assert.equal(dailyScore(1, 9, 405000), 1250);
  assert.equal(dailyScore(2, 9, 405000), 2500);
  assert.equal(dailyScore(3, 9, 405000), 3750);
  assert.equal(dailyScore(1, 6, 180000), 1250);
  assert.equal(dailyScore(1, 16, 1280000), 1250);
  assert(dailyScore(1, 9, 60000) > dailyScore(1, 9, 600000));
  assert(dailyScore(1, 9, 86400000) >= 1000);
  assert(dailyScore(3, 16, 5000) <= 4500);
  for (const value of [-1, 0, 4999, NaN, Infinity, 5000.5]) assert.equal(dailyScore(1, 9, value), 0);
});

test('period boundaries are Japanese midnight, Monday and the first of the month', () => {
  assert.deepEqual(scorePeriod('today', Date.parse('2026-10-31T14:59:59Z')), { from: '2026-10-31', to: '2026-10-31' });
  assert.deepEqual(scorePeriod('today', Date.parse('2026-10-31T15:00:00Z')), { from: '2026-11-01', to: '2026-11-01' });
  assert.deepEqual(scorePeriod('week', Date.parse('2026-11-01T14:59:59Z')), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(scorePeriod('week', Date.parse('2026-11-01T15:00:00Z')), { from: '2026-11-02', to: '2026-11-02' });
  assert.deepEqual(scorePeriod('month', Date.parse('2026-12-31T15:00:00Z')), { from: '2027-01-01', to: '2027-01-01' });
  assert.deepEqual(scorePeriod('all', Date.parse('2026-11-01T15:00:00Z')), { from: null, to: '2026-11-02' });
});

test('world times use equal ranks, return the viewer outside the top 50 and never expose identifiers', async () => {
  const DB = database(), me = await identity(), day = japanDay();
  try {
    for (let i = 0; i < 61; i++) publish(DB, { player: i === 60 ? me : 'other-player-' + i, elapsed: i < 2 ? 10000 : 10000 + i * 1000, name: i === 60 ? '自分' : '同じ表示名', n: 9 });
    publish(DB, { player: 'private-solved', finished: null, solved: Date.now(), name: null });
    // A solved but unshared attempt contributes only to the existing completed counter.
    DB.raw.prepare('UPDATE attempts SET finished=NULL WHERE player=?').run('private-solved');
    publish(DB, { player: 'excluded', excluded: Date.now(), elapsed: 5000 });
    publish(DB, { player: 'abandoned', abandoned: Date.now(), elapsed: 5000 });
    publish(DB, { player: 'other-level', level: 2, elapsed: 5000 });
    const { status, data } = await ranking(DB);
    assert.equal(status, 200);
    assert.equal(data.rows.length, 50);
    assert.equal(data.totalPlayers, 61);
    assert.equal(data.completed, 62);
    assert.deepEqual(data.rows.slice(0, 3).map(row => row.rank), [1, 1, 3]);
    assert.equal(data.myRank, 61);
    assert.equal(data.myEntry.name, '自分');
    assert.equal(data.myEntry.isMe, true);
    assert.equal(data.rows.some(row => row.isMe), false);
    assert.equal(data.day, day);
    const serialized = JSON.stringify(data);
    for (const secret of [key, me, 'other-player-', 'private-solved', 'started', 'finished']) assert.equal(serialized.includes(secret), false);
    const anonymous = (await ranking(DB, '', null)).data;
    assert.equal(anonymous.myRank, null);
    assert.equal(anonymous.myEntry, null);
    assert.equal(anonymous.rows.some(row => row.isMe), false);
    const mine = (await ranking(DB, '?level=2')).data;
    assert.equal(mine.totalPlayers, 1);
    assert.equal(mine.myEntry, null);
  } finally { DB.raw.close(); }
});

test('score ranking aggregates published problems once per player, applies periods and keeps old editions separate', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-02T16:00:00Z')); // Tuesday Nov 3 in Japan.
  const DB = database(), me = await identity();
  try {
    publish(DB, { player: me, day: '2026-11-03', level: 1, name: '最新の名前', n: 9 });
    publish(DB, { player: me, day: '2026-11-02', level: 2, name: '前の名前', n: 9 });
    publish(DB, { player: me, day: '2026-11-01', level: 3, name: 'もっと前', n: 9 });
    publish(DB, { player: me, day: '2026-10-31', level: 1, n: 9 });
    publish(DB, { player: me, day: '2026-10-01', level: 1, n: 9 });
    publish(DB, { player: me, day: '2026-11-04', level: 3, n: 9 }); // Future entries cannot affect current scores.
    publish(DB, { player: 'same-name-other-person', day: '2026-11-03', level: 1, name: '最新の名前', n: 9 });
    const unpublished = publish(DB, { player: 'private', day: '2026-11-03', level: 3, n: 9 });
    DB.raw.prepare('UPDATE attempts SET finished=NULL WHERE id=?').run(unpublished.id);
    publish(DB, { player: 'excluded', day: '2026-11-03', level: 3, excluded: Date.now() });
    publish(DB, { player: 'abandoned', day: '2026-11-03', level: 3, abandoned: Date.now() });
    publish(DB, { player: 'unfinished', day: '2026-11-03', level: 3, solved: null });
    publish(DB, { player: 'invalid-time', day: '2026-11-03', elapsed: 1 });
    const old = publish(DB, { player: me, day: '2026-09-30', level: 3, n: 9 });
    DB.raw.prepare('UPDATE attempts SET day=? WHERE id=?').run('2026-09-30:book-v2', old.id);
    const cases = [['today', 1250, 1, '2026-11-03'], ['week', 3750, 2, '2026-11-02'], ['month', 7500, 3, '2026-11-01'], ['all', 10000, 5, null]];
    for (const [period, points, clears, from] of cases) {
      const { status, data } = await ranking(DB, '?mode=score&period=' + period);
      assert.equal(status, 200);
      assert.equal(data.myEntry.score, points, period);
      assert.equal(data.myEntry.clears, clears, period);
      assert.equal(data.myEntry.name, '最新の名前');
      assert.equal(data.myEntry.isMe, true);
      assert.equal(data.myRank, 1);
      assert.equal(data.totalPlayers, 2);
      assert.equal(data.completed, clears + 1);
      assert.equal(data.from, from);
      assert.equal(data.to, '2026-11-03');
    }
    const tied = (await ranking(DB, '?mode=score')).data;
    assert.deepEqual(tied.rows.map(row => row.rank), [1, 1]);
    assert.equal(tied.rows.filter(row => row.isMe).length, 1);
    assert.equal(DB.raw.prepare('SELECT day FROM attempts WHERE id=?').get(old.id).day, '2026-09-30:book-v2');
    assert.throws(() => publish(DB, { player: me, day: '2026-11-03', level: 1 }), /UNIQUE/);
  } finally { DB.raw.close(); }
});

test('scores outside the top 50, missing assignment fallback, moderation and invalid requests', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-10-22T00:00:00Z'));
  const DB = database(), me = await identity(), day = japanDay();
  try {
    for (let i = 0; i < 55; i++) publish(DB, { player: 'fast-' + i, elapsed: 5000 + i * 1000 });
    const own = publish(DB, { player: me, elapsed: 999999, name: 'My record' });
    let result = (await ranking(DB, '?mode=score&period=all')).data;
    assert.equal(result.rows.length, 50);
    assert.equal(result.totalPlayers, 56);
    assert.equal(result.myRank, 56);
    assert.equal(result.myEntry.score, dailyScore(1, dailySummary(day, 1).n, 999999));
    DB.raw.prepare('UPDATE attempts SET excluded=? WHERE id=?').run(Date.now(), own.id);
    result = (await ranking(DB, '?mode=score&period=all')).data;
    assert.equal(result.totalPlayers, 55);
    assert.equal(result.myEntry, null);
    for (const query of ['?mode=invalid', '?mode=score&period=year', '?level=4', '?level=NaN']) assert.equal((await ranking(DB, query)).status, 400);
    assert.equal((await ranking(DB, '?mode=time&period=week')).data.period, 'today');
    DB.raw.exec('DELETE FROM attempts');
    result = (await ranking(DB, '?mode=score&period=month')).data;
    assert.deepEqual(result.rows, []);
    assert.equal(result.totalPlayers, 0);
    assert.equal(result.completed, 0);
    assert.equal(result.myRank, null);
  } finally { DB.raw.close(); }
});
