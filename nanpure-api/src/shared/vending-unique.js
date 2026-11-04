// Search for at most two completions. A bounded check that cannot finish rejects
// the candidate, rather than relying on its producer's difficulty metadata.
const ALL = 0b111111111;
const rows = Array.from({ length: 81 }, (_, i) => Math.floor(i / 9));
const columns = Array.from({ length: 81 }, (_, i) => i % 9);
const boxes = rows.map((r, i) => Math.floor(r / 3) * 3 + Math.floor(columns[i] / 3));
const counts = Uint8Array.from({ length: ALL + 1 }, (_, mask) => {
  let count = 0;
  for (; mask; mask &= mask - 1) count++;
  return count;
});

export function hasVendingUniqueSolution(puzzle, solution) {
  if (puzzle.length !== 81 || solution.length !== 81) return false;
  const solvedRows = new Uint16Array(9);
  const solvedColumns = new Uint16Array(9);
  const solvedBoxes = new Uint16Array(9);
  const rowMask = new Uint16Array(9);
  const columnMask = new Uint16Array(9);
  const boxMask = new Uint16Array(9);
  const blanks = [];
  for (let i = 0; i < 81; i++) {
    const given = puzzle[i];
    const value = solution[i];
    if (!Number.isInteger(value) || value < 1 || value > 9 || (given !== 0 && given !== value)) return false;
    const [r, c, b] = [rows[i], columns[i], boxes[i]];
    const bit = 1 << (value - 1);
    if ((solvedRows[r] | solvedColumns[c] | solvedBoxes[b]) & bit) return false;
    solvedRows[r] |= bit;
    solvedColumns[c] |= bit;
    solvedBoxes[b] |= bit;
    if (given === 0) {
      blanks.push(i);
    } else {
      rowMask[r] |= bit;
      columnMask[c] |= bit;
      boxMask[b] |= bit;
    }
  }
  let budget = 50000;
  function solve(depth) {
    if (--budget <= 0) return 2;
    if (depth === blanks.length) return 1;
    let chosen = depth, available = 0, best = 10;
    for (let i = depth; i < blanks.length; i++) {
      const at = blanks[i];
      const mask = ALL & ~(rowMask[rows[at]] | columnMask[columns[at]] | boxMask[boxes[at]]);
      const count = counts[mask];
      if (count === 0) return 0;
      if (count < best) {
        chosen = i;
        available = mask;
        best = count;
        if (count === 1) break;
      }
    }
    const at = blanks[chosen];
    const r = rows[at], c = columns[at], b = boxes[at];
    blanks[chosen] = blanks[depth];
    blanks[depth] = at;
    let found = 0;
    while (available && found < 2) {
      const bit = available & -available;
      available ^= bit;
      rowMask[r] |= bit;
      columnMask[c] |= bit;
      boxMask[b] |= bit;
      found += solve(depth + 1);
      rowMask[r] ^= bit;
      columnMask[c] ^= bit;
      boxMask[b] ^= bit;
    }
    blanks[depth] = blanks[chosen];
    blanks[chosen] = at;
    return found;
  }
  return solve(0) === 1;
}
