'use strict';

importScripts('engine.js');

const pilot = 'normal:9:18:0::::';
const profiles = new Map(REFILL_PROFILES.map(profile => [profile.key, profile]));
const generateResolution = NanpureResolution.generate;

self.onmessage = ({data: {id, profile, budgetMs}}) => {
  const send = result => self.postMessage({id, result});
  if (!Number.isInteger(budgetMs) || budgetMs < 500 || budgetMs > 120000) {
    send({error: 'budget'});
    return;
  }
  const condition = profiles.get(profile);
  if (!condition) {
    send({error: 'profile'});
    return;
  }

  const deadline = performance.now() + budgetMs;
  const exhausted = new Error('refill-slice-complete');
  const checkTime = () => {
    if (performance.now() >= deadline) throw exhausted;
  };
  if (profile === pilot) {
    // The site's pilot checks the release resolution proof independently.
    // Stop before the release generator can start another search slice.
    NanpureResolution.generate = function (id, progress) {
      try {
        return generateResolution(id, progress, {budgetMs});
      } catch (error) {
        if (error?.code === 'NP_SEARCH_EXHAUSTED') throw exhausted;
        throw error;
      }
    };
  }
  try {
    const puzzle = NPGenerate({...condition, count: 1}, checkTime);
    if (!NPGenerationMatches(puzzle, condition) || !NP.validate(puzzle) ||
        (profile === pilot && (!puzzle.rating?.unique || !puzzle.rating?.noGuess ||
          !Array.isArray(puzzle.logicProof) || !puzzle.logicProof.length))) {
      throw new Error('invalid generated puzzle');
    }
    send({profile, puzzle});
  } catch (error) {
    send(error === exhausted || error?.code === 'NP_SEARCH_EXHAUSTED' ?
      {exhausted: true} : {error: 'engine'});
  } finally {
    NanpureResolution.generate = generateResolution;
  }
};
