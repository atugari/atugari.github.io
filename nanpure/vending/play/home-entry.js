(() => {
  'use strict';
  const destination = '/nanpure/vending/play/';

  function mount() {
    const choices = document.querySelector('.designed-home .start-choices');
    const example = choices?.querySelector('.main-choice');
    if (!example || choices.querySelector('[data-vending-entry]')) return;

    const entry = document.createElement('a');
    entry.className = 'choice-card vending-choice';
    entry.dataset.vendingEntry = '';
    entry.href = destination;
    entry.append(...Array.from(example.children, child => child.cloneNode(true)));
    entry.querySelector('.art-emblem').textContent = '棚';
    entry.querySelector('.choice-copy strong').textContent = '問題の自販機';
    example.after(entry);
  }

  let queued = false;
  const app = document.querySelector('#root') || document.body;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      mount();
    });
  }).observe(app, {childList: true, subtree: true});
  mount();
})();
