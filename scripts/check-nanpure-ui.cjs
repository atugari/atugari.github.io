// Usage: node scripts/check-nanpure-ui.cjs [notebook-directory] [linkedom-module]
// DOM interaction regressions use fixed layout dimensions; browser QA verifies real rendering.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[3]||'linkedom');
const source=path.resolve(process.argv[2]||path.join(__dirname,'client-overrides/public/notebook'))+path.sep;
const {window:w}=parseHTML('<html><head></head><body><main id="app"><section class="screen"><h1>ふつう · 25×25</h1><div class="play-head"><b>Lv.01</b><span id="timer">0:00</span></div><div class="video-hud"><span id="video-score">スコア：0</span><button data-video="pause">一時停止する</button><button data-video="favorite">☆ お気に入り</button></div><div id="video-flash">このパズルの完成率：0%</div><div id="board-scroll" class="board-scroll" style="width:395px;height:395px"><div id="board" class="play-board" data-pan-key="test" style="width:879px;height:879px"></div></div><div id="hint-panel" hidden></div><p id="play-status">保存済み</p><div class="play-dock"><div class="tools"><button data-action="notes">メモ</button><button data-action="erase">消す</button><button data-action="undo">1手戻す</button><button data-action="open-hints">ヒント</button></div><div id="number-controls"><div class="number-pad">'+Array.from({length:25},(_,i)=>'<button data-action="number" data-number="'+(i+1)+'"><span>'+String(i+1)+'</span></button>').join('')+'</div></div></div><details><summary>遊び方の設定</summary><label class="memo-option" for="display-mode">画面の配色</label><select id="display-mode"><option value="light">白</option></select><label class="memo-option"><input type="checkbox" id="highlight-area" checked>行・列・枠を強調表示</label><label class="memo-option"><input type="checkbox" id="highlight-notes">候補メモを強調</label><p id="memo-focus-status" role="status"></p><label class="memo-option"><input type="checkbox" id="mistake-limit">ミス上限</label><label for="mistake-cap">回数</label><select id="mistake-cap"><option value="3">3</option></select><label class="memo-option"><input type="checkbox" id="show-timer" checked>タイマーを表示</label><button data-site-audio>音</button><label class="memo-option"><input type="checkbox" data-feedback="vibration">振動</label><fieldset><legend>表示と演出</legend><label><input type="checkbox" data-video-option="autoComplete">自動完成</label><label><input type="checkbox" data-video-option="completionAnimation">完成時の演出</label><p id="video-option-status" role="status"></p></fieldset><label class="memo-option"><input type="checkbox" id="play-input-mode">数字を先に選ぶ</label></details><details><summary>候補メモの補助</summary><input type="checkbox" id="memo-prune"></details><details id="rules"><summary>ルールを確認する</summary><p>ルール本文</p></details><details><summary>問題の操作</summary><button data-action="check">確認</button><button data-action="restart">やり直す</button><button data-action="play-print">印刷</button></details></section></main></body></html>');
const frames=[],values=new Map();
const visualViewport=Object.assign(w.document.createElement('div'),{width:395,height:0,scale:1});
Object.assign(w,{visualViewport});
Object.assign(w,{window:w,self:w,innerWidth:395,innerHeight:936,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))},scrollBy(){},NanpureAppTest:{getCurrent:()=>({n:25})}});
w.getComputedStyle=el=>({display:el.hidden?'none':'block',position:el.tagName==='DIALOG'?'fixed':'static',zoom:el.id==='board'?(w.document.documentElement.style.getPropertyValue('--np-cell-scale')||'1'):'1',columnGap:'5px',paddingLeft:'10px',paddingRight:'10px',paddingTop:'6px',paddingBottom:'8px',marginTop:'0px',marginBottom:'0px',overflowY:el.id==='app'?'auto':'visible'});
const number=value=>parseFloat(value)||0;
Object.defineProperties(w.HTMLElement.prototype,{clientWidth:{get(){if(this.id==='app')return 395;if(this.classList.contains('number-pad'))return 375;return number(this.style.width)||375;}},clientHeight:{get(){return number(this.style.height)||44;}},offsetWidth:{get(){return number(this.style.width)||this.clientWidth;}},offsetHeight:{get(){return number(this.style.height)||44;}}});
w.HTMLElement.prototype.getBoundingClientRect=function(){if(this.dataset.action==='number')return{left:100,top:400,right:150,bottom:450,width:50,height:50};const width=this.clientWidth;let height=this.id==='board-scroll'?this.clientHeight:this.classList.contains('play-dock')?230:this.id==='hint-panel'?(this.hidden?0:200):44;return{left:0,top:0,right:width,bottom:height,width,height};};
w.HTMLElement.prototype.showModal=function(){this.open=true;};w.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.HTMLElement.prototype.focus=function(){};
const ctx=vm.createContext(w),originalSettings=w.document.getElementById('display-mode'),originalPrint=w.document.querySelector('[data-action=play-print]'),originalRules=w.document.getElementById('rules');
const retainedControls=[...w.document.querySelectorAll('.screen > details input,.screen > details select,.screen > details button')];
let changes=0;originalSettings.addEventListener('change',()=>changes++);
for(const name of ['board-input.js','play-options.js','compact-play.js'])vm.runInContext(fs.readFileSync(source+name,'utf8'),ctx,{filename:name});
function flush(){for(let i=0;frames.length&&i<20;i++)frames.shift()();assert(frames.length<20,'layout must settle');}
flush();
const checks=[];function check(name,fn){fn();checks.push(name);}
check('one settings entrance retains all original rules/actions/listeners',()=>{assert.equal(w.document.querySelectorAll('#np-play-settings-button').length,1);assert.equal(w.document.querySelectorAll('.fit-options,.fit-options-dialog').length,0);const dialog=w.document.getElementById('np-play-settings');assert(dialog.contains(originalSettings));assert(dialog.contains(originalPrint));assert(dialog.contains(originalRules));originalSettings.dispatchEvent(new w.Event('change'));assert.equal(changes,1);assert.equal(dialog.querySelectorAll('details').length,3);assert.equal(dialog.querySelectorAll('.np-settings-category').length,4);assert.equal(dialog.querySelectorAll('[data-settings-panel]').length,4);for(const control of retainedControls)assert(dialog.contains(control),'Original control remains connected: '+(control.id||control.dataset.action||control.dataset.videoOption));assert.equal(dialog.querySelectorAll('[data-action=restart]').length,1);});
check('settings categories expose one page at a time and retain controls when returning to the menu',()=>{
 const dialog=w.document.getElementById('np-play-settings'),menu=dialog.querySelector('.np-settings-menu'),pages=[...dialog.querySelectorAll('[data-settings-panel]')];
 const expected={view:['#display-mode','#highlight-area','.np-board-options'],input:['#highlight-notes','#memo-focus-status','#mistake-limit','#mistake-cap','#play-input-mode','[data-video-option=autoComplete]','#memo-prune'],sound:['#show-timer','[data-site-audio]','[data-feedback=vibration]','[data-video-option=completionAnimation]','#video-option-status'],help:['#video-score','#rules','[data-action=play-print]']};
 w.document.getElementById('np-play-settings-button').click();assert.equal(dialog.open,true);assert.equal(menu.hidden,false);assert(pages.every(page=>page.hidden));
 for(const [id,selectors]of Object.entries(expected)){
  dialog.querySelector('[aria-controls="np-settings-page-'+id+'"]').click();assert.equal(dialog.dataset.settingsPage,id);assert.equal(menu.hidden,true);
  assert.equal(pages.filter(page=>!page.hidden).length,1);
  for(const selector of selectors)assert(dialog.querySelector('[data-settings-panel="'+id+'"] '+selector),'Control is in its category: '+selector);
  dialog.querySelector('.np-settings-back').click();assert.equal(menu.hidden,false);assert(pages.every(page=>page.hidden));
 }
 assert.equal(originalSettings.previousElementSibling.tagName,'LABEL');assert.equal(originalSettings.parentElement.className,'np-choice-row');
 assert.equal(w.document.querySelector('#highlight-area').getAttribute('role'),'switch');
 const sharedStatus=dialog.querySelector('#video-option-status');
 dialog.querySelector('[data-video-option=autoComplete]').dispatchEvent(new w.Event('change',{bubbles:true}));assert(dialog.querySelector('[data-settings-panel=input]').contains(sharedStatus),'Save status follows completion assistance');
 dialog.querySelector('[data-video-option=completionAnimation]').dispatchEvent(new w.Event('change',{bubbles:true}));assert(dialog.querySelector('[data-settings-panel=sound]').contains(sharedStatus),'The same save status returns to animation settings');assert.equal(dialog.querySelectorAll('#video-option-status').length,1);
 w.NPPlaySettings.sync();w.NPPlaySettings.decorate(dialog);assert.equal(dialog.querySelectorAll('.np-settings-category').length,4);assert.equal(dialog.querySelectorAll('#display-mode').length,1);
 dialog.close();
});
check('main play keeps four actions while board sizing and its explanation live in settings',()=>{assert(w.document.querySelector('.play-head #np-play-settings-button'));assert.equal(w.document.querySelectorAll('.play-dock > .tools > button').length,4);assert.equal(w.document.querySelectorAll('.screen > .np-pan-tools').length,0);assert.equal(w.document.querySelectorAll('#np-play-settings .np-board-options .np-pan-tools').length,1);assert.equal(w.document.querySelectorAll('.np-board-options p').length,2);});
check('pause shares the timer row while score, favorite and completion progress stay available in settings',()=>{assert(w.document.querySelector('.play-head [data-video=pause]'));assert(w.document.querySelector('#np-play-settings #video-score'));assert(w.document.querySelector('#np-play-settings [data-video=favorite]'));assert(w.document.querySelector('#np-play-settings #video-flash'));assert.equal(w.document.querySelectorAll('.screen > .video-hud,.screen > #video-flash').length,0);});
check('first synchronous layout accounts for controls and keeps useful board size',()=>{const v=w.document.getElementById('board-scroll');assert(number(v.style.width)<=375);w.innerHeight=400;w.NPCompactPlay.layout();assert(number(v.style.width)>=280);assert(w.document.querySelector('.screen').classList.contains('play-needs-scroll'));assert(number(w.document.querySelector('.number-pad').style.getPropertyValue('--np-pad-columns'))<=7);});
const board=w.document.getElementById('board'),viewport=w.document.getElementById('board-scroll'),tools=w.document.querySelectorAll('.np-pan-tools button');
viewport.style.width='395px';viewport.style.height='395px';
check('large-board fit fits both edges and reset means base size',()=>{tools[3].click();assert(Math.abs(Number(viewport.dataset.scale)-395/879)<1e-6);assert(number(w.document.querySelector('.np-pan-stage').style.width)<=395.001);tools[1].click();assert.equal(viewport.dataset.scale,'1');});
check('ordinary wheel never zooms; modified wheel zooms',()=>{const ordinary=new w.Event('wheel',{bubbles:true,cancelable:true});Object.assign(ordinary,{deltaY:120,deltaMode:0,clientX:20,clientY:20,ctrlKey:false,metaKey:false});viewport.dispatchEvent(ordinary);assert.equal(ordinary.defaultPrevented,false);assert.equal(viewport.dataset.scale,'1');const modified=new w.Event('wheel',{bubbles:true,cancelable:true});Object.assign(modified,{deltaY:-120,deltaMode:0,clientX:20,clientY:20,ctrlKey:true,metaKey:false});viewport.dispatchEvent(modified);assert.equal(modified.defaultPrevented,true);assert(Number(viewport.dataset.scale)>1);});
check('fit remains correct after viewport and cell-size changes',()=>{tools[3].click();viewport.style.width='300px';viewport.style.height='300px';w.NPBoardInput.refresh(board);assert(Math.abs(Number(viewport.dataset.scale)-300/879)<1e-6);const range=w.document.querySelector('.np-cell-size input');range.value='180';range.oninput();assert(Math.abs(Number(viewport.dataset.scale)-300/(879*1.8))<1e-6);assert.equal(values.get('nanpure-cell-size-v1'),'180');});
check('zoom labels are translatable while numeric percent is protected',()=>{const wrap=w.document.querySelector('.np-pan-tools');assert.equal(wrap.getAttribute('translate'),null);assert.equal(tools[0].getAttribute('aria-label'),'盤面を縮小する');assert.equal(tools[3].getAttribute('aria-label'),'盤面全体を表示する');assert(tools[1].querySelector('[data-i18n-skip]'));assert.equal(tools[1].hasAttribute('data-i18n-skip'),false);});
function pointer(type,target=w.document.querySelector('[data-action=number]'),extra={}){const event=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:7,button:0,isPrimary:true,clientX:125,clientY:425,relatedTarget:null,...extra});target.dispatchEvent(event);return event;}
check('pressed digit previews above the key without changing pointer or click behavior',()=>{const key=w.document.querySelector('[data-action=number]');let clicks=0;key.addEventListener('click',()=>clicks++);const down=pointer('pointerdown',key.querySelector('span'));const bubble=w.document.querySelector('.np-key-preview');assert(bubble);assert.equal(bubble.textContent,'1');assert.equal(bubble.getAttribute('aria-hidden'),'true');assert.equal(bubble.getAttribute('data-i18n-skip'),'');assert.equal(bubble.style.top,'340px');assert.equal(bubble.style.width,'64px');assert.equal(down.defaultPrevented,false);pointer('pointerup',key);assert.equal(w.document.querySelector('.np-key-preview'),null);key.click();assert.equal(clicks,1);assert.equal(key.classList.contains('np-key-preview-active'),false);});
check('held preview follows a same-number keypad replacement',()=>{const key=w.document.querySelector('[data-action=number]');pointer('pointerdown',key);const bubble=w.document.querySelector('.np-key-preview'),next=key.cloneNode(true);key.replaceWith(next);w.NPCompactPlay.layout();assert.equal(w.document.querySelector('.np-key-preview'),bubble);assert(next.classList.contains('np-key-preview-active'));pointer('pointerup',next);assert.equal(w.document.querySelector('.np-key-preview'),null);});
check('status layout changes wait for release instead of moving the held key',()=>{w.innerHeight=936;w.NPCompactPlay.layout();const before=viewport.style.width,key=w.document.querySelector('[data-action=number]');pointer('pointerdown',key);w.innerHeight=400;w.NPCompactPlay.layout();assert.equal(viewport.style.width,before);assert(w.document.querySelector('.np-key-preview'));pointer('pointerup',key);flush();assert.equal(viewport.style.width,'280px');assert.equal(w.document.querySelector('.np-key-preview'),null);});
check('only a real window or visual viewport resize clears the held preview',()=>{const key=w.document.querySelector('[data-action=number]');pointer('pointerdown',key);w.dispatchEvent(new w.Event('resize'));visualViewport.dispatchEvent(new w.Event('resize'));assert(w.document.querySelector('.np-key-preview'),'unchanged dimensions keep the preview');visualViewport.height=300;visualViewport.dispatchEvent(new w.Event('resize'));assert.equal(w.document.querySelector('.np-key-preview'),null,'visual viewport changed');visualViewport.height=0;pointer('pointerdown',key);w.innerWidth=400;w.dispatchEvent(new w.Event('resize'));assert.equal(w.document.querySelector('.np-key-preview'),null,'window dimensions changed');w.innerWidth=395;flush();});
check('preview clears on cancel, moving away, scroll, blur and leaving the game',()=>{const key=w.document.querySelector('[data-action=number]');for(const name of ['pointercancel','scroll','blur','pagehide']){pointer('pointerdown',key);assert(w.document.querySelector('.np-key-preview'));if(name==='pointercancel')pointer(name,key);else w.dispatchEvent(new w.Event(name));assert.equal(w.document.querySelector('.np-key-preview'),null,name);}
 pointer('pointerdown',key);pointer('pointermove',key,{clientX:149});assert.equal(w.document.querySelector('.np-key-preview'),null,'hold movement threshold');pointer('pointerdown',key);pointer('pointerout',key,{relatedTarget:w.document.body});assert.equal(w.document.querySelector('.np-key-preview'),null,'key exit');pointer('pointerdown',key);const previous=board.dataset.panKey;board.dataset.panKey='another-game';w.NPCompactPlay.layout();assert.equal(w.document.querySelector('.np-key-preview'),null,'game change');board.dataset.panKey=previous;
});
const patchTargets=[['play-options.js','function t(s){return window.NPI18n?.t(s)||s}'],['visual-hints.js','const n=t=>e.NPI18n?e.NPI18n.t(t):t']];
check('exporter translator patch anchors remain unique',()=>{for(const[name,needle]of patchTargets)assert.equal(fs.readFileSync(source+name,'utf8').split(needle).length,2);});
check('tutorial link follows the current language without changing unrelated links',()=>{
 let locale='en';w.NPI18n={get:()=>locale,t:value=>value};
 // Linkedom needs the browser's writable select.value behavior for access settings.
 Object.defineProperty(w.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.selected)?.value||this.options[0]?.value||''},set(value){for(const option of this.options)option.selected=option.value===value}});
 const other=w.document.createElement('a');other.href='https://example.com/learn?lang=fr';w.document.body.append(other);
 const otherURL=other.href;
 vm.runInContext(fs.readFileSync(source+'access-tools.js','utf8'),ctx,{filename:'access-tools.js'});flush();
 const learn=w.document.querySelector('#np-play-settings a[data-np-learn-link]');assert(learn,'Tutorial link is created');
 const initial=new URL(learn.href);assert.equal(initial.searchParams.get('lang'),'en');assert.equal(learn.target,'_blank');
 for(const next of ['de','ja']){
  locale=next;w.dispatchEvent(new w.Event('np-language-change'));
  const url=new URL(learn.href);assert.equal(url.searchParams.get('lang'),next);assert.equal(url.origin+url.pathname,initial.origin+initial.pathname);assert.equal(other.href,otherURL);
 }
 other.remove();
});
check('late access controls, preview and save links join the correct settings pages once',()=>{
 const dialog=w.document.getElementById('np-play-settings');
 assert(dialog.querySelector('[data-settings-panel=input] .np-access-tools'));
 assert(dialog.querySelector('[data-settings-panel=view] .np-access-preview'));
 assert(dialog.querySelector('[data-settings-panel=sound] .np-access-button'));
 assert(dialog.querySelector('[data-settings-panel=help] a[data-np-learn-link]'));
 assert.equal(dialog.querySelectorAll('.np-access-tools').length,1);
 assert.equal(dialog.querySelectorAll('.np-access-preview').length,1);
 assert.equal(dialog.querySelectorAll('.np-access-tools input[role=switch]').length,1);
 w.document.getElementById('np-play-settings-button').click();assert.equal(dialog.dataset.settingsPage,'menu');dialog.close();
});
check('larger saved number-key sizes reduce columns so square keys retain their preferred size',()=>{
 const select=[...w.document.querySelectorAll('.np-access-tools select')].find(select=>[...select.options].some(option=>option.value==='150'));
 assert(select,'key size preference remains available');select.value='150';select.onchange();select.dispatchEvent(new w.Event('change',{bubbles:true}));flush();
 const pad=w.document.querySelector('.number-pad'),columns=number(pad.style.getPropertyValue('--np-pad-columns'));
 assert.equal(columns,5);assert((pad.clientWidth-(columns-1)*5)/columns>=44*1.5);
 select.value='100';select.onchange();select.dispatchEvent(new w.Event('change',{bubbles:true}));flush();
});
// Run the unchanged production long-press handlers with their real number
// renderer, so the visual layer must survive the actual lock-and-redraw path.
(async()=>{
 const appSource=fs.readFileSync(source+'app.js','utf8');
 const part=(start,end)=>{const a=appSource.indexOf(start),b=appSource.indexOf(end,a+start.length);assert(a>=0&&b>a);return appSource.slice(a,b);};
 const timers=[],saved=[];const current={uid:'held-preview',n:25,completed:false};
 const originalTimeout=w.setTimeout,originalClear=w.clearTimeout;
 Object.assign(w,{S:{flow:'play',step:'game'},ae:'input-mode',oe:'cell',re:null,T:true,ne:true,y:0,
  Ce:()=>current,Mt:()=>false,Pe:async(_library,value)=>saved.push(value),
  updateSourceMarkup:(target,markup)=>{target.innerHTML=markup;},Tt:()=>w.NPCompactPlay.layout(),Ft(){},
  setTimeout:(callback,delay)=>{timers.push({callback,delay});return timers.length;},clearTimeout(){},NPWebAccess:{holdMs:()=>500}});
 vm.runInContext(part('function Ue(','function We(')+part('let St=null,It=null;','function Lt(e){')+part('function zt(){','function At(e){')+part('function updateNumberControls(','function Tt(){'),ctx);
 const key=w.document.querySelector('[data-action=number][data-number="25"]');
 pointer('pointerdown',key);const bubble=w.document.querySelector('.np-key-preview');assert(bubble);assert.equal(timers.length,1);assert.equal(timers[0].delay,500);
 await timers[0].callback();
 const next=w.document.querySelector('[data-action=number][data-number="25"]');
 assert.notEqual(next,key);assert.equal(next.getAttribute('aria-pressed'),'true');assert.equal(w.document.querySelector('.np-key-preview'),bubble);assert.equal(bubble.textContent,'25');
 assert.equal(w.oe,'number');assert.equal(w.re,25);assert.equal(w.T,true,'memo mode is retained');assert.equal(saved[0]['input-mode'],'number');
 pointer('pointerup',next);assert.equal(w.document.querySelector('.np-key-preview'),null);assert.equal(vm.runInContext('It',ctx),25,'the following click remains suppressed by the real long-press handler');
 w.setTimeout=originalTimeout;w.clearTimeout=originalClear;
 checks.push('actual long press locks the number, retains memo mode and preview through redraw, then clears only the visual on release');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
