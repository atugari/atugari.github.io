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
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'src/main/assets/round.js'), 'utf8'), worker);
  vm.runInContext('self.onmessage({data: 0})', worker);
  assert.equal(result.shift()?.error, 'budget');
  vm.runInContext('self.onmessage({data: 500})', worker, {timeout: 8000});
  const outcome = result.shift();
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
  assert.equal(result.length, 0);
  console.log('Pinned refill engine: invalid budget and bounded Lv18 round passed.');
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
