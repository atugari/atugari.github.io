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
