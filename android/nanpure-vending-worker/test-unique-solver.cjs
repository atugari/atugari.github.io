const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {loadReleaseEngine, listProfiles} = require('./prepare-engine.cjs');

function engine(optimized) {
  const context = vm.createContext({performance});
  context.self = context;
  vm.runInContext(loadReleaseEngine({optimized}), context);
  return context;
}

const original = engine(false), updated = engine(true);
const legacy = original.Nanpure.countSolutions;
const count = updated.Nanpure.countSolutions;
assert.equal(updated.Nanpure.fastUniqueVersion, 1);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'engine-overrides/unique-solver.js'), 'utf8'), updated);
assert.equal(updated.Nanpure.countSolutions, count, 'loading twice is harmless');
assert.equal(JSON.stringify(listProfiles(loadReleaseEngine({optimized: false}))),
  JSON.stringify(listProfiles()), 'all 427 condition definitions remain identical');

// A deliberately simple, independent backtracking implementation checks exact counts.
function oracle(input, limit = 2) {
  const grid = input.map(row => row.slice());
  let found = 0;
  function allowed(row, col, value) {
    for (let k = 0; k < 9; k++) {
      if (k !== col && grid[row][k] === value || k !== row && grid[k][col] === value) return false;
    }
    for (let r = row - row % 3; r < row - row % 3 + 3; r++) {
      for (let c = col - col % 3; c < col - col % 3 + 3; c++) {
        if ((r !== row || c !== col) && grid[r][c] === value) return false;
      }
    }
    return true;
  }
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const value = grid[r][c];
    if (!Number.isInteger(value) || value < 0 || value > 9 || value && !allowed(r, c, value)) return 0;
  }
  function visit() {
    let best;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!grid[r][c]) {
      const choices = [];
      for (let value = 1; value <= 9; value++) if (allowed(r, c, value)) choices.push(value);
      if (!choices.length) return;
      if (!best || choices.length < best.choices.length) best = {r, c, choices};
    }
    if (!best) { found++; return; }
    for (const value of best.choices) {
      grid[best.r][best.c] = value;
      visit();
      grid[best.r][best.c] = 0;
      if (found >= limit) return;
    }
  }
  visit();
  return found;
}

const solution = Array.from({length: 9}, (_, r) =>
  Array.from({length: 9}, (_, c) => (r * 3 + Math.floor(r / 3) + c) % 9 + 1));
const empty = solution.map(row => row.map(() => 0));
assert.equal(count(solution), 1);
assert.equal(count(empty, 3), 3);
assert.equal(updated.Nanpure.hasUniqueSolution(empty), false);
let state = 173;
const random = () => ((state = Math.imul(state, 1664525) + 1013904223 | 0) >>> 0) / 4294967296;
const validSamples = [];
for (let k = 0; k < 120; k++) {
  const grid = solution.map(row => row.slice());
  for (let i = 0; i < 81; i++) if (random() < .35 + k % 5 * .12) grid[Math.floor(i / 9)][i % 9] = 0;
  if (k % 3 === 0) {
    const i = Math.floor(random() * 81);
    grid[Math.floor(i / 9)][i % 9] = Math.floor(random() * 9) + 1;
  } else if (validSamples.length < 5) validSamples.push(grid);
  const before = JSON.stringify(grid), expected = oracle(grid);
  assert.equal(count(grid), expected, 'independent case ' + k);
  assert.equal(updated.Nanpure.hasUniqueSolution(grid), expected === 1);
  assert.equal(JSON.stringify(grid), before, 'input remains unchanged');
}
for (const limit of [undefined, null, 0, -1, 1, 2, 2.5, 3, '2', true]) {
  for (const grid of [solution, ...validSamples]) {
    assert.equal(count(grid, limit), legacy(grid, limit), 'original count limit semantics');
  }
}
for (const value of [10, -1, NaN, 1.5, '1', null]) {
  const grid = empty.map(row => row.slice());
  grid[0][0] = value;
  assert.equal(count(grid), 0, 'invalid value rejected');
}
for (const [a, b] of [[0, 1], [0, 9], [0, 10]]) {
  const grid = empty.map(row => row.slice());
  grid[Math.floor(a / 9)][a % 9] = grid[Math.floor(b / 9)][b % 9] = 1;
  assert.equal(count(grid), 0, 'contradictory givens rejected');
}
console.log('Refill exact9 solver: 120 independent cases, limit compatibility, immutable inputs and identical 427 profiles passed.');
