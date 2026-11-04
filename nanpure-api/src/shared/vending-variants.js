// The two trial profiles use the lowest published no-guess grade. A complete
// replay of forced deductions proves uniqueness without any branching search.
const jigsaw = { n: 25, side: 5, minClues: 400, maxClues: 430, minShape: 1.18, maxShape: 1.37 };
const killer = { n: 16, side: 4, maxCage: 4, maxBentFraction: 0.2 };
const killerRegions = Array.from({ length: killer.n ** 2 }, (_, cell) =>
  Math.floor(cell / (killer.n * killer.side)) * killer.side + Math.floor((cell % killer.n) / killer.side));

function connected(n, start, size, owner, seen) {
  const label = owner[start];
  const queue = [start];
  seen[start] = 1;
  function visit(cell) {
    if (owner[cell] === label && !seen[cell]) {
      seen[cell] = 1;
      queue.push(cell);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i], column = cell % n;
    if (column > 0) visit(cell - 1);
    if (column + 1 < n) visit(cell + 1);
    visit(cell - n);
    visit(cell + n);
  }
  return queue.length === size;
}

function jigsawShape(regions) {
  const { n, side, minShape, maxShape } = jigsaw;
  let perimeter = 0;
  const seen = new Uint8Array(n * n);
  const first = new Int16Array(n).fill(-1);
  for (let cell = 0; cell < regions.length; cell++) {
    const label = regions[cell];
    if (first[label] === -1) first[label] = cell;
    if (cell % n === n - 1 || regions[cell + 1] !== label) perimeter++;
    if (regions[cell + n] !== label) perimeter++;
  }
  const shape = perimeter / (2 * n * side);
  if (shape < minShape || shape >= maxShape) return null;
  for (const start of first) {
    if (start === -1 || !connected(n, start, n, regions, seen)) return null;
  }
  return { perimeter, shape };
}

function killerShape(cages, solution) {
  const { n, maxCage, maxBentFraction } = killer;
  if (!Array.isArray(cages) || !cages.length || cages.length > n * n) return null;
  const owner = new Int16Array(n * n).fill(-1);
  const clean = [];
  for (const cage of cages) {
    const cells = cage?.cells;
    if (!Array.isArray(cells) || !cells.length || cells.length > maxCage) return null;
    let sum = 0, values = 0;
    for (const cell of cells) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= owner.length || owner[cell] !== -1) return null;
      const value = solution[cell], bit = 1 << (value - 1);
      if (values & bit) return null;
      values |= bit;
      owner[cell] = clean.length;
      sum += value;
    }
    if (sum !== cage.sum) return null;
    clean.push({ cells, sum });
  }
  if (owner.includes(-1)) return null;
  const seen = new Uint8Array(n * n);
  let bentCells = 0, bentCages = 0, concave = 0, multiBendCages = 0, multiBendCells = 0;
  let rectangles = 0, singletons = 0, maxSize = 0;
  for (let index = 0; index < clean.length; index++) {
    const { cells } = clean[index];
    if (!connected(n, cells[0], cells.length, owner, seen)) return null;
    let corners = 0;
    // Three cells of a 2×2 square define one inside corner at the
    // diagonally opposite filled cell. Connected cages of size <=4
    // without any such corner are straight lines or rectangles.
    for (const cell of cells) {
      const column = cell % n;
      for (const dy of [-n, n]) {
        if (owner[cell + dy] !== index) continue;
        if (column > 0 && owner[cell - 1] === index && owner[cell + dy - 1] !== index) corners++;
        if (column + 1 < n && owner[cell + 1] === index && owner[cell + dy + 1] !== index) corners++;
      }
    }
    if (corners) {
      bentCages++;
      bentCells += cells.length;
      concave += corners;
    } else if (cells.length > 1) {
      rectangles++;
    } else {
      singletons++;
    }
    if (corners >= 2) {
      multiBendCages++;
      multiBendCells += cells.length;
    }
    maxSize = Math.max(maxSize, cells.length);
  }
  const bentFraction = bentCells / (n * n);
  if (bentFraction <= 0 || bentFraction >= maxBentFraction) return null;
  return {
    cages: clean,
    shapeStats: {
      bentFraction, bentCages, multiBendFraction: multiBendCells / (n * n),
      multiBendCages, concave, rectangles, maxSize, singletons
    }
  };
}

export function variantProfileShape(p, profile) {
  const { kind, n, level, complexity } = profile;
  const spec = kind === 'jigsaw' ? jigsaw : kind === 'killer' ? killer : null;
  if (!spec || n !== spec.n || level !== 1 || complexity !== 2 || !p || p.kind !== kind ||
      p.n !== n || p.level !== level || p.complexity !== complexity || p.rating?.level !== level ||
      typeof p.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(p.uid) ||
      typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(p.id) ||
      !Array.isArray(p.puzzle) || p.puzzle.length !== n * n ||
      !Array.isArray(p.solution) || p.solution.length !== n * n) return null;
  const regions = kind === 'jigsaw' ? p.regions : killerRegions;
  if (!Array.isArray(regions) || regions.length !== n * n) return null;
  const used = new Int32Array(3 * n);
  let clues = 0;
  for (let cell = 0; cell < n * n; cell++) {
    const given = p.puzzle[cell], value = p.solution[cell], region = regions[cell];
    if (!Number.isInteger(value) || value < 1 || value > n || (given !== 0 && given !== value) ||
        !Number.isInteger(region) || region < 0 || region >= n) return null;
    const row = Math.floor(cell / n), col = n + cell % n, box = 2 * n + region, bit = 1 << (value - 1);
    if ((used[row] | used[col] | used[box]) & bit) return null;
    used[row] |= bit;
    used[col] |= bit;
    used[box] |= bit;
    if (given) clues++;
  }
  let shape;
  if (kind === 'jigsaw') {
    if (clues < jigsaw.minClues || clues > jigsaw.maxClues) return null;
    const shapeStats = jigsawShape(regions);
    if (!shapeStats) return null;
    shape = { shape: shapeStats.shape, shapeStats };
  } else {
    // The published generator for complexity 2 leaves all Killer cells empty.
    if (clues !== 0) return null;
    shape = killerShape(p.cages, p.solution);
    if (!shape) return null;
  }
  return {
    kind, n, level, complexity, id: p.id, uid: p.uid, created: p.created,
    puzzle: p.puzzle, solution: p.solution, regions: regions.slice(), clues, ...shape
  };
}

function forcedGrade({ n, puzzle, solution, regions, cages, clues }) {
  const size = n * n, full = (1 << n) - 1;
  const units = new Uint16Array(3 * size), unitSizes = new Uint8Array(3 * n);
  const rowOf = new Uint8Array(size), colOf = new Uint8Array(size), boxOf = new Uint8Array(size);
  const used = new Int32Array(3 * n), grid = Uint8Array.from(puzzle);
  const candidates = new Int32Array(size);
  const counts = new Uint8Array(3 * size), positions = new Uint16Array(3 * size);
  // Jigsaw tries region-only singles first. The second queue tracks the
  // remaining allowed techniques, including the last empty cell of a cage.
  const regional = [], general = [];
  const cageOf = new Uint8Array(size), cageMissing = new Uint8Array(cages?.length ?? 0);
  const cageSum = new Int16Array(cageMissing.length), cagePositions = new Uint16Array(cageMissing.length);
  for (let cage = 0; cage < cageMissing.length; cage++) {
    const { cells, sum } = cages[cage];
    cageSum[cage] = sum;
    cageMissing[cage] = cells.length;
    for (const cell of cells) {
      cageOf[cell] = cage;
      cagePositions[cage] ^= cell;
    }
    if (cells.length === 1) general.push(cells[0] * n + sum - 1);
  }
  function index(unit, cell) {
    units[unit * n + unitSizes[unit]++] = cell;
    if (grid[cell]) used[unit] |= 1 << (grid[cell] - 1);
  }
  for (let cell = 0; cell < size; cell++) {
    index(rowOf[cell] = Math.floor(cell / n), cell);
    index(colOf[cell] = n + cell % n, cell);
    index(boxOf[cell] = 2 * n + regions[cell], cell);
  }
  function add(at, cell) {
    counts[at]++;
    positions[at] ^= cell;
  }
  function enqueue(at, unit, digit) {
    if (counts[at] === 1 && !(used[unit] & (1 << digit))) {
      const queue = !cages && unit >= 2 * n ? regional : general;
      queue.push(positions[at] * n + digit);
    }
  }
  for (let cell = 0; cell < size; cell++) {
    if (grid[cell]) continue;
    const row = rowOf[cell], col = colOf[cell], box = boxOf[cell];
    let bits = full & ~(used[row] | used[col] | used[box]);
    candidates[cell] = bits;
    if (!bits) return null;
    if (!(bits & (bits - 1))) general.push(cell * n + 31 - Math.clz32(bits));
    while (bits) {
      const bit = bits & -bits;
      const digit = 31 - Math.clz32(bit);
      add(row * n + digit, cell);
      add(col * n + digit, cell);
      add(box * n + digit, cell);
      bits ^= bit;
    }
  }
  for (let unit = 0; unit < 3 * n; unit++) {
    for (let digit = 0; digit < n; digit++) enqueue(unit * n + digit, unit, digit);
  }
  function removeFromUnit(unit, digit, cell) {
    const at = unit * n + digit;
    counts[at]--;
    positions[at] ^= cell;
    enqueue(at, unit, digit);
  }
  function remove(cell, digit, bit) {
    if (!(candidates[cell] & bit)) return;
    candidates[cell] ^= bit;
    removeFromUnit(rowOf[cell], digit, cell);
    removeFromUnit(colOf[cell], digit, cell);
    removeFromUnit(boxOf[cell], digit, cell);
    const left = candidates[cell];
    if (!grid[cell] && left && !(left & (left - 1))) general.push(cell * n + 31 - Math.clz32(left));
  }
  function clearPeers(unit, digit, bit) {
    const start = unit * n;
    for (let at = start; at < start + n; at++) remove(units[at], digit, bit);
  }
  let boxHead = 0, generalHead = 0, remaining = size - clues, hardest = 1;
  while (remaining && (boxHead < regional.length || generalHead < general.length)) {
    const inRegion = boxHead < regional.length;
    const next = inRegion ? regional[boxHead++] : general[generalHead++];
    const cell = Math.floor(next / n), digit = next % n, value = digit + 1, bit = 1 << digit;
    if (grid[cell] === value) continue;
    if (grid[cell] || !(candidates[cell] & bit) || solution[cell] !== value) return null;
    if (!cages && !inRegion) hardest = 2;
    grid[cell] = value;
    remaining--;
    const row = rowOf[cell], col = colOf[cell], box = boxOf[cell];
    used[row] |= bit;
    used[col] |= bit;
    used[box] |= bit;
    // Remove the placed digit from peers before clearing other digits from
    // this cell. An intermediate count for a used digit cannot create a move.
    clearPeers(row, digit, bit);
    clearPeers(col, digit, bit);
    clearPeers(box, digit, bit);
    while (candidates[cell]) {
      const other = candidates[cell] & -candidates[cell];
      remove(cell, 31 - Math.clz32(other), other);
    }
    if (cages) {
      const cage = cageOf[cell];
      cageSum[cage] -= value;
      cagePositions[cage] ^= cell;
      if (--cageMissing[cage] === 1) {
        const last = cageSum[cage];
        if (last < 1 || last > n) return null;
        general.push(cagePositions[cage] * n + last - 1);
      }
    }
  }
  return remaining === 0 ? hardest : null;
}

export function validateVariantProfile(p, profile, now) {
  if (!p || p.kind !== profile.kind || p.n !== profile.n ||
      p.level !== profile.level || p.complexity !== profile.complexity) return null;
  const hardest = forcedGrade(p);
  if (!hardest) return null;
  const { clues, ...verified } = p;
  return {
    ...verified,
    created: Number.isSafeInteger(p.created) && p.created > 0 ? p.created : now,
    ...(p.cages ? { kStyle: 'graded', killerRatingVersion: 3 } : {}),
    shapeVersion: 2, grid: p.puzzle.slice(), elapsed: 0, completed: false, notes: {},
    rating: { level: p.level, hardest, clues, humanSolvable: true, unique: true, noGuess: true },
    verification: { unique: true, method: 'vending-variant-forced-replay', steps: p.puzzle.length - clues }
  };
}
