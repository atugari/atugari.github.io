(() => {
  'use strict';
  const destination = '/nanpure/vending/play/';
  const label = '問題の自販機';
  window.NPTranslations ||= {};
  window.NPTranslations[label] = {
    en: 'Sudoku vending machine', 'zh-Hans': '数独自动售题机', 'zh-Hant': '數獨自動售題機',
    ko: '스도쿠 자판기', es: 'Máquina de sudokus', fr: 'Distributeur de sudokus', de: 'Sudoku-Automat',
    pt: 'Máquina de sudoku', it: 'Distributore di sudoku', nl: 'Sudokuautomaat', sv: 'Sudokuautomat',
    pl: 'Automat sudoku', cs: 'Automat na sudoku', ru: 'Автомат судоку', id: 'Mesin sudoku',
    vi: 'Máy phát Sudoku', th: 'ตู้แจกซูโดกุ', hi: 'सुडोकू मशीन', ar: 'آلة توزيع السودوكو'
  };

  function mount() {
    const choices = document.querySelector('.designed-home .start-choices');
    const example = choices?.querySelector('.main-choice');
    if (!example || choices.querySelector('[data-vending-entry]')) return;

    const entry = document.createElement('a');
    entry.className = 'choice-card vending-choice';
    entry.dataset.vendingEntry = '';
    entry.href = destination;
    entry.append(...Array.from(example.children, child => child.cloneNode(true)));
    const emblem = entry.querySelector('.art-emblem');
    emblem.textContent = '棚';
    emblem.translate = false;
    entry.querySelector('.choice-copy strong').textContent = label;
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
