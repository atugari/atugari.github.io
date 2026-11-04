const size = 100;
const cells = size * size;
const side = 10;
const words = 4;
const minClues = 8_600;
const full = [0xffffffff, 0xffffffff, 0xffffffff, 0x0f];
const rowOf = new Uint8Array(cells);
const colOf = new Uint8Array(cells);
const boxOf = new Uint8Array(cells);
for (let cell = 0; cell < cells; cell++) {
  rowOf[cell] = Math.floor(cell / size);
  colOf[cell] = cell % size;
  boxOf[cell] = Math.floor(rowOf[cell] / side) * side + Math.floor(colOf[cell] / side);
}

export function hundredProfileShape(p, profile) {
  if (profile.kind !== 'normal' || profile.n !== size || profile.level !== 1 || !p ||
      p.kind !== 'normal' || p.n !== size || p.level !== 1 || p.rating?.level !== 1 ||
      p.blockRows !== side || p.blockCols !== side || p.linked != null || p.complexity != null ||
      typeof p.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(p.uid) ||
      typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(p.id) ||
      !Array.isArray(p.puzzle) || !Array.isArray(p.solution) ||
      p.puzzle.length !== cells || p.solution.length !== cells) return null;

  const rows = new Uint32Array(size * words), cols = new Uint32Array(size * words), boxes = new Uint32Array(size * words);
  let clues = 0;
  for (let cell = 0; cell < cells; cell++) {
    const value = p.solution[cell], given = p.puzzle[cell];
    if (!Number.isInteger(value) || value < 1 || value > size || (given !== 0 && given !== value)) return null;
    const digit = value - 1, word = digit >>> 5, bit = 1 << (digit & 31);
    const row = rowOf[cell] * words + word, col = colOf[cell] * words + word, box = boxOf[cell] * words + word;
    if ((rows[row] | cols[col] | boxes[box]) & bit) return null;
    rows[row] |= bit;
    cols[col] |= bit;
    boxes[box] |= bit;
    if (given) clues++;
  }
  if (clues < minClues || clues === cells) return null;
  return { puzzle: p.puzzle, solution: p.solution, id: p.id, uid: p.uid, created: p.created, clues };
}

// The released Lv1 grade permits hidden singles in 10×10 boxes only.
// Count each candidate in its box, then track candidate removals. Counts
// only decrease, so every box/digit pair enters the queue at most once.
function solveByBoxes(p) {
  const rows = new Uint32Array(size * words), cols = new Uint32Array(size * words), boxes = new Uint32Array(size * words);
  const rowBlanks = Array.from({ length: size }, () => []), colBlanks = Array.from({ length: size }, () => []);
  const boxBlanks = Array.from({ length: size }, () => []);
  for (let cell = 0; cell < cells; cell++) {
    const value = p.puzzle[cell], row = rowOf[cell], col = colOf[cell], box = boxOf[cell];
    if (value) {
      const digit = value - 1, word = digit >>> 5, bit = 1 << (digit & 31);
      rows[row * words + word] |= bit;
      cols[col * words + word] |= bit;
      boxes[box * words + word] |= bit;
    } else {
      rowBlanks[row].push(cell);
      colBlanks[col].push(cell);
      boxBlanks[box].push(cell);
    }
  }

  const candidates = new Uint32Array(cells * words);
  const counts = new Uint8Array(cells), positions = new Uint16Array(cells), queue = new Uint16Array(cells);
  let queued = 0;
  for (let box = 0; box < size; box++) {
    for (const cell of boxBlanks[box]) {
      const row = rowOf[cell] * words, col = colOf[cell] * words;
      for (let word = 0; word < words; word++) {
        let mask = full[word] & ~(rows[row + word] | cols[col + word] | boxes[box * words + word]);
        candidates[cell * words + word] = mask;
        while (mask) {
          const bit = mask & -mask;
          const key = box * size + word * 32 + (31 - Math.clz32(bit));
          counts[key]++;
          positions[key] ^= cell;
          mask ^= bit;
        }
      }
    }
  }
  for (let key = 0; key < cells; key++) {
    if (counts[key] === 1) queue[queued++] = key;
  }

  function remove(cell, digit, word, bit) {
    const index = cell * words + word;
    if (!(candidates[index] & bit)) return;
    candidates[index] ^= bit;
    const key = boxOf[cell] * size + digit;
    positions[key] ^= cell;
    if (--counts[key] === 1) queue[queued++] = key;
  }

  let blanks = cells - p.clues;
  for (let read = 0; read < queued && blanks; read++) {
    const key = queue[read], box = Math.floor(key / size), digit = key % size;
    const word = digit >>> 5, bit = 1 << (digit & 31);
    if (counts[key] !== 1 || boxes[box * words + word] & bit) continue;
    const cell = positions[key];
    if (p.solution[cell] !== digit + 1) return false;
    boxes[box * words + word] |= bit;
    for (let w = 0; w < words; w++) {
      let mask = candidates[cell * words + w];
      while (mask) {
        const b = mask & -mask;
        remove(cell, w * 32 + 31 - Math.clz32(b), w, b);
        mask ^= b;
      }
    }
    for (const peer of rowBlanks[rowOf[cell]]) remove(peer, digit, word, bit);
    for (const peer of colBlanks[colOf[cell]]) remove(peer, digit, word, bit);
    for (const peer of boxBlanks[box]) remove(peer, digit, word, bit);
    blanks--;
  }
  return blanks === 0;
}

export function validateHundredProfile(p, profile, now) {
  if (!p || profile.kind !== 'normal' || profile.n !== size || profile.level !== 1 || !solveByBoxes(p)) return null;
  return {
    kind: 'normal', n: size, level: 1, blockRows: side, blockCols: side, ratingVersion: 4, hundredVersion: 1,
    uid: p.uid, id: p.id, puzzle: p.puzzle, solution: p.solution,
    created: Number.isSafeInteger(p.created) && p.created > 0 ? p.created : now,
    grid: p.puzzle.slice(), elapsed: 0, completed: false, notes: {},
    rating: { level: 1, hardest: 1, clues: p.clues, humanSolvable: true, unique: true, noGuess: true },
    verification: { unique: true, method: 'vending-box-single-replay', steps: cells - p.clues }
  };
}

const fingerprints = new Map();
function digitOrder(n, suffix) {
  const digits = Array.from({ length: n + 1 }, (_, value) => ({ value, text: `${value}${suffix}` }));
  digits.sort((a, b) => a.text < b.text ? -1 : a.text > b.text ? 1 : 0);
  const order = new Uint8Array(n + 1);
  for (let i = 0; i < digits.length; i++) order[digits[i].value] = i;
  return order;
}

function orientationTables(n) {
  if (![36, 49, 100].includes(n)) throw new RangeError('Unsupported large regular board');
  if (!fingerprints.has(n)) {
    const block = Math.sqrt(n);
    // After relabeling in scan order, regular square regions are identical
    // in all eight orientations. Cache the same JSON as canonicalPuzzle.
    const regions = JSON.stringify(Array.from({ length: n * n }, (_, cell) =>
      Math.floor(cell / (n * block)) * block + Math.floor(cell % n / block)));
    const orientations = Array.from({ length: 8 }, (_, transform) => {
      const at = new Uint16Array(n * n);
      const rowStep = transform & 1 ? -1 : 1, colStep = transform & 2 ? -1 : 1;
      let index = 0;
      for (let row = rowStep < 0 ? n - 1 : 0, r = 0; r < n; row += rowStep, r++) {
        for (let col = colStep < 0 ? n - 1 : 0, c = 0; c < n; col += colStep, c++) {
          at[index++] = transform & 4 ? col * n + row : row * n + col;
        }
      }
      return at;
    });
    fingerprints.set(n, { regions, orientations, order: digitOrder(n, ','), lastOrder: digitOrder(n, ']') });
  }
  return fingerprints.get(n);
}

// Optimized exact canonicalPuzzle encoding for large standard boards. The
// givens sort before the solution, so encode only the solutions of ties.
export async function fingerprintHundredPuzzle({ n = size, puzzle, solution }) {
  const { regions, orientations, order, lastOrder } = orientationTables(n), total = n * n;
  let given = new Uint8Array(total), bestGiven = new Uint8Array(total);
  const ties = [];
  for (const at of orientations) {
    const digits = new Uint8Array(n + 1);
    let label = 0, difference = ties.length ? 0 : -1;
    for (let i = 0; i < total; i++) {
      const cell = at[i], value = solution[cell];
      if (!digits[value]) digits[value] = ++label;
      given[i] = puzzle[cell] ? digits[value] : 0;
      if (!difference && given[i] !== bestGiven[i]) {
        const rank = i === total - 1 ? lastOrder : order;
        difference = rank[given[i]] - rank[bestGiven[i]];
        if (difference > 0) break;
      }
    }
    if (difference > 0) continue;
    if (difference < 0) {
      ties.length = 0;
      [given, bestGiven] = [bestGiven, given];
    }
    ties.push({ at, digits });
  }
  const normalizedGiven = JSON.stringify(Array.from(bestGiven));
  const normalizedSolution = new Array(total);
  let bestSolution = null;
  for (const { at, digits } of ties) {
    for (let i = 0; i < total; i++) normalizedSolution[i] = digits[solution[at[i]]];
    const key = JSON.stringify(normalizedSolution);
    if (bestSolution === null || key < bestSolution) bestSolution = key;
  }
  const key = `["normal",${n},${normalizedGiven},${bestSolution},${regions},[],[]]`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
