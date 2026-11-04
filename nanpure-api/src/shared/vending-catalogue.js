import {hash} from '../http.js';
import {fingerprintHundredPuzzle} from './vending-hundred.js';
import {NP, NanpureBig, Killer2, canonicalCatalogueIdentity} from './vending-catalogue-engine.generated.js';

const engineRelease = '2026.11.04.95';
const allowedIds = /^[A-Za-z0-9_-]{1,128}$/;
const maxAuxiliaryEntries = 12000;
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const versions = [
  'ratingVersion', 'sizeVersion', 'largeRatingVersion', 'giantVersion', 'hundredVersion',
  'expertVersion', 'masterVersion', 'coverVersion', 'resolutionVersion', 'shapeVersion',
  'killerRatingVersion', 'neighborVersion', 'stepVersion', 'crossVersion', 'linkedVersion',
  'variantVersion', 'trioVersion', 'expansionVersion', 'multiVersion'
];
const metadata = [
  'rating', 'assessment', 'logicProof', 'shapeMethod', 'kStyle', 'tidyApplied',
  ...versions
];
const digitSymmetric = new Set(['normal', 'jigsaw', 'multi', 'antiknight', 'diagonal', 'hyper']);
const implicitVariantClues = new Set(['antiknight', 'diagonal', 'hyper']);
const fixedRules = new Map([
  ['normal', null], ['jigsaw', 'regions'], ['killer', 'cages'], ['cross', 'crosses'],
  ['step', 'steps'], ['neighbor', 'links'], ['multi', null]
]);
const boardCounts = new Map([['pair', 2], ['relay', 3], ['samurai', 5], ['ell', 3], ['cross', 5]]);
const killerCageSizes = [4, 4, 5, 6];

// Auxiliary data are small constraint definitions and rating summaries. Bound
// them independently of the HTTP byte limit before the release validators run.
function bounded(value, budget, depth = 0) {
  if (--budget.remaining < 0 || depth > 8) return false;
  if (typeof value === 'string') return value.length <= 1024 && !/[<>]/.test(value);
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean' || value === null) return true;
  if (Array.isArray(value)) return value.length <= 1024 && value.every(v => bounded(v, budget, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const keys = Object.keys(value);
  return keys.length <= 40 && keys.every(k => k.length <= 80 && !forbiddenKeys.has(k) &&
    bounded(value[k], budget, depth + 1));
}

function blockOf(n, blockRows, blockCols, cell) {
  return Math.floor(Math.floor(cell / n) / blockRows) * blockRows + Math.floor((cell % n) / blockCols);
}

// Linear version of the notebook's regular-board rules check. The notebook
// implementation filters the entire board separately for every block.
function validNormalSolution(n, blockRows, blockCols, solution) {
  const seen = new Uint8Array(3 * n * n);
  for (let cell = 0; cell < solution.length; cell++) {
    const digit = solution[cell] - 1;
    const rowKey = Math.floor(cell / n) * n + digit;
    const columnKey = (n + cell % n) * n + digit;
    const blockKey = (2 * n + blockOf(n, blockRows, blockCols, cell)) * n + digit;
    if (seen[rowKey] || seen[columnKey] || seen[blockKey]) return false;
    seen[rowKey] = seen[columnKey] = seen[blockKey] = 1;
  }
  return true;
}

function boardSize(raw, shape, n) {
  if (!shape) return raw.linked === undefined ? n * n : 0;
  const linked = raw.linked;
  const boards = boardCounts.get(shape);
  if (!boards || linked?.shape !== shape || !Array.isArray(linked.boards) || linked.boards.length !== boards ||
      !Array.isArray(linked.cells) || linked.cells.length <= n * n || linked.cells.length >= boards * n * n ||
      !Number.isInteger(linked.width) || linked.width < n || linked.width > 5 * n ||
      !Number.isInteger(linked.height) || linked.height < n || linked.height > 5 * n)
    return 0;
  if (raw.kind === 'multi' ? raw.multiVersion !== 1 : raw.linkedVersion !== 1) return 0;
  if (!linked.boards.every(b => Array.isArray(b?.map) && b.map.length === n * n &&
      b.map.every(cell => Number.isInteger(cell) && cell >= 0 && cell < linked.cells.length)))
    return 0;
  return linked.cells.length;
}

function linkedRules(linked, ruleField) {
  const {shape, width, height, cells, boards} = linked;
  const cleanBoards = boards.map(board => {
    const {x, y, map} = board;
    return ruleField ? {x, y, map, [ruleField]: board[ruleField]} : {x, y, map};
  });
  return {shape, boards: cleanBoards, cells, width, height};
}

function killerShape(n, cages, complexity) {
  const stats = Killer2.cageShapeStats(n, cages);
  const {bentFraction, multiBendFraction, maxSize} = stats;
  // These cutoffs are the release's cageComplexity formula.
  const band = bentFraction === 0 ? 1 : bentFraction < 0.2 ? 2 :
    bentFraction >= 0.5 && multiBendFraction >= 0.08 ? 4 : 3;
  if (band !== complexity || maxSize > killerCageSizes[complexity - 1]) return null;
  if (complexity === 1 && cages.some(c => !Killer2.shapeAllowed(n, c.cells, complexity))) return null;
  return stats;
}

export function cataloguePuzzleShape(raw, profile) {
  const {kind, n, level, complexity, multiShape, linkedShape} = profile;
  const shape = multiShape || linkedShape;
  const key = [kind, n, level, complexity ?? 0, multiShape || '', linkedShape || '', '', ''].join(':');
  if (!raw || profile.profile !== key || !NP.sizesForKind(kind).includes(n) ||
      !Number.isInteger(level) || level < 1 || level > NP.maxLevel(kind, n) ||
      raw.kind !== kind || raw.n !== n || raw.level !== level ||
      (complexity ?? undefined) !== raw.complexity ||
      raw.rating?.level !== level || raw.rating.unique === false ||
      (kind !== 'jigsaw' && raw.rating.unique !== true) ||
      typeof raw.id !== 'string' || raw.id.length > 100 || !allowedIds.test(raw.id) ||
      typeof raw.uid !== 'string' || !allowedIds.test(raw.uid)) return null;
  const size = boardSize(raw, shape, n);
  if (!size || !Array.isArray(raw.puzzle) || !Array.isArray(raw.solution) ||
      raw.puzzle.length !== size || raw.solution.length !== size) return null;

  const givens = new Set();
  let clueCount = 0;
  for (let cell = 0; cell < size; cell++) {
    const solution = raw.solution[cell], given = raw.puzzle[cell];
    if (!Number.isInteger(solution) || solution < 1 || solution > n ||
        (given !== 0 && given !== solution)) return null;
    if (given) {
      givens.add(given);
      clueCount++;
    }
  }
  // Two completely absent digits are interchangeable in these rules.
  if (clueCount === size || (digitSymmetric.has(kind) && givens.size < n - 1)) return null;
  if (kind === 'jigsaw' && (!Array.isArray(raw.regions) || raw.regions.length !== size ||
      raw.regions.some(r => !Number.isInteger(r) || r < 0 || r >= n))) return null;
  if (kind === 'killer' && (!Array.isArray(raw.cages) || !raw.cages.length || raw.cages.length > size ||
      raw.cages.some(c => !Array.isArray(c?.cells) || !c.cells.length || c.cells.length > 6))) return null;
  const ruleField = fixedRules.has(kind) ? fixedRules.get(kind) : 'clues';
  if (!shape && ruleField && (!Array.isArray(raw[ruleField]) || raw[ruleField].length > 2 * size ||
      (!raw[ruleField].length && !implicitVariantClues.has(kind)))) return null;

  const p = {
    kind, n, level, uid: raw.uid, id: raw.id, puzzle: raw.puzzle, solution: raw.solution,
    ...(complexity == null ? {} : {complexity}),
    ...(Number.isSafeInteger(raw.created) && raw.created > 0 ? {created: raw.created} : {})
  };
  const budget = {remaining: maxAuxiliaryEntries};
  if (shape) {
    if (!bounded(raw.linked, budget)) return null;
    p.linked = linkedRules(raw.linked, ruleField);
  } else if (ruleField) {
    if (!bounded(raw[ruleField], budget)) return null;
    p[ruleField] = kind === 'killer' ? raw.cages.map(({cells, sum}) => ({cells, sum})) : raw[ruleField];
  }
  if (kind === 'kropki') {
    if (raw.kropkiMode !== 'positive') return null;
    p.kropkiMode = raw.kropkiMode;
  }
  for (const field of metadata) {
    if (raw[field] === undefined) continue;
    if (!bounded(raw[field], budget)) return null;
    p[field] = raw[field];
  }
  try {
    if (kind === 'normal') {
      const {blockRows, blockCols} = NP.sizeSpec(n);
      if ((raw.blockRows !== undefined && raw.blockRows !== blockRows) ||
          (raw.blockCols !== undefined && raw.blockCols !== blockCols) ||
          !validNormalSolution(n, blockRows, blockCols, p.solution)) return null;
      p.blockRows = blockRows;
      p.blockCols = blockCols;
    } else {
      if (!NP.validate(p)) return null;
      if (kind === 'jigsaw') {
        const grade = NanpureBig.JIG_LEVELS[n]?.[level - 1];
        const shapeStats = NanpureBig.jigShapeStats(n, p.regions);
        if (!grade || clueCount < grade.clues[0] || clueCount > grade.clues[1] ||
            !NanpureBig.jigShapeMatches(n, shapeStats, complexity)) return null;
        p.shapeStats = shapeStats;
        p.shape = shapeStats.shape;
      } else if (kind === 'killer') {
        const shapeStats = killerShape(n, p.cages, complexity);
        if (!shapeStats) return null;
        p.shapeStats = shapeStats;
      }
    }
  } catch {
    return null;
  }
  return p;
}

export function verifyCataloguePuzzle(p, profile, now) {
  if (!p || p.kind !== profile.kind || p.n !== profile.n || p.level !== profile.level) return null;
  // The authenticated producer runs the pinned release generator. These
  // checks independently validate the submitted board and constraints; they
  // deliberately do not certify a second uniqueness or difficulty result.
  return {
    ...p, created: p.created ?? now, grid: p.puzzle.slice(), elapsed: 0, completed: false, notes: {},
    verification: {
      method: 'registered-refill-generator', rulesCheckedBy: 'server',
      difficultyCheckedBy: 'registered-device', uniquenessCheckedBy: 'registered-device',
      engineRelease
    }
  };
}

const orientationCache = new Map();

function orientationData(n) {
  if (!orientationCache.has(n)) {
    const size = n * n;
    const orientations = Array.from({length: 8}, (_, transform) => {
      const at = new Uint16Array(size), to = new Uint16Array(size);
      for (let i = 0; i < size; i++) {
        let r = Math.floor(i / n), c = i % n;
        if (transform & 1) r = n - 1 - r;
        if (transform & 2) c = n - 1 - c;
        at[i] = transform & 4 ? c * n + r : r * n + c;
        to[at[i]] = i;
      }
      return {at, to};
    });
    // JSON orders these decimal digits lexically. A prefix such as 1 in
    // 10 orders before 10 at a comma, but after 10 at the final bracket.
    const ranks = [',', ']'].map(delimiter => {
      const tokens = Array.from({length: n + 1}, (_, value) => ({value, key: value + delimiter}));
      tokens.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      const rank = new Uint8Array(n + 1);
      tokens.forEach(({value}, i) => { rank[value] = i; });
      return rank;
    });
    orientationCache.set(n, {orientations, ranks});
  }
  return orientationCache.get(n);
}

function compareDigits(source, a, b, ranks) {
  for (let i = 0; i < source.length; i++) {
    const left = a.labels[source[a.at[i]]], right = b.labels[source[b.at[i]]];
    if (left !== right) {
      const rank = ranks[Number(i + 1 === source.length)];
      return rank[left] - rank[right];
    }
  }
  return 0;
}

// Match stock-puzzle.js byte for byte so an identical problem is rejected
// even when one shelf uses independent verification and another uses this path.
function canonicalStockIdentity(p) {
  const {n, puzzle, solution} = p;
  const {orientations, ranks} = orientationData(n);
  const regionMap = p.regions ?? NP.regularRegions(n);
  const hasGivens = puzzle.some(Boolean);
  const choices = [];
  for (const {at, to} of orientations) {
    const labels = new Uint8Array(n + 1);
    // A valid first row is a permutation of all the digits.
    for (let i = 0; i < n; i++) labels[solution[at[i]]] = i + 1;
    const candidate = {at, to, labels};
    const comparison = choices.length ?
      (hasGivens ? compareDigits(puzzle, candidate, choices[0], ranks) : 0) ||
        compareDigits(solution, candidate, choices[0], ranks) : -1;
    if (comparison > 0) continue;
    if (comparison < 0) choices.length = 0;
    choices.push(candidate);
  }

  let best = null;
  for (const {at, to, labels} of choices) {
    const givens = [], solved = [], regions = [], regionLabels = new Map();
    for (const cell of at) {
      givens.push(labels[puzzle[cell]]);
      solved.push(labels[solution[cell]]);
      const region = regionMap[cell];
      if (!regionLabels.has(region)) regionLabels.set(region, regionLabels.size);
      regions.push(regionLabels.get(region));
    }
    const cages = (p.cages || []).map(cage => {
      const cells = cage.cells.map(cell => to[cell]).sort((a, b) => a - b);
      return {cells, key: JSON.stringify(cells)};
    }).sort((a, b) => a.key.localeCompare(b.key)).map(cage => cage.cells);
    const identity = JSON.stringify([p.kind, n, givens, solved, regions, cages, []]);
    if (best === null || identity < best) best = identity;
  }
  return best;
}

export async function fingerprintCataloguePuzzle(p) {
  if (p.kind === 'normal' && p.n >= 36) return fingerprintHundredPuzzle(p);
  if (p.kind === 'normal' || p.kind === 'jigsaw' || p.kind === 'killer') {
    return hash(canonicalStockIdentity(p));
  }
  return hash(canonicalCatalogueIdentity(p));
}
