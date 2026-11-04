import {resolutionLogic} from './vending-proof-engine.generated.js';

let geometry;

// The registered phone runs the full Lv18 grading. The service independently
// replays its certificate without re-running the much more expensive search.
export function verifyVendingProof(p) {
  if (p.resolutionVersion !== 1 || !Array.isArray(p.logicProof) ||
      !p.logicProof.some(step => step?.type === 'resolution')) return false;
  try {
    geometry ??= resolutionLogic.info(9);
    return resolutionLogic.certify(geometry, p.puzzle, p.logicProof) === true;
  } catch {
    return false;
  }
}
