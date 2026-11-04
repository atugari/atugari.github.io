import { normalLogic } from './vending-proof-engine.generated.js';

const large = {
  16: { side: 4, min: 180, max: 194 },
  25: { side: 5, min: 538, max: 587 }
};

export function normalProfileShape(p, profile) {
  const { kind, n, level } = profile;
  if (kind !== 'normal' || (n === 9 ? level < 1 || level > 3 : !large[n] || level !== 1) ||
      !p || p.kind !== kind || p.n !== n || p.level !== level || p.rating?.level !== level ||
      typeof p.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(p.uid) ||
      typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(p.id) ||
      !Array.isArray(p.puzzle) || !Array.isArray(p.solution) ||
      p.puzzle.length !== n * n || p.solution.length !== n * n)
    return null;
  const side = Math.sqrt(n);
  if ((p.blockRows !== undefined && p.blockRows !== side) ||
      (p.blockCols !== undefined && p.blockCols !== side)) return null;
  const regions = Array.from({ length: n * n }, (_, i) =>
    Math.floor(i / (n * side)) * side + Math.floor((i % n) / side));
  const solvedRows = new Int32Array(n), solvedColumns = new Int32Array(n), solvedBoxes = new Int32Array(n);
  for (let i = 0; i < n * n; i++) {
    const given = p.puzzle[i], value = p.solution[i];
    if (!Number.isInteger(value) || value < 1 || value > n || (given !== 0 && given !== value)) return null;
    const row = Math.floor(i / n), col = i % n, box = regions[i], bit = 1 << (value - 1);
    if ((solvedRows[row] | solvedColumns[col] | solvedBoxes[box]) & bit) return null;
    solvedRows[row] |= bit;
    solvedColumns[col] |= bit;
    solvedBoxes[box] |= bit;
  }
  return regions;
}

// Lv1 for these board sizes is defined by its clue range and solving by hidden
// singles in boxes. Each placement is forced in every possible completion.
// Replaying just that technique makes this check bounded, including invalid input.
function solveByBoxes(p, regions, blanks) {
  const { n, solution } = p, { side } = large[n], grid = p.puzzle.slice();
  const rows = new Int32Array(n), cols = new Int32Array(n), boxes = new Int32Array(n);
  const members = Array.from({ length: n }, (_, box) => Array.from({ length: n }, (_, k) =>
    (Math.floor(box / side) * side + Math.floor(k / side)) * n + box % side * side + k % side));
  const put = (i, v) => {
    const bit = 1 << (v - 1);
    grid[i] = v;
    rows[Math.floor(i / n)] |= bit;
    cols[i % n] |= bit;
    boxes[regions[i]] |= bit;
  };
  for (let i = 0; i < grid.length; i++) if (grid[i]) put(i, grid[i]);
  let remaining = blanks;
  while (remaining > 0) {
    const before = remaining;
    for (let box = 0; box < n; box++) {
      for (let v = 1; v <= n; v++) {
        const bit = 1 << (v - 1);
        if (boxes[box] & bit) continue;
        let spot = -1, matches = 0;
        for (const i of members[box]) {
          if (!grid[i] && !((rows[Math.floor(i / n)] | cols[i % n]) & bit)) {
            spot = i;
            if (++matches === 2) break;
          }
        }
        if (matches !== 1) continue;
        if (solution[spot] !== v) return false;
        put(spot, v);
        remaining--;
      }
    }
    if (remaining === before) return false;
  }
  return true;
}

export function validateNormalProfile(p, profile, regions, now) {
  const { kind, n, level } = profile;
  const clues = p.puzzle.reduce((count, value) => count + Number(value !== 0), 0);
  const blanks = p.puzzle.length - clues;
  let hardest = 1;
  if (n === 9) {
    if (!blanks || clues < 17) return null;
    const grid = Array.from({ length: n }, (_, row) => p.puzzle.slice(row * n, (row + 1) * n));
    const solved = normalLogic.humanSolve(grid, 3);
    if (!solved.solved || solved.grid.flat().some((value, i) => value !== p.solution[i]) ||
        normalLogic.judgeLevel({ humanSolvable: true, unique: true, seMax: solved.seMax, clues }) !== level) return null;
    hardest = solved.hardest;
  } else {
    const spec = large[n];
    if (clues < spec.min || clues > spec.max || !solveByBoxes(p, regions, blanks)) return null;
  }
  return {
    kind, n, level, uid: p.uid, id: p.id, puzzle: p.puzzle, solution: p.solution,
    ...(n === 9 ? {} : { blockRows: large[n].side, blockCols: large[n].side }),
    created: Number.isSafeInteger(p.created) && p.created > 0 ? p.created : now,
    grid: p.puzzle.slice(), elapsed: 0, completed: false, notes: {},
    rating: { level, hardest, clues, humanSolvable: true, unique: true, noGuess: true },
    verification: { unique: true, method: 'vending-forced-single-replay', steps: blanks }
  };
}
