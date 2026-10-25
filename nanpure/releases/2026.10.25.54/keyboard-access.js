/* Saved key assignments shared by the shell and every notebook document. */
(() => {
 'use strict';
 if(window.NPKeyBindings)return;
 const storageKey='np-key-bindings-v1',actions=new Map(),defaults=new Map();
 const t=text=>window.NPI18n?.t(text)||text;
 const chord=(code,shift=false,ctrl=false,alt=false)=>({code,shift,ctrl,alt});
 const signature=value=>[value.code,!!value.shift,!!value.ctrl,!!value.alt].join(':');
 function add(id,label,keys=[],kind='command'){actions.set(id,{id,label,kind});defaults.set(id,keys);}
 for(const [id,label,code]of [['up','上へ移動','ArrowUp'],['down','下へ移動','ArrowDown'],['left','左へ移動','ArrowLeft'],['right','右へ移動','ArrowRight'],['home','行の先頭','Home'],['end','行の末尾','End']])add(id,label,[chord(code)],'move');
 add('activate','選択・実行',[chord('Enter'),chord('NumpadEnter'),chord('Space')]);
 add('direction','タテ・ヨコのカギを切り替える',[chord('Space')]);
 add('erase','消す',[chord('Delete'),chord('Backspace'),chord('Digit0'),chord('Numpad0')]);
 for(const [id,label]of [['undo','1手戻す'],['memo','メモ'],['hint','ヒント'],['pause','一時停止する'],['settings','プレイ中の設定'],['help','キーボード操作']])add(id,label);
 for(let value=1;value<=100;value++){
  const keys=value<10?[chord('Digit'+value),chord('Numpad'+value)]:value<=35?[chord('Key'+String.fromCharCode(value+55)),chord('Key'+String.fromCharCode(value+55),true)]:[];
  add('digit-'+value,String(value),keys,'digit');
 }
 const editable=node=>!!node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
 const reserved=value=>!value||['Tab','Escape','CapsLock','NumLock','ScrollLock','ContextMenu','PrintScreen','Pause','F1','F3','F5','F6','F11','F12'].includes(value.code)||
  value.ctrl&&['KeyL','KeyR','KeyW','KeyT','KeyN','KeyF','KeyP','KeyS','KeyO','KeyH','KeyJ','KeyD','KeyU','KeyA','KeyC','KeyV','KeyX','Digit0','Equal','Minus','BracketLeft','BracketRight'].includes(value.code)||
  value.alt&&['ArrowLeft','ArrowRight','Home','F4','Space'].includes(value.code);
 function validChord(value){return !!value&&typeof value==='object'&&typeof value.code==='string'&&/^(?:Key[A-Z]|Digit[0-9]|Numpad(?:[0-9]|Enter|Add|Subtract|Multiply|Divide|Decimal|Equal)|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[0-9]|2[0-4])|Enter|Space|Home|End|PageUp|PageDown|Backspace|Delete|Insert|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|IntlBackslash|IntlRo|IntlYen|Semicolon|Quote|Comma|Period|Slash)$/.test(value.code)&&['shift','ctrl','alt'].every(key=>typeof value[key]==='boolean')&&!reserved(value);}
 function validate(value){
  if(!value||value.version!==1||!value.bindings||typeof value.bindings!=='object'||Array.isArray(value.bindings)||Object.keys(value.bindings).length>actions.size)throw Error('Invalid bindings');
  const bindings={};
  for(const [id,keys]of Object.entries(value.bindings)){
   if(!actions.has(id)||!Array.isArray(keys)||keys.length>6||keys.some(key=>!validChord(key)))throw Error('Invalid binding');
   bindings[id]=keys.map(key=>chord(key.code,key.shift,key.ctrl,key.alt));
  }
  const used=new Set();
  // Explicit custom bindings win over defaults. Reject duplicate custom keys
  // rather than allowing malformed imported data to select an arbitrary action.
  for(const keys of Object.values(bindings))for(const key of keys){const value=signature(key);if(used.has(value))throw Error('Duplicate binding');used.add(value);}
  return bindings;
 }
 function read(){try{const raw=localStorage.getItem(storageKey);return raw&&raw.length<=32768?validate(JSON.parse(raw)):{};}catch{return {};}}
 let saved=read(),draft={},recording=null,dialog=null,notice=null,range=9;
 function keysFor(id,config=saved){return Object.hasOwn(config,id)?config[id]:defaults.get(id)||[];}
 function format(value){
  const names={ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'Space',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
  let name=names[value.code]||value.code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'Num ');
  return[value.ctrl?'Ctrl':null,value.alt?'Alt':null,value.shift?'Shift':null,name].filter(Boolean).join(' + ');
 }
 function label(id){const action=actions.get(id);return action?.kind==='digit'?t('入力する数字')+' '+action.label:t(action?.label||id);}
 function setNotice(text){if(notice)notice.textContent=text;}
 function currentSize(){const free=window.NanpureAppTest?.getCurrent?.();if(free?.n)return free.n;const count=document.querySelectorAll('.mode-daily .keypad [data-native-number]').length;return count||9;}
 function replace(id,keys){
  const signatures=new Set(keys.map(signature)),removed=[];
  for(const other of actions.keys())if(other!==id){const old=keysFor(other,draft),next=old.filter(key=>!signatures.has(signature(key)));if(next.length!==old.length){draft[other]=next;removed.push(label(other));}}
  draft[id]=keys.map(key=>({...key}));return removed;
 }
 const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 function button(text,run,cls=''){const node=make('button',t(text),cls);node.type='button';node.addEventListener('click',run);return node;}
 function row(id){
  const node=make('div',undefined,'np-binding-row');node.dataset.bindingAction=id;
  const text=make('span',label(id),'np-binding-label'),key=make('kbd',keysFor(id,draft).map(format).join(' / ')||t('割り当てなし'));
  key.setAttribute('translate','no');key.setAttribute('data-i18n-skip','');node.append(text,key);
  const controls=make('span',undefined,'np-binding-buttons');
  const change=button('変更',()=>{
   recording=id;setNotice(t('使いたいキーを押してください。Escで取り消せます。')+' '+label(id));
   for(const other of dialog.querySelectorAll('[data-recording]'))other.removeAttribute('data-recording');
   node.dataset.recording='true';
  });change.setAttribute('aria-label',label(id)+' · '+t('変更'));
  controls.append(change,button('解除',()=>{recording=null;draft[id]=[];refreshRow(id);setNotice(t('保存すると変更が反映されます。'));}),button('標準',()=>{recording=null;const removed=replace(id,defaults.get(id));refreshRows();setNotice(removed.length?t('重複する割り当てを解除しました。')+' '+removed.join('、'):t('保存すると変更が反映されます。'));}));
  node.append(controls);return node;
 }
 function refreshRow(id){const old=dialog.querySelector('[data-binding-action="'+id+'"]');if(old){const active=old.contains(document.activeElement);const next=row(id);old.replaceWith(next);if(active)next.querySelector('button').focus({preventScroll:true});}}
 function refreshRows(){for(const node of [...dialog.querySelectorAll('[data-binding-action]')])refreshRow(node.dataset.bindingAction);}
 function show(){
  if(dialog?.open)return;
  saved=read();draft=structuredClone(saved);recording=null;range=Math.min(100,Math.max(1,currentSize()));
  if(!dialog){
   dialog=make('dialog',undefined,'np-keyboard-help np-binding-dialog');dialog.id='np-key-bindings';dialog.setAttribute('aria-labelledby','np-binding-title');
   dialog.addEventListener('close',()=>{recording=null;});
   dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});document.body.append(dialog);
  }
  dialog.replaceChildren();
  const header=make('header'),title=make('h2',t('キーの割り当て'));title.id='np-binding-title';header.append(title,button('キャンセル',()=>dialog.close()));dialog.append(header);
  dialog.append(make('p',t('「変更」を押して、使いたいキーを押してください。保存すると全ての問題で使えます。')));
  dialog.append(make('p',t('Tab・Escとブラウザーの標準ショートカットは変更できません。文字入力中は割り当てを使いません。')));
  notice=make('p',t('盤面を選んでから、割り当てたキーを使います。'),'np-binding-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');dialog.append(notice);
  for(const [heading,kind]of [['マスを移動','move'],['操作','command']]){
   const section=make('details');section.open=true;section.append(make('summary',t(heading)));
   for(const [id,action]of actions)if(action.kind===kind)section.append(row(id));dialog.append(section);
  }
  const digits=make('details');digits.append(make('summary',t('数字を入力')));
  const rangeLabel=make('label',t('設定する数字の範囲')+' '),select=make('select');select.setAttribute('aria-label',t('設定する数字の範囲'));
  for(const n of [...new Set([range,9,16,25,36,49,100])].sort((a,b)=>a-b)){const option=make('option','1–'+n);option.value=String(n);option.selected=n===range;select.append(option);}
  const list=make('div');list.className='np-binding-digits';
  const draw=()=>{list.replaceChildren(...Array.from({length:range},(_,i)=>row('digit-'+(i+1))));};
  select.addEventListener('change',()=>{recording=null;range=Number(select.value);draw();});rangeLabel.append(select);digits.append(rangeLabel,list);draw();dialog.append(digits);
  const footer=make('footer',undefined,'np-binding-footer');
  footer.append(button('初期値に戻す',()=>{recording=null;draft={};refreshRows();setNotice(t('保存すると変更が反映されます。'));}),button('保存して閉じる',()=>{
   try{
    const next=validate({version:1,bindings:draft});localStorage.setItem(storageKey,JSON.stringify({version:1,bindings:next}));saved=next;window.dispatchEvent(new CustomEvent('np-key-bindings-change'));dialog.close();
   }catch{setNotice(t('設定を保存できませんでした。もう一度お試しください。'));}
  },'np-binding-save'));dialog.append(footer);dialog.showModal();
 }
 function eventChord(event){return chord(event.code,event.shiftKey,event.ctrlKey,event.altKey);}
 function numericTarget(target){return target?.closest?.('#board [data-action="cell"],.board-viewport [data-cell]');}
 function gameTarget(target){return numericTarget(target)||target?.closest?.('.board button[data-cell],.board button[data-edge],.proto-board button[data-cell],.proto-board button[data-edge],.choices button[data-choice]');}
 function hasModal(){
  const selector='dialog[open],[role="dialog"][aria-modal="true"]';if(document.querySelector(selector))return true;
  try{return parent!==window&&!!parent.document.querySelector(selector);}catch{return false;}
 }
 function available(id,target){
  if(id==='help')return true;
  if(!gameTarget(target))return false;
  if(id==='direction')return !!target.closest('#cw-play');
  if(id.startsWith('digit-'))return !!numericTarget(target)&&Number(id.slice(6))<=currentSize();
  if(['erase','memo'].includes(id))return !!numericTarget(target);
  return true;
 }
 function visibleButton(selector){return [...document.querySelectorAll(selector)].find(node=>!node.disabled&&!node.closest('[hidden],[aria-hidden="true"]')&&node.getClientRects().length);}
 function synthetic(target,key,code=key){const event=new KeyboardEvent('keydown',{key,code,bubbles:true,cancelable:true});Object.defineProperty(event,'npKeyMapped',{value:true});target.dispatchEvent(event);return event;}
 function click(selector){const node=visibleButton(selector);if(!node)return false;node.click();return true;}
 function run(id,target){
  if(actions.get(id)?.kind==='move'){const key={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',home:'Home',end:'End'}[id];synthetic(target,key);return;}
  if(id==='activate'){
   const event=synthetic(target,'Enter');if(!event.defaultPrevented&&target.matches('button:not(:disabled)'))target.click();return;
  }
  if(id==='direction'){target.click();return;}
  if(id==='help'){window.NPKeyboard?.showHelp();return;}
  if(id==='erase'){synthetic(target,'Delete');return;}
  if(id.startsWith('digit-')){
   const value=Number(id.slice(6));
   if(value<=35){synthetic(target,value<10?String(value):String.fromCharCode(value+55));return;}
  }
  // Let the existing input delegate cancel an old held-number gesture first.
  // Button activation then uses exactly the same notes, Undo and save paths.
  synthetic(target,'NPFocusCell');synthetic(target,'Unidentified');
  if(id.startsWith('digit-')){
   const value=Number(id.slice(6));let node=visibleButton('[data-action="number"][data-number="'+value+'"],[data-native-number="'+value+'"]');
   if(!node&&window.NanpureAppTest){const n=currentSize(),cut=n===36?18:25,index=n===100?Math.floor((value-1)/20):value>cut?1:0;click('[data-action="number-range"][data-range="'+index+'"]');node=visibleButton('[data-action="number"][data-number="'+value+'"]');}
   node?.click();return;
  }
  const native=document.querySelector('.daily-controls .tools'),nativeIndex={undo:0,erase:1,memo:2,hint:3}[id];
  if(native&&nativeIndex!==undefined){const node=native.children[nativeIndex];if(node?.matches('button:not(:disabled)'))node.click();return;}
  const selectors={erase:'[data-action="erase"]',undo:'[data-action="undo"],[data-act="undo"],[data-proto="undo"]',memo:'[data-action="notes"]',hint:'[data-action="open-hints"]',pause:'[data-video="pause"]',settings:'#np-play-settings-button,.play-settings-button'};
  if(selectors[id])click(selectors[id]);
 }
 function handle(event){
  if(event.npKeyMapped||event.defaultPrevented||event.isComposing||event.keyCode===229||['Process','Dead','Unidentified'].includes(event.key)||event.getModifierState?.('AltGraph'))return false;
  if(dialog?.open){
   if(!recording)return false;
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();recording=null;refreshRows();setNotice(t('取り消しました。'));return true;}
   if(['Shift','Control','Alt','Meta'].includes(event.key))return false;
   const value=eventChord(event);
   if(event.metaKey||!validChord(value)){recording=null;refreshRows();setNotice(t('このキーは標準操作に使うため、割り当てられません。'));return false;}
   event.preventDefault();event.stopImmediatePropagation();
   const removed=replace(recording,[value]);recording=null;refreshRows();setNotice(removed.length?t('重複する割り当てを解除しました。')+' '+removed.join('、'):t('保存すると変更が反映されます。'));return true;
  }
  if(editable(event.target)||event.metaKey||reserved(eventChord(event)))return false;
  // Backup restore can write localStorage in this same document, without a
  // storage event. Always use the current saved assignments on the next key.
  saved=read();
  const target=event.target;if(!target?.closest)return false;
  const key=signature(eventChord(event));
  const match=Object.keys(saved).find(id=>available(id,target)&&saved[id].some(value=>signature(value)===key));
  if(hasModal()&&match!=='help')return false;
  if(match){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat||actions.get(match)?.kind==='move')run(match,target);return true;}
  // A reassigned action releases its former defaults. Never leave a hidden
  // second assignment that could enter a different number on a larger board.
  const released=Object.keys(saved).some(id=>available(id,target)&&defaults.get(id)?.some(value=>!(id==='activate'&&value.code==='Space'&&target.closest('#cw-play'))&&signature(value)===key));
  if(released){event.preventDefault();event.stopImmediatePropagation();return true;}
  return false;
 }
 window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null)saved=read();});
 window.addEventListener('np-key-bindings-change',()=>{saved=read();});
 const style=make('style');style.textContent=`
 .np-binding-dialog{width:min(96vw,760px)}.np-binding-dialog details{margin:16px 0;padding:10px 0;border-top:1px solid #c5cfc5}.np-binding-dialog summary{font-weight:700;cursor:pointer;padding:6px 0}.np-binding-row{display:grid;grid-template-columns:minmax(100px,1fr) minmax(100px,1.2fr) auto;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #dce3d7}.np-binding-label{font-weight:650}.np-binding-row kbd{font:inherit;font-size:14px;overflow-wrap:anywhere}.np-binding-buttons{display:flex;gap:4px}.np-binding-buttons button{padding:6px 8px}.np-binding-row[data-recording]{background:#e1edfa;outline:2px solid #185caa;outline-offset:2px}.np-binding-notice{padding:10px;background:#edf3e9;border-radius:8px;min-height:3em}.np-binding-footer{position:sticky;bottom:-22px;display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;padding:14px 0;background:#fffef9}.np-binding-save{font-weight:750!important}.np-binding-dialog select{font:inherit;padding:8px;margin:8px;max-width:100%}@media(max-width:540px){.np-binding-row{grid-template-columns:minmax(100px,1fr) minmax(100px,1fr)}.np-binding-buttons{grid-column:1/-1}.np-binding-buttons button{flex:1}.np-binding-dialog{padding:16px}.np-binding-footer{bottom:-16px}.np-binding-dialog header{gap:8px}.np-binding-dialog h2{font-size:21px}}
 `;document.head.append(style);
 window.NPKeyBindings={show,handle,validate,storageKey};
})();

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
