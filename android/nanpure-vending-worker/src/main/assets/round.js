'use strict';

importScripts('engine.js');

const generate = NanpureResolution.generate;

self.onmessage = event => {
  const budgetMs = event.data;
  if (!Number.isInteger(budgetMs) || budgetMs < 500 || budgetMs > 120000) {
    self.postMessage({error: 'budget'});
    return;
  }

  // Keep the release worker's puzzle and proof checks. End this worker's slice
  // when the resolution search runs out of time, before NPGenerate starts again.
  const exhausted = new Error('refill-slice-complete');
  NanpureResolution.generate = function (id, progress) {
    try {
      return generate(id, progress, {budgetMs});
    } catch (error) {
      if (error?.code === 'NP_SEARCH_EXHAUSTED') throw exhausted;
      throw error;
    }
  };
  try {
    const condition = {kind: 'normal', n: 9, level: 18, count: 1, complexity: 2};
    const puzzle = NPGenerate(condition, () => {});
    NP.validate(puzzle);
    if (!NPGenerationMatches(puzzle, condition) ||
        !puzzle.rating?.unique || !puzzle.rating?.noGuess ||
        !Array.isArray(puzzle.logicProof) || !puzzle.logicProof.length) {
      throw new Error('invalid generated puzzle');
    }
    self.postMessage({puzzle});
  } catch (error) {
    self.postMessage(error === exhausted ? {exhausted: true} : {error: 'engine'});
  } finally {
    NanpureResolution.generate = generate;
  }
};
