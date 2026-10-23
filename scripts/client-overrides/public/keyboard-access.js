/* Keyboard navigation shared by the shell and the notebook documents. */
(() => {
  'use strict';
  if (window.NPKeyboard) return;
  const controls = 'button,a[href],input:not([type="hidden"]),select,textarea,summary,iframe,[tabindex]';
  const modalSelector = 'dialog[open],[role="dialog"][aria-modal="true"]:not(dialog)';
  let keyboard = false, queued = false, lastFocus = null, bookmark = null, opener = null, screen = '';
  let activeModals = [];
  const returns = new WeakMap();
  const t = text => window.NPI18n?.t(text) || text;
  const visible = element => !!(element?.isConnected && !element.closest('[hidden],[inert],[aria-hidden="true"]') && element.getClientRects().length);
  const enabled = element => visible(element) && !element.matches(':disabled,[aria-disabled="true"]');
  const focusables = root => Array.from(root.querySelectorAll(controls)).filter(element => enabled(element) && element.tabIndex >= 0);
  const modals = () => {
    const found = Array.from(document.querySelectorAll(modalSelector)).filter(visible);
    const ordered = [...activeModals.filter(modal => found.includes(modal)), ...found.filter(modal => !activeModals.includes(modal))];
    // A reused native dialog may precede a newer custom dialog in DOM order.
    // Focus follows the browser's top layer; keep its dialog at the top.
    const focused = document.activeElement?.closest?.(modalSelector);
    if (focused && ordered.includes(focused)) ordered.push(...ordered.splice(ordered.indexOf(focused),1));
    return ordered;
  };
  const topModal = () => modals().at(-1);
  const editable = element => !!element?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  function describe(element) {
    if (!element || element === document.body || element === document.documentElement) return null;
    const attrs = {};
    for (const name of ['data-action','data-act','data-a','data-cell','data-key','data-video','data-recovery','data-transfer','data-level','data-uid','data-kind','data-number','name']) {
      if (element.hasAttribute(name)) attrs[name] = element.getAttribute(name);
    }
    return {element, id:element.id, tag:element.tagName, attrs, label:element.getAttribute('aria-label'), text:element.textContent?.trim()};
  }
  function equivalent(saved, scope = document) {
    if (!saved) return null;
    if (enabled(saved.element) && scope.contains(saved.element)) return saved.element;
    const sameId = saved.id && document.getElementById(saved.id);
    if (sameId && enabled(sameId) && scope.contains(sameId)) return sameId;
    const attributes = Object.entries(saved.attrs);
    return Array.from(scope.querySelectorAll(controls)).find(element => enabled(element) && element.tagName === saved.tag &&
      (attributes.length ? attributes.every(([key,value]) => element.getAttribute(key) === value) :
        saved.label ? element.getAttribute('aria-label') === saved.label : saved.text && element.textContent?.trim() === saved.text)) || null;
  }
  function focus(element) {
    if (!enabled(element)) return;
    if (!element.matches(controls)) element.tabIndex = -1;
    element.focus({preventScroll:true});
    element.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  function contentRoot() {
    return Array.from(document.querySelectorAll('main')).find(visible) || document.getElementById('app') || document.body;
  }
  function screenKey() {
    const root = contentRoot();
    return window.NPRouteKey || [root.className, root.querySelector('h1')?.textContent || '', document.querySelector('[class*="mode-"]')?.className || ''].join('|');
  }
  function firstContent(root) {
    return Array.from(root.querySelectorAll('h1,h2,[data-keyboard-heading]')).find(visible) || focusables(root)[0] || root;
  }
  function update() {
    queued = false;
    const nextModals = modals(), current = nextModals.at(-1), key = screenKey();
    for (const modal of nextModals) {
      if (!activeModals.includes(modal)) {
        const outside = [opener, bookmark, describe(lastFocus)].find(saved => saved?.element && !modal.contains(saved.element));
        returns.set(modal, outside || null);
      }
    }
    const closed = activeModals.filter(modal => !nextModals.includes(modal));
    activeModals = nextModals;
    const active = document.activeElement;
    if (keyboard && document.hasFocus()) {
      if (current && !current.contains(active)) {
        focus(equivalent(bookmark, current) || firstContent(current));
      } else if (closed.length && (!active || active === document.body || !visible(active))) {
        focus(equivalent(returns.get(closed.at(-1)), current || document) || firstContent(current || contentRoot()));
      } else if (!active || active === document.body || !visible(active)) {
        focus((key === screen ? equivalent(bookmark, current || document) : null) || firstContent(current || contentRoot()));
      }
    }
    screen = key;
    addSettingsHelp();
  }
  function schedule() {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }
  function closeCustomModal(modal) {
    const close = modal.querySelector('[data-action="modal-close"],[data-action="proof-close"],[data-video="resume"],[data-action="close"],[data-act="close"],.dialog-close');
    if (close && enabled(close)) { close.click(); return true; }
    return false;
  }
  function table(rows) {
    const result = document.createElement('dl'); result.className = 'np-keyboard-rows';
    for (const [key,description] of rows) {
      const term = document.createElement('dt'), detail = document.createElement('dd'), kbd = document.createElement('kbd');
      kbd.textContent = key; kbd.setAttribute('translate','no'); kbd.setAttribute('data-i18n-skip','');
      term.append(kbd); detail.textContent = t(description); result.append(term,detail);
    }
    return result;
  }
  function showHelp() {
    let dialog = document.getElementById('np-keyboard-help');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'np-keyboard-help'; dialog.className = 'np-keyboard-help';
      dialog.setAttribute('aria-labelledby','np-keyboard-help-title');
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      document.body.append(dialog);
    }
    if (dialog.open) return;
    opener = describe(document.activeElement);
    dialog.replaceChildren();
    const header = document.createElement('header'), title = document.createElement('h2'), close = document.createElement('button');
    title.id = 'np-keyboard-help-title'; title.textContent = t('キーボード操作');
    close.type = 'button'; close.textContent = t('閉じる') + ' ×'; close.addEventListener('click', () => dialog.close());
    header.append(title,close); dialog.append(header);
    const bindings=document.createElement('button');bindings.type='button';bindings.className='np-keyboard-entry';bindings.textContent=t('キーの割り当て');bindings.setAttribute('data-np-key-bindings','');bindings.addEventListener('click',()=>window.NPKeyBindings?.show());dialog.append(bindings);
    const standard=document.createElement('p');standard.textContent=t('以下は標準のキーです。変更したキーは「キーの割り当て」で確認できます。');dialog.append(standard);
    const section = (heading,rows,paragraphs = []) => {
      const container = document.createElement('section'), h = document.createElement('h3'); h.textContent = t(heading);
      container.append(h); if (rows.length) container.append(table(rows));
      for (const text of paragraphs) { const p = document.createElement('p'); p.textContent = t(text); container.append(p); }
      dialog.append(container);
    };
    section('画面の移動', [
      ['Tab / Shift+Tab','次の項目 / 前の項目'], ['Enter / Space','選択・実行'],
      ['Esc','設定・確認画面を閉じる'], ['?','操作一覧を開く']
    ], ['メモ・ヒント・設定・印刷も、Tabでボタンを選んで操作できます。']);
    section('数字の盤面', [
      ['↑ ↓ ← →','マスを移動'], ['Home / End','行の先頭 / 末尾'], ['1–9 / A–Z','数字を入力'], ['Delete / Backspace / 0','入力した数字を消す']
    ], [
      'Tabで盤面に入り、矢印キーで移動します。Tabで盤面から出られます。',
      '10〜35はA〜Z。36以上は数字ボタンをTabで選び、Enterで入力します。',
      '数字先行モードでは、数字を選んだあとマスへ移動し、EnterまたはSpaceで入力します。'
    ]);
    section('シルプレ・こみち', [['↑ ↓ ← →','線やマスを移動'],['Enter / Space','印を切り替える']], [
      'こみちは、移動だけでは線を引きません。EnterかSpaceでマスを選んでつなぎます。'
    ]);
    section('クロスワード', [['↑ ↓ ← →','白マスを移動'],['Space','タテ・ヨコのカギを切り替える'],['Enter','文字入力欄へ移動・入力を確定']]);
    section('天秤', [['↑ ↓ ← →','記号を移動'],['Enter / Space','記号を選ぶ']], ['記号を選んだら、Tabで「答える」へ進み、Enterで回答します。']);
    dialog.showModal();
  }
  function addSettingsHelp() {
    for(const input of document.querySelectorAll('#np-play-settings [data-settings-panel="input"],#daily-settings-input')){
      if(input.querySelector('[data-np-key-bindings]'))continue;
      const bindings=document.createElement('button');bindings.type='button';bindings.className='np-keyboard-entry';bindings.setAttribute('data-np-key-bindings','');bindings.textContent=t('キーの割り当て');bindings.addEventListener('click',()=>window.NPKeyBindings?.show());input.prepend(bindings);
    }
    const panel = document.querySelector('#np-play-settings [data-settings-panel="help"]');
    if (!panel || panel.querySelector('[data-np-keyboard-help]')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'np-keyboard-entry';
    button.setAttribute('data-np-keyboard-help',''); button.textContent = t('キーボード操作');
    button.addEventListener('click', showHelp); panel.append(button);
  }
  document.addEventListener('pointerdown', () => { keyboard = false; }, true);
  document.addEventListener('focusin', event => {
    const previous = lastFocus;
    lastFocus = event.target; bookmark = describe(event.target);
    const modal = event.target.closest?.(modalSelector);
    if (modal && !returns.has(modal)) returns.set(modal, describe(previous));
  }, true);
  document.addEventListener('click', event => {
    const control = event.target.closest?.(controls);
    if (control) opener = describe(control);
  }, true);
  // Capture at window before legacy document handlers (for example Pause).
  // Only modal navigation and the help key are intercepted here.
  window.addEventListener('keydown', event => {
    if(window.NPKeyBindings?.handle(event))return;
    if (event.isComposing || event.keyCode === 229) return;
    keyboard = true;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === '?' && !editable(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation(); showHelp(); return;
    }
    const modal = topModal();
    if (!modal) return;
    if (event.key === 'Escape') {
      if (modal.tagName === 'DIALOG') {
        // Leave the native cancel event intact, including a busy backup's guard,
        // but do not let an underlying custom dialog close on the same key.
        event.stopImmediatePropagation(); return;
      }
      if (closeCustomModal(modal)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    }
    if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    event.stopImmediatePropagation();
    const items = focusables(modal), active = document.activeElement;
    if (!items.length) { event.preventDefault(); event.stopImmediatePropagation(); focus(modal); return; }
    if (event.shiftKey ? active === items[0] || !items.includes(active) : active === items.at(-1) || !modal.contains(active)) {
      event.preventDefault(); event.stopImmediatePropagation(); focus(event.shiftKey ? items.at(-1) : items[0]);
    }
  }, true);
  const style = document.createElement('style');
  style.textContent = `
    :is(a,button,input,select,textarea,summary,iframe,[tabindex]):focus-visible{outline:3px solid #185caa;outline-offset:3px;scroll-margin:20px}
    .np-keyboard-help{box-sizing:border-box;width:min(94vw,660px);max-height:88dvh;border:2px solid #546e61;border-radius:18px;padding:22px;color:#1d332a;background:#fffef9;overflow:auto}
    .np-keyboard-help::backdrop{background:#122b2477}
    .np-keyboard-help header{display:flex;align-items:center;gap:18px;margin-bottom:18px}
    .np-keyboard-help h2{flex:1;margin:0;font-size:max(22px,var(--ui-min-font,0px))}
    .np-keyboard-help button,.np-keyboard-entry{font:inherit;min-height:44px;padding:8px 14px;border:1px solid #60796b;border-radius:10px;color:inherit;background:#edf3e9;cursor:pointer}
    .np-keyboard-help section+section{margin-top:22px;border-top:1px solid #c5cfc5;padding-top:8px}
    .np-keyboard-help h3{margin:12px 0;font-size:max(17px,var(--ui-min-font,0px))}
    .np-keyboard-help p{font-size:max(14px,var(--ui-min-font,0px));line-height:1.75;margin:10px 0}
    .np-keyboard-rows{display:grid;grid-template-columns:minmax(125px,.8fr) minmax(0,1.2fr);gap:11px 14px;align-items:center;margin:12px 0}
    .np-keyboard-rows dt,.np-keyboard-rows dd{margin:0;min-width:0;overflow-wrap:anywhere;font-size:max(15px,var(--ui-min-font,0px))}
    .np-keyboard-rows kbd{font:inherit;font-weight:650;background:#edf0e8;border:1px solid #b3c0b2;border-bottom-width:3px;border-radius:5px;padding:2px 6px;display:inline-block}
    .np-keyboard-entry{display:block;width:100%;margin:12px 0}
    @media(forced-colors:active){:is(a,button,input,select,textarea,summary,iframe,[tabindex]):focus-visible{outline-color:Highlight}}
  `;
  document.head.append(style);
  window.NPKeyboard = {showHelp};
  function start() {
    screen = screenKey();
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','aria-hidden']});
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
