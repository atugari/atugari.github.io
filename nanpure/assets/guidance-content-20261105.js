(() => {
  'use strict';
  const root = document.getElementById('root');
  if (!root) return;

  function addAdvertisingNotice(legal) {
    const title = legal.querySelector('h1');
    if (!title || legal.querySelector('#advertising')) return;
    // Keep ordinary text nodes so the site's language and furigana controls apply.
    const section = document.createElement('section');
    section.id = 'advertising';
    section.innerHTML = `<h2>広告とCookie</h2>
      <p>Google AdSenseで広告を配信する場合、Googleや提携する第三者の広告配信事業者はCookieを利用します。このサイトやほかのサイトへの過去のアクセスに基づいて、興味に合った広告を表示することがあります。</p>
      <ul>
        <li><a href="https://adssettings.google.com/">Googleの広告設定でパーソナライズド広告を無効にする</a></li>
        <li><a href="https://optout.aboutads.info/">WebChoicesで参加企業の広告のパーソナライズを無効にする</a></li>
        <li><a href="https://policies.google.com/technologies/partner-sites">Googleによるデータの利用について</a></li>
      </ul>`;
    title.after(section);
  }

  const watchedParagraphs = new WeakSet();
  const introSelector = '.difficulty-screen .start-title > h1 + p + p';
  const sampleSelector = '.text-size-sample';
  function updateRankingGuidance(root) {
    const labels = window.NPI18n;
    if (!labels) return;
    function update(paragraph) {
      if (!paragraph) return;
      function sync() {
        const includePractice = paragraph.matches(introSelector);
        if (!paragraph.isConnected || (!includePractice && !paragraph.matches(sampleSelector))) return;
        let text = labels.t('日替わり問題をクリアすると、自動でランキングに記録されます。');
        if (includePractice) text += ' ' + labels.t('同じ問題は1人1記録。練習プレイは集計しません。');
        if (paragraph.textContent === text) return;
        if (paragraph.querySelector('rt')) {
          const copy = paragraph.cloneNode(true);
          copy.querySelectorAll('rt').forEach(node => node.remove());
          if (copy.textContent === text) return;
        }
        paragraph.textContent = text;
      }
      if (!watchedParagraphs.has(paragraph)) {
        // React can restore the old wording after a language change has completed.
        new MutationObserver(sync).observe(paragraph, {subtree: true, childList: true, characterData: true});
        watchedParagraphs.add(paragraph);
      }
      sync();
    }
    update(root.querySelector(introSelector));
    update(root.querySelector(sampleSelector));
  }

  const screens = 'main.legal,.difficulty-screen,.text-size-sample';
  function updateScreen() {
    const legal = root.querySelector('main.legal');
    if (legal) addAdvertisingNotice(legal);
    updateRankingGuidance(root);
  }

  updateScreen();
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE &&
            (node.matches(screens) || (node.firstElementChild && node.querySelector(screens)))) {
          updateScreen();
          return;
        }
      }
    }
  }).observe(root, {childList: true, subtree: true});
  window.addEventListener('np-language-change', () => requestAnimationFrame(updateScreen));
})();
