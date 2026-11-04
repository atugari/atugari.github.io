'use strict';

const workers = [];
const maxLanes = 16;
let active;

function stopWorker(current) {
  const index = workers.indexOf(current);
  if (index === -1) return;
  workers.splice(index, 1);
  active?.pending.delete(current);
  current.terminate();
}

function trimWorkers(count) {
  while (workers.length > count) stopWorker(workers[workers.length - 1]);
}

function complete(round, result, restart = false) {
  if (active !== round) return;
  active = undefined;
  clearTimeout(round.timer);
  if (restart) trimWorkers(0);
  else for (const current of round.pending.keys()) stopWorker(current);
  RefillBridge.finish(round.id, JSON.stringify(result));
}

function settle(round) {
  if (round.pending.size !== 0) return;
  const result = round.results ? {results: round.results} : round.outcome ?? {exhausted: true};
  complete(round, result);
}

function recordPuzzle(round, entry) {
  if (typeof RefillBridge.record !== 'function') {
    round.results.push(entry);
    return;
  }
  try {
    // Send each board separately to avoid transferring a whole batch at once.
    if (RefillBridge.record(round.id, JSON.stringify(entry)) === true) return;
  } catch {
    // Keep the other lanes running when this board cannot cross the bridge.
  }
  round.results.push({profile: entry.profile, error: 'engine'});
}

function receive(current, result) {
  const round = active;
  const profile = round?.pending.get(current);
  if (profile === undefined) return;
  round.pending.delete(current);
  if (result?.puzzle && result.profile === profile) {
    if (!round.results) {
      // Stop searches for the same reservation as soon as one valid puzzle wins.
      complete(round, {profile, puzzle: result.puzzle});
      return;
    }
    recordPuzzle(round, {profile, puzzle: result.puzzle});
  } else {
    const outcome = result?.exhausted ? {exhausted: true} : {error: result?.error ?? 'engine'};
    if (!outcome.exhausted) stopWorker(current);
    if (round.results) round.results.push({profile, ...outcome});
    else if (outcome.exhausted || !round.outcome) round.outcome = outcome;
  }
  settle(round);
}

function createWorker() {
  const current = new Worker('round.js');
  current.onmessage = ({data}) => {
    if (data.id === active?.id) receive(current, data.result);
  };
  current.onerror = () => {
    if (active?.pending.has(current)) receive(current, {error: 'engine'});
    else stopWorker(current);
  };
  return current;
}

window.runRefillRound = function (id, profileOrProfiles, budgetMs, laneCount = 1) {
  if (active) {
    RefillBridge.finish(id, JSON.stringify({error: 'busy'}));
    return;
  }
  const count = Number.isInteger(laneCount) ? Math.max(1, Math.min(laneCount, maxLanes)) : 1;
  const batch = Array.isArray(profileOrProfiles);
  const profiles = batch ? profileOrProfiles.slice(0, count) : Array(count).fill(profileOrProfiles);
  const round = {id, pending: new Map(), results: batch ? [] : null};
  active = round;
  // Some release generators only check their own deadlines. The page can end
  // any stuck worker without running search code on the WebView's UI thread.
  round.timer = setTimeout(() => {
    if (round.results) {
      for (const profile of round.pending.values()) round.results.push({profile, exhausted: true});
    }
    complete(round, round.results ? {results: round.results} : {exhausted: true}, true);
  }, budgetMs);
  trimWorkers(profiles.length);
  while (workers.length < profiles.length) {
    try {
      workers.push(createWorker());
    } catch {
      // A resource limit can prevent adding a helper. Let the existing lanes finish.
      if (workers.length === 0) {
        complete(round, batch ? {results: [], error: 'engine'} : {error: 'engine'});
        return;
      }
      break;
    }
  }
  workers.forEach((current, lane) => round.pending.set(current, profiles[lane]));
  for (const [current, profile] of round.pending) {
    if (active !== round) break;
    try {
      // A cooperative expiry keeps the worker's partial search cache.
      const headroomCapMs = profile.startsWith('normal:100:') ? 5000 : 2000;
      const headroomMs = Math.min(headroomCapMs, Math.floor(budgetMs / 10));
      current.postMessage({id, profile, budgetMs: Math.max(500, budgetMs - headroomMs)});
    } catch {
      receive(current, {error: 'engine'});
    }
  }
  settle(round);
};

window.setRefillLaneLimit = function (id, laneCount) {
  const round = active;
  if (round?.id !== id || !Number.isInteger(laneCount) || laneCount < 1) return;
  // Drop later lanes first to keep the earliest worker's search cache.
  trimWorkers(laneCount);
  settle(round);
};
