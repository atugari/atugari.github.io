// Real Chromium checks for the shared keyboard runtime. Fixtures model the
// native/custom overlays and pre-existing event handlers used by the notebook.
// Every user action is a real key press; evaluate() only observes state.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const runtime = path.resolve(__dirname, 'client-overrides/public/keyboard-access.js');
const fixture = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>body{font:18px sans-serif;padding:24px}button,input,textarea,[contenteditable]{margin:8px;padding:10px}.overlay{position:fixed;inset:15%;padding:24px;background:#fff;border:2px solid #333;z-index:10}dialog{padding:24px}</style>
</head><body><main id="app"><h1>キーボード確認</h1>
<button id="launch-native">設定</button><button id="launch-custom">確認</button>
<button id="launch-busy">保存中</button><button id="launch-proof">印刷の見本</button>
<button id="launch-pause">一時停止</button><button id="repaint-control" data-action="repaint">表示更新</button>
<input id="entry" aria-label="表示名"><textarea id="note" aria-label="メモ"></textarea>
<div id="editor" contenteditable="true" tabindex="0" aria-label="編集欄"></div>
<button id="after">次へ</button></main>
<dialog id="native"><h2>設定</h2><button id="native-first">表示更新</button><input id="native-text" aria-label="設定値"><button id="native-close" class="dialog-close">閉じる</button></dialog>
<dialog id="busy"><h2>保存中</h2><button id="busy-finish">保存を完了</button><button id="busy-close" disabled>閉じる</button></dialog>
</body></html>`;

// Installed before the runtime, as the notebook's parser-loaded scripts are.
const fixtureScript = () => {
  const get = id => document.getElementById(id);
  window.audit = {nativeRepaints:0, repaints:0, cancels:0, proofEscapes:0, proofTabs:0, pauseEscapes:0, pauseTabs:0, resumes:0};
  get('launch-native').onclick = () => get('native').showModal();
  get('native-close').onclick = () => get('native').close();
  get('native-first').onclick = function redraw() {
    const next = this.cloneNode(true); next.onclick = redraw;
    this.replaceWith(next); window.audit.nativeRepaints++;
  };
  get('repaint-control').onclick = function redraw() {
    const next = this.cloneNode(true); next.onclick = redraw;
    this.replaceWith(next); window.audit.repaints++;
  };
  get('launch-custom').onclick = () => {
    const wrapper = document.createElement('div'); wrapper.id = 'custom-wrap';
    wrapper.innerHTML = '<section id="custom" class="overlay" role="dialog" aria-modal="true" aria-label="確認"><h2>確認</h2><button id="custom-first">選択</button><button id="custom-close" data-action="modal-close">閉じる</button></section>';
    document.body.append(wrapper);
    get('custom-close').onclick = () => wrapper.remove();
    get('custom-first').focus();
  };
  let busy = false;
  get('launch-busy').onclick = () => {busy = true; get('busy-close').disabled = true; get('busy').showModal();};
  get('busy').addEventListener('cancel', event => {window.audit.cancels++; if (busy) event.preventDefault();});
  get('busy-finish').onclick = () => {busy = false; get('busy-close').disabled = false;};
  get('busy-close').onclick = () => get('busy').close();
  const closeProof = () => {get('proof-viewer')?.remove(); get('app').removeAttribute('aria-hidden');};
  get('launch-proof').onclick = () => {
    const proof = document.createElement('div'); proof.id = 'proof-viewer'; proof.className = 'overlay';
    proof.setAttribute('role', 'dialog'); proof.setAttribute('aria-modal', 'true'); proof.setAttribute('aria-label', '印刷の見本');
    proof.innerHTML = '<strong>印刷の見本</strong><button id="proof-close" data-action="proof-close">閉じる</button><button id="proof-last">次のページ</button>';
    document.body.append(proof); get('app').setAttribute('aria-hidden', 'true');
    get('proof-close').onclick = closeProof; get('proof-close').focus();
  };
  // The original proof viewer listens in the document bubble phase.
  document.addEventListener('keydown', event => {
    const proof = get('proof-viewer'); if (!proof) return;
    if (event.key === 'Escape') {window.audit.proofEscapes++; event.preventDefault(); closeProof();}
    if (event.key === 'Tab') {
      window.audit.proofTabs++;
      const buttons = [...proof.querySelectorAll('button')], active = document.activeElement;
      if (!proof.contains(active) || event.shiftKey && active === buttons[0] || !event.shiftKey && active === buttons.at(-1)) {
        event.preventDefault(); (event.shiftKey ? buttons.at(-1) : buttons[0]).focus();
      }
    }
  });
  const resume = () => {window.audit.resumes++; get('video-pause')?.remove();};
  get('launch-pause').onclick = () => {
    const wrapper = document.createElement('div'); wrapper.id = 'video-pause';
    wrapper.innerHTML = '<section id="pause-dialog" class="overlay" role="dialog" aria-modal="true" aria-label="一時停止"><h2>一時停止</h2><button id="pause-resume" data-video="resume">再開する</button><button id="pause-last">最初から遊ぶ</button></section>';
    document.body.append(wrapper); get('pause-resume').onclick = resume; get('pause-resume').focus();
  };
  // video-features.js registers this capture handler before the shared runtime.
  document.addEventListener('keydown', event => {
    if (!get('video-pause')) return;
    if (event.key === 'Escape') {window.audit.pauseEscapes++; event.preventDefault(); event.stopImmediatePropagation(); resume(); return;}
    if (event.key === 'Tab') {
      window.audit.pauseTabs++;
      const buttons = [...get('video-pause').querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
};

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function press(page, key) {await page.keyboard.press(key); await settle(page);}
async function focused(page, selector, label) {
  const state = await page.evaluate(selector => ({matches:!!document.activeElement?.matches(selector), active:document.activeElement?.outerHTML.slice(0,300)}), selector);
  assert(state.matches, `${label}; expected ${selector}, active ${state.active}`);
}
async function tabTo(page, selector) {
  for (let attempt = 0; attempt < 35; attempt++) {
    if (await page.evaluate(selector => !!document.activeElement?.matches(selector), selector)) return;
    await press(page, 'Tab');
  }
  await focused(page, selector, 'Reachable using Tab');
}
async function isOpen(page, selector) {return page.evaluate(selector => !!document.querySelector(selector), selector);}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || undefined, args:['--no-sandbox']});
  let passed = 0;
  async function check(name, test) {
    const page = await browser.newPage({viewport:{width:1100,height:850}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.setContent(fixture);
      await page.addScriptTag({content:`(${fixtureScript.toString()})();`});
      await page.addScriptTag({path:runtime});
      await settle(page);
      await test(page);
      assert.deepEqual(errors, [], 'No uncaught browser errors');
      console.log('PASS ' + name); passed++;
    } finally {await page.close();}
  }
  try {
    await check('native dialog: Tab / Shift+Tab, redraw, Escape, opener recovery', async page => {
      await tabTo(page, '#launch-native'); await press(page, 'Enter');
      await focused(page, '#native-first', 'Native dialog opens on its first control');
      await press(page, 'Shift+Tab'); await focused(page, '#native-close', 'Shift+Tab wraps inside native dialog');
      await press(page, 'Tab'); await focused(page, '#native-first', 'Tab wraps inside native dialog');
      await press(page, 'Enter'); await focused(page, '#native-first', 'Replaced native-dialog control recovers focus');
      assert.equal(await page.evaluate(() => window.audit.nativeRepaints), 1);
      await press(page, 'Tab'); await focused(page, '#native-text', 'Native field remains reachable');
      await press(page, '?'); assert.equal(await page.locator('#native-text').inputValue(), '?');
      assert.equal(await isOpen(page, '#np-keyboard-help[open]'), false, 'Typing ? in a field does not open help');
      await press(page, 'Tab'); await focused(page, '#native-close', 'Native close remains reachable');
      await press(page, 'Escape'); assert.equal(await isOpen(page, '#native[open]'), false);
      await focused(page, '#launch-native', 'Native Escape restores its opener');
    });
    await check('custom dialog: bounded Tab order and Escape recovery', async page => {
      await tabTo(page, '#launch-custom'); await press(page, 'Enter');
      await focused(page, '#custom-first', 'Custom dialog first control');
      await press(page, 'Shift+Tab'); await focused(page, '#custom-close', 'Custom Shift+Tab wraps');
      await press(page, 'Tab'); await focused(page, '#custom-first', 'Custom Tab wraps');
      await press(page, 'Tab'); await focused(page, '#custom-close', 'Custom forward order');
      await press(page, 'Escape'); assert.equal(await isOpen(page, '#custom'), false);
      await focused(page, '#launch-custom', 'Custom Escape restores its opener');
    });
    await check('reused help above a later proof viewer keeps the top layer and returns twice', async page => {
      await tabTo(page, '#launch-proof'); await press(page, '?');
      assert.equal(await isOpen(page, '#np-keyboard-help[open]'), true);
      await press(page, 'Escape'); await focused(page, '#launch-proof', 'First help close restores its opener');
      await press(page, 'Enter'); await focused(page, '#proof-close', 'Proof opens after the persistent help element');
      await press(page, 'Tab'); await focused(page, '#proof-last', 'Proof forward order');
      await press(page, '?');
      await focused(page, '#np-keyboard-help button', 'Reused help receives focus above the proof viewer');
      assert.equal(await page.evaluate(() => !!(document.getElementById('np-keyboard-help').compareDocumentPosition(document.getElementById('proof-viewer')) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'Fixture preserves the DOM/top-layer order inversion');
      await press(page, 'Tab'); await focused(page, '#np-keyboard-help button', 'Tab stays in reused help');
      await press(page, 'Shift+Tab'); await focused(page, '#np-keyboard-help button', 'Shift+Tab stays in reused help');
      await press(page, 'Escape');
      assert.equal(await isOpen(page, '#np-keyboard-help[open]'), false);
      assert.equal(await isOpen(page, '#proof-viewer'), true, 'Escape only closes the top help dialog');
      await focused(page, '#proof-last', 'Help returns to the exact proof control');
      assert.deepEqual(await page.evaluate(() => ({tabs:window.audit.proofTabs, escapes:window.audit.proofEscapes})), {tabs:0, escapes:0}, 'Underlying proof handlers never receive modal Tab/Escape');
      await press(page, 'Escape'); assert.equal(await isOpen(page, '#proof-viewer'), false);
      await focused(page, '#launch-proof', 'Closing the proof returns to its original opener');
    });
    await check('help above pause outranks an earlier document capture listener', async page => {
      await tabTo(page, '#launch-pause'); await press(page, 'Enter');
      await focused(page, '#pause-resume', 'Pause first control');
      await press(page, 'Tab'); await focused(page, '#pause-last', 'Pause forward order');
      await press(page, '?'); await focused(page, '#np-keyboard-help button', 'Help above pause receives focus');
      await press(page, 'Tab'); await focused(page, '#np-keyboard-help button', 'Earlier capture listener cannot steal Tab');
      await press(page, 'Shift+Tab'); await focused(page, '#np-keyboard-help button', 'Earlier capture listener cannot steal Shift+Tab');
      await press(page, 'Escape');
      assert.equal(await isOpen(page, '#np-keyboard-help[open]'), false);
      assert.equal(await isOpen(page, '#video-pause'), true, 'Help Escape leaves the game paused');
      await focused(page, '#pause-last', 'Help restores the paused control');
      assert.deepEqual(await page.evaluate(() => ({tabs:window.audit.pauseTabs, escapes:window.audit.pauseEscapes, resumes:window.audit.resumes})), {tabs:0, escapes:0, resumes:0}, 'Earlier document capture listener never handles modal Tab/Escape');
      await press(page, 'Escape'); assert.equal(await isOpen(page, '#video-pause'), false);
      assert.equal(await page.evaluate(() => window.audit.resumes), 1);
      await focused(page, '#launch-pause', 'Pause close restores its opener');
    });
    await check('native cancel guard remains effective while work is busy', async page => {
      await tabTo(page, '#launch-busy'); await press(page, 'Enter');
      await press(page, 'Escape');
      assert.equal(await isOpen(page, '#busy[open]'), true, 'Busy cancel handler prevents dismissal');
      assert.equal(await page.evaluate(() => window.audit.cancels), 1, 'Escape dispatches the native cancel event');
      await focused(page, '#busy-finish', 'Rejected cancellation keeps focus inside');
      await press(page, 'Enter'); await press(page, 'Escape');
      assert.equal(await isOpen(page, '#busy[open]'), false, 'Native cancellation works after saving ends');
      assert.equal(await page.evaluate(() => window.audit.cancels), 2);
      await focused(page, '#launch-busy', 'Busy dialog returns to its opener');
    });
    await check('ordinary redraw restores focus and text editing keeps question marks', async page => {
      await tabTo(page, '#repaint-control'); await press(page, 'Enter');
      assert.equal(await page.evaluate(() => window.audit.repaints), 1);
      await focused(page, '#repaint-control', 'Replacement control recovers focus');
      await press(page, 'Tab'); await focused(page, '#entry', 'Tab continues after the replaced control');
      await press(page, '?'); assert.equal(await page.locator('#entry').inputValue(), '?');
      await press(page, 'Tab'); await focused(page, '#note', 'Textarea reachable');
      await press(page, '?'); assert.equal(await page.locator('#note').inputValue(), '?');
      await press(page, 'Tab'); await focused(page, '#editor', 'Editable content reachable');
      await press(page, '?'); assert.equal(await page.locator('#editor').textContent(), '?');
      assert.equal(await isOpen(page, '#np-keyboard-help[open]'), false, 'Text entry does not invoke help');
      await press(page, 'Tab'); await focused(page, '#after', 'Can leave all editable controls');
      await press(page, 'Control+?'); assert.equal(await isOpen(page, '#np-keyboard-help[open]'), false, 'Modified question mark does not invoke help');
      await press(page, '?'); assert.equal(await isOpen(page, '#np-keyboard-help[open]'), true, 'Unmodified question mark invokes help');
      await press(page, 'Escape'); await focused(page, '#after', 'Help restores the initiating control');
    });
    console.log(`Keyboard dialogs: ${passed} Chromium checks passed.`);
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
