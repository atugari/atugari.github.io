'use strict';

let worker;
let active;

function complete(result, restart) {
  const round = active;
  if (!round) return;
  active = undefined;
  clearTimeout(round.timer);
  if (restart && worker) {
    worker.terminate();
    worker = undefined;
  }
  RefillBridge.finish(round.id, JSON.stringify(result));
}

window.runRefillRound = function (id, profile, budgetMs) {
  if (active) {
    RefillBridge.finish(id, JSON.stringify({error: 'busy'}));
    return;
  }
  // Some release generators only check their own deadlines. The page can end
  // any stuck worker without running search code on the WebView's UI thread.
  active = {id, timer: setTimeout(() => complete({exhausted: true}, true), budgetMs)};
  try {
    if (!worker) {
      const current = new Worker('round.js');
      current.onmessage = ({data}) => {
        if (worker === current && data.id === active?.id) complete(data.result, false);
      };
      current.onerror = () => {
        if (worker === current) complete({error: 'engine'}, true);
      };
      worker = current;
    }
    // Leave room for a progress callback to report expiry before the hard
    // watchdog. A cooperative expiry keeps the worker's partial search cache.
    const headroomCapMs = profile.startsWith('normal:100:') ? 5000 : 2000;
    const headroomMs = Math.min(headroomCapMs, Math.floor(budgetMs / 10));
    const searchBudgetMs = Math.max(500, budgetMs - headroomMs);
    worker.postMessage({id, profile, budgetMs: searchBudgetMs});
  } catch (error) {
    complete({error: 'engine'}, true);
  }
};
