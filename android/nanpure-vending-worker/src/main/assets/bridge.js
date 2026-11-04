'use strict';

window.runRefillRound = function (budgetMs) {
  const worker = new Worker('round.js');
  function complete(message) {
    worker.terminate();
    RefillBridge.finish(JSON.stringify(message));
  }
  worker.onmessage = event => complete(event.data);
  worker.onerror = () => complete({error: 'engine'});
  worker.postMessage(budgetMs);
};
