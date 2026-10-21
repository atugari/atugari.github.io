import { generatorEngine } from '../../scripts/stock-generator-engine.js';
import { validateStock } from './stock-puzzle.js';
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
export function engineLevel(kind, n, level) { return (kind === 'normal' ? (n === 6 ? [1, 2, 3] : n === 9 ? [2, 5, 8] : [1, 3, 4]) : kind === 'neighbor' ? [1, 2, 4] : [1, 3, 4])[level - 1]; }
export async function generateStock(kind, n, level, budgetMs = 1800) {
    const e = generatorEngine(), target = engineLevel(kind, n, level), deadline = performance.now() + budgetMs;
    let p;
    if (kind === 'normal' && n === 9) {
        const search = e.Nanpure.makeSearch(target, { sym: true, exactOnly: true });
        while (performance.now() < deadline) {
            const candidate = search.step();
            if (candidate) {
                p = { ...candidate, kind, n, level: target, puzzle: e.NP.flat(candidate.puzzle), solution: e.NP.flat(candidate.solution) };
                break;
            }
            await pause();
        }
        if (!p)
            return null;
        if (!e.Nanpure.hasUniqueSolution(Array.from({ length: 9 }, (_, r) => p.puzzle.slice(r * 9, r * 9 + 9))))
            throw Error('Nonunique generated puzzle');
        e.NP.validate(p);
    }
    else {
        try {
            p = e.NPGenerate({ kind, n, level: target, complexity: 2 }, () => { if (performance.now() > deadline)
                throw Error('stock-search-budget'); });
        }
        catch (error) {
            if (error.message === 'stock-search-budget')
                return null;
            throw error;
        }
    }
    const result = { kind, n, level, engineLevel: target, puzzle: Array.from(p.puzzle), solution: Array.from(p.solution), regions: Array.from(e.NP.regions(p)), cages: p.cages, links: p.links, rating: p.rating, verification: p.verification };
    validateStock(result);
    return result;
}
