export function validateStock(p) {
    const n = p.n;
    if (![1, 2, 3].includes(p.level) || ![6, 8, 9, 12, 16].includes(n) || !['normal', 'jigsaw', 'killer', 'neighbor'].includes(p.kind))
        throw Error('Invalid puzzle configuration');
    if (p.puzzle.length !== n * n || p.solution.length !== n * n || p.regions.length !== n * n)
        throw Error('Invalid puzzle dimensions');
    for (let i = 0; i < n * n; i++)
        if (!Number.isInteger(p.solution[i]) || p.solution[i] < 1 || p.solution[i] > n || !Number.isInteger(p.puzzle[i]) || p.puzzle[i] < 0 || p.puzzle[i] > n || p.puzzle[i] && p.puzzle[i] !== p.solution[i])
            throw Error('Invalid puzzle value');
    for (let i = 0; i < n; i++) {
        if (new Set(p.solution.slice(i * n, (i + 1) * n)).size !== n || new Set(Array.from({ length: n }, (_, j) => p.solution[j * n + i])).size !== n)
            throw Error('Invalid row or column');
    }
    if (p.kind !== 'neighbor') {
        const regions = new Set(p.regions);
        if (regions.size !== n)
            throw Error('Invalid regions');
        for (const r of regions) {
            const values = p.solution.filter((_, i) => p.regions[i] === r);
            if (values.length !== n || new Set(values).size !== n)
                throw Error('Invalid region');
        }
    }
    if (p.kind === 'killer') {
        if (!p.cages?.length)
            throw Error('Missing cages');
        const occupied = new Set();
        for (const cage of p.cages) {
            if (!cage.cells.length || cage.cells.some(i => !Number.isInteger(i) || i < 0 || i >= n * n || occupied.has(i)))
                throw Error('Invalid cage cells');
            cage.cells.forEach(i => occupied.add(i));
            if (cage.cells.reduce((s, i) => s + p.solution[i], 0) !== cage.sum || new Set(cage.cells.map(i => p.solution[i])).size !== cage.cells.length)
                throw Error('Invalid cage sum');
        }
    }
    if (p.kind === 'neighbor') {
        if (!p.links?.length)
            throw Error('Missing neighbor links');
        for (const [a, b] of p.links) {
            if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n * n || b >= n * n || !(Math.abs(a - b) === n || Math.abs(a - b) === 1 && Math.floor(a / n) === Math.floor(b / n)) || Math.abs(p.solution[a] - p.solution[b]) !== 1)
                throw Error('Invalid neighbor link');
        }
    }
}
// Normalize all 8 board orientations and digit/region labels. Cages are
// represented by geometry so digit-complemented sums also count as a repeat.
export function canonicalPuzzle(p) {
    const n = p.n;
    let best = '';
    for (let transform = 0; transform < 8; transform++) {
        const at = Array.from({ length: n * n }, (_, i) => { let r = Math.floor(i / n), c = i % n; if (transform & 1)
            r = n - 1 - r; if (transform & 2)
            c = n - 1 - c; if (transform & 4)
            [r, c] = [c, r]; return r * n + c; });
        const to = new Array(n * n);
        at.forEach((s, t) => to[s] = t);
        const digits = new Map(), regionLabels = new Map();
        const solution = at.map(i => { const v = p.solution[i]; if (!digits.has(v))
            digits.set(v, digits.size + 1); return digits.get(v); });
        const puzzle = at.map(i => p.puzzle[i] ? digits.get(p.puzzle[i]) : 0);
        const regions = p.kind === 'neighbor' ? [] : at.map(i => { const r = p.regions[i]; if (!regionLabels.has(r))
            regionLabels.set(r, regionLabels.size); return regionLabels.get(r); });
        const cages = (p.cages || []).map(c => c.cells.map(i => to[i]).sort((a, b) => a - b)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const links = (p.links || []).map(l => l.map(i => to[i]).sort((a, b) => a - b)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const key = JSON.stringify([p.kind, n, puzzle, solution, regions, cages, links]);
        if (!best || key < best)
            best = key;
    }
    return best;
}
export async function fingerprintPuzzle(p) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPuzzle(p))); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''); }
export function publicDaily(p) { const { solution, ...safe } = p; return safe; }
