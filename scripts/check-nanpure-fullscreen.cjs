// Exercise the shipped fullscreen lifecycle, including denied native requests.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[2]||'linkedom');
const source=fs.readFileSync('scripts/client-overrides/public/notebook/board-fullscreen.js','utf8');
function environment({embedded=false,reject=false}={}){
 const {window:w}=parseHTML('<html><head></head><body><main id="app"><section class="screen np-workspace-screen"><div class="play-head"><h1>マルチ</h1><button id="pause">一時停止</button></div><div class="np-workspace-tools"><button data-wide>広く</button></div><div class="multi-board-legend"><button data-action="linked-focus">A</button></div><p class="multi-cell-context">選択中A</p><div id="board-scroll"><div id="board"><button data-cell="0">3</button></div></div><section class="np-number-panel"><button data-number="1">1</button></section></section><dialog class="np-workspace-dialog"><form></form></dialog></main></body></html>');
 const host=embedded?parseHTML('<html><head></head><body><header>自由に遊ぶ</header><iframe></iframe></body></html>').window:w;
 const frames=[],observers=[],fits=[];const Observer=class{constructor(fn){observers.push(fn);}observe(){}};let requests=0,exits=0,full=null;
 w.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLElement.prototype.close=function(){this.removeAttribute('open');};w.HTMLElement.prototype.focus=function(){};
 Object.defineProperty(host.document,'fullscreenElement',{get:()=>full});
 host.document.documentElement.requestFullscreen=async()=>{requests++;if(reject)throw Error('Denied by browser');full=host.document.documentElement;host.document.dispatchEvent(new host.Event('fullscreenchange'));};
 host.document.exitFullscreen=async()=>{exits++;full=null;host.document.dispatchEvent(new host.Event('fullscreenchange'));};
 host.parent=host;w.parent=host;w.frameElement=embedded?host.document.querySelector('iframe'):null;
 Object.assign(w,{window:w,console:{...console,warn(){}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},MutationObserver:Observer,setTimeout:()=>1,clearTimeout(){},NPPlayWorkspace:{refresh(){}},NPBoardInput:{fit:b=>fits.push(b)},localStorage:{setItem(){throw Error('Fullscreen must not write settings');}}});
 const original=[...w.document.querySelector('.screen').children],head=w.document.querySelector('.play-head'),legend=w.document.querySelector('.multi-board-legend'),markup=w.document.getElementById('app').innerHTML;
 vm.runInContext(source,vm.createContext({window:w,document:w.document,MutationObserver:Observer,requestAnimationFrame:w.requestAnimationFrame,setTimeout:w.setTimeout,clearTimeout:w.clearTimeout,console:w.console}));
 function flush(){for(let i=0;frames.length&&i<30;i++)frames.shift()();assert.equal(frames.length,0);}
 flush();return{w,host,head,legend,original,markup,api:w.NPBoardFullscreen,flush,fits,notify(){for(const fn of observers)fn([{addedNodes:[1],removedNodes:[]}]);flush();},get requests(){return requests;},get exits(){return exits;},nativeEscape(){full=null;host.document.dispatchEvent(new host.Event('fullscreenchange'));flush();}};
}
(async()=>{
 for(const embedded of [false,true]){
  const e=environment({embedded}),board=e.w.document.getElementById('board'),number=e.w.document.querySelector('[data-number]');
  await e.api.enter();e.flush();assert(e.api.isActive());assert.equal(e.requests,1);assert.equal(e.host.document.fullscreenElement,e.host.document.documentElement);
  assert.equal(e.head.parentElement.className,'np-workspace-tools');assert(e.legend.closest('dialog'));assert.equal(e.w.document.querySelector('[data-fullscreen]').getAttribute('aria-pressed'),'true');
  assert.equal(e.w.document.getElementById('board'),board);assert.equal(e.w.document.querySelector('[data-number]'),number);assert(e.fits.length>0);
  if(embedded){assert(e.host.document.body.classList.contains('np-fullscreen-host'));assert(e.w.frameElement.classList.contains('np-fullscreen-frame'));assert(e.w.frameElement.allowFullscreen);}
  e.nativeEscape();assert(!e.api.isActive());assert.equal(e.head.parentElement.className,'screen np-workspace-screen');assert.equal(e.legend.parentElement,e.head.parentElement);assert.deepEqual([...e.head.parentElement.children].filter(el=>!el.hasAttribute('data-fullscreen')),e.original);assert.equal(e.host.document.querySelectorAll('.np-fullscreen-frame').length,0);
  await e.api.enter();e.flush();await e.api.leave();e.flush();assert.equal(e.exits,1);assert(!e.api.isActive());assert.equal(e.w.document.querySelectorAll('.np-fullscreen-boards').length,0);
  console.log('PASS fullscreen '+(embedded?'embedded shell':'standalone')+': native entry, same live controls, Esc restoration, repeated entry and explicit exit');
 }
 const e=environment({embedded:true,reject:true});await e.api.enter();e.flush();assert(e.api.isActive());assert.equal(e.w.document.querySelector('.np-workspace-screen').dataset.fullscreenMode,'page');assert(e.w.document.querySelector('.np-fullscreen-message').textContent.includes('F11'));
 await e.api.leave();e.flush();assert(!e.api.isActive());assert.equal(e.host.document.body.className,'');assert.equal(e.w.document.querySelectorAll('.np-fullscreen-boards').length,0);
 await e.api.enter();e.flush();const app=e.w.document.getElementById('app');app.innerHTML=e.markup.replace('screen np-workspace-screen','screen');e.notify();assert(e.api.isActive(),'A board waiting for workspace mount keeps full screen');e.w.document.querySelector('.screen').classList.add('np-workspace-screen');e.notify();assert(e.api.isActive());assert(e.w.document.querySelector('.np-fullscreen-boards'),'Board switching restores the fullscreen controls');
 app.replaceChildren();e.notify();assert(!e.api.isActive());assert.equal(e.host.document.querySelectorAll('.np-fullscreen-frame').length,0);
 console.log('PASS fullscreen fallback: rejected browser request, usable page mode, explicit exit and route cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
