const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nanpure-refill-engine-'));
try {
  execFileSync(process.execPath, [path.join(__dirname, 'prepare-engine.cjs'), path.join(temp, 'engine.js')]);
  const result = [];
  const worker = vm.createContext({performance, postMessage: message => result.push(message)});
  worker.self = worker;
  worker.importScripts = name => vm.runInContext(fs.readFileSync(path.join(temp, name), 'utf8'), worker);
  const asset = name => fs.readFileSync(path.join(__dirname, 'src/main/assets', name), 'utf8');
  vm.runInContext(asset('round.js'), worker);
  const profiles = JSON.parse(fs.readFileSync(path.join(temp, 'profiles.json'), 'utf8'));
  assert.equal(profiles.length, 427);
  assert.equal(new Set(profiles.map(profile => profile.key)).size, 427);
  assert.equal(new Set(profiles.map(profile => profile.kind)).size, 23);

  const pilot = 'normal:9:18:0::::';
  let id = 0;
  function round(profile, budgetMs) {
    worker.request = {id: ++id, profile, budgetMs};
    vm.runInContext('self.onmessage({data: request})', worker, {timeout: budgetMs + 8000});
    const message = result.shift();
    assert.equal(message.id, id);
    assert.equal(result.length, 0);
    return message.result;
  }

  assert.equal(round(pilot, 0).error, 'budget');
  assert.equal(round('normal:9:999:0::::', 500).error, 'profile');
  const outcome = round(pilot, 500);
  assert.ok(outcome?.exhausted || outcome?.puzzle);
  if (outcome.puzzle) {
    const p = outcome.puzzle;
    assert.equal(p.kind, 'normal');
    assert.equal(p.n, 9);
    assert.equal(p.level, 18);
    assert.equal(p.rating.level, 18);
    assert.equal(p.rating.unique, true);
    assert.equal(p.rating.noGuess, true);
    assert.ok(p.logicProof.length > 0);
  }

  for (const key of ['normal:9:1:0::::', 'normal:16:1:0::::', 'normal:25:1:0::::',
    'normal:100:1:0::::', 'killer:16:1:2::::', 'jigsaw:25:1:2::::']) {
    const reply = round(key, 15000);
    assert.equal(reply.profile, key);
    assert.ok(reply.puzzle);
    const [kind, n, level, complexity] = key.split(':');
    assert.equal(reply.puzzle.kind, kind);
    assert.equal(reply.puzzle.n, Number(n));
    assert.equal(reply.puzzle.level, Number(level));
    if (Number(complexity)) assert.equal(reply.puzzle.complexity, Number(complexity));
  }

  const workers = [], callbacks = new Map(), replies = [];
  let timerId = 0;
  const page = vm.createContext({
    setTimeout(callback) { callbacks.set(++timerId, callback); return timerId; },
    clearTimeout(timer) { callbacks.delete(timer); },
    Worker: class {
      constructor() { workers.push(this); }
      postMessage(message) { this.message = message; }
      terminate() { this.terminated = true; }
    },
    RefillBridge: {finish(roundId, json) { replies.push([roundId, JSON.parse(json)]); }},
  });
  page.window = page;
  vm.runInContext(asset('bridge.js'), page);
  const start = number => page.runRefillRound(number, pilot, 500);
  start(1);
  workers[0].onmessage({data: {id: 1, result: {puzzle: 'sample'}}});
  assert.deepEqual(replies.shift(), [1, {puzzle: 'sample'}]);
  start(2);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].message.id, 2);
  callbacks.get(timerId)();
  assert.equal(workers[0].terminated, true);
  assert.deepEqual(replies.shift(), [2, {exhausted: true}]);
  start(3);
  assert.equal(workers.length, 2);
  workers[0].onmessage({data: {id: 3, result: {puzzle: 'stale'}}});
  assert.equal(replies.length, 0);
  workers[1].onmessage({data: {id: 3, result: {puzzle: 'sample'}}});
  assert.deepEqual(replies.shift(), [3, {puzzle: 'sample'}]);
  assert.equal(callbacks.size, 0);
  console.log('Pinned refill engine: 427 profiles, bounded Lv18 and repeated Worker rounds passed.');
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
