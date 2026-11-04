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
    worker.postMessage({id, profile, budgetMs});
  } catch (error) {
    complete({error: 'engine'}, true);
  }
};
