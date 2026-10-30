// Usage: node scripts/check-nanpure-board-gestures.cjs [board-input.js] [linkedom-module]
// Exercise the shipped controller with pointer sequences and fixed geometry.
// Device/browser checks remain responsible for native touch event delivery.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[3]||'linkedom');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'client-overrides/public/notebook/board-input.js'),'utf8');
function fixture({width=300,height=300}={}){
 const {window:w}=parseHTML('<html><head></head><body><main><div class="board-scroll"><div id="board" data-pan-key="gesture-test"><button data-action="cell" data-cell="0">1</button></div></div></main></body></html>');
 const board=w.document.getElementById('board'),viewport=board.parentElement,cell=board.firstElementChild;
 const frames=[];let clicks=0;
 // Linkedom has no browser capture phase. Deliver window capture handlers
 // before the target so the existing collection touch guard is modeled correctly.
 const captured=new Map(),add=w.addEventListener.bind(w),remove=w.removeEventListener.bind(w);
 w.addEventListener=(type,fn,options)=>{if(options===true||options?.capture){if(!captured.has(type))captured.set(type,new Set());captured.get(type).add(fn);}else add(type,fn,options);};
 w.removeEventListener=(type,fn,options)=>{if(options===true||options?.capture)captured.get(type)?.delete(fn);else remove(type,fn,options);};
 Object.assign(w,{window:w,self:w,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},scrollBy(){},getComputedStyle:el=>({zoom:'1',overflowY:'visible'})});
 Object.defineProperties(viewport,{clientWidth:{value:width},clientHeight:{value:height},clientLeft:{value:0},clientTop:{value:0}});
 Object.defineProperties(board,{offsetWidth:{value:1000},offsetHeight:{value:1000}});
 viewport.getBoundingClientRect=()=>({left:0,top:0,right:width,bottom:height,width,height});
 viewport.setPointerCapture=()=>{};viewport.releasePointerCapture=()=>{};
 viewport.scrollLeft=200;viewport.scrollTop=200;
 w.document.addEventListener('click',e=>{if(e.target.closest('[data-action="cell"]'))clicks++;});
 vm.runInContext(source,vm.createContext(w),{filename:'board-input.js'});
 // The controller restores its own saved scroll position on attach.
 viewport.scrollLeft=200;viewport.scrollTop=200;
 function pointer(type,id,x,y,target=cell){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',isPrimary:id===1,button:0,clientX:x,clientY:y});for(const fn of captured.get(type)||[])fn(e);target.dispatchEvent(e);return e;}
 function click(detail=1){const e=new w.Event('click',{bubbles:true,cancelable:true});Object.assign(e,{detail});cell.dispatchEvent(e);return e;}
 return{w,board,viewport,cell,pointer,click,clicks:()=>clicks,scale:()=>Number(viewport.dataset.scale)};
}
const checks=[];function check(name,fn){fn();checks.push(name);}
const near=(actual,expected,label)=>assert(Math.abs(actual-expected)<.0001,label+': '+actual+' vs '+expected);
check('ordinary cell taps and keyboard clicks still reach the input delegate',()=>{
 const f=fixture();f.pointer('pointerdown',1,100,100);f.pointer('pointerup',1,100,100);f.click();f.click(0);assert.equal(f.clicks(),2);
});
check('one-finger pan survives implicit capture moving from a cell to the viewport',()=>{
 const f=fixture();f.pointer('pointerdown',1,100,100);f.pointer('pointermove',1,80,80);
 // Browsers fire this at the old implicitly captured cell when explicit capture
 // moves to the viewport. It bubbles, but does not end the active pointer.
 f.pointer('lostpointercapture',1,80,80);
 f.pointer('pointermove',1,60,60,f.viewport);near(f.viewport.scrollLeft,240,'continuous horizontal pan');near(f.viewport.scrollTop,240,'continuous vertical pan');
 f.pointer('pointerup',1,60,60,f.viewport);assert(f.click().defaultPrevented);assert.equal(f.clicks(),0);
});
check('two-finger pinch keeps the midpoint anchored and survives both capture transfers',()=>{
 const f=fixture();f.pointer('pointerdown',1,80,100);f.pointer('pointerdown',2,180,100);
 f.pointer('pointermove',1,60,100);f.pointer('lostpointercapture',1,60,100);
 f.pointer('pointermove',2,200,100);f.pointer('lostpointercapture',2,200,100);
 f.pointer('pointermove',1,40,100,f.viewport);f.pointer('pointermove',2,220,100,f.viewport);
 near(f.scale(),1.8,'pinch scale');near(f.viewport.scrollLeft,464,'midpoint x anchor');near(f.viewport.scrollTop,440,'midpoint y anchor');
 f.pointer('pointerup',1,40,100,f.viewport);f.pointer('pointerup',2,220,100,f.viewport);assert(f.click().defaultPrevented);assert.equal(f.clicks(),0);
});
check('pinch zooms out to fit and stays within the usable zoom limits',()=>{
 const f=fixture();f.pointer('pointerdown',1,20,100);f.pointer('pointerdown',2,280,100);
 f.pointer('pointermove',1,145,100);f.pointer('pointermove',2,155,100);near(f.scale(),.3,'minimum fits whole board');
 f.pointer('pointermove',1,-1000,100);f.pointer('pointermove',2,1000,100);assert(f.scale()<=4&&f.scale()>=.3);f.pointer('pointercancel',1,0,0);f.pointer('pointercancel',2,0,0);
});
check('two stationary fingers never select a cell on release',()=>{
 const f=fixture();f.pointer('pointerdown',1,80,100);f.pointer('pointerdown',2,180,100);f.pointer('pointerup',2,180,100);f.pointer('pointerup',1,80,100);assert(f.click().defaultPrevented);assert.equal(f.clicks(),0);
});
check('cancel and lost viewport capture suppress the old gesture but allow a fresh tap',()=>{
 for(const ending of ['pointercancel','lostpointercapture']){
  const f=fixture();f.pointer('pointerdown',1,100,100);f.pointer('pointermove',1,80,100);f.pointer(ending,1,80,100,f.viewport);
  const before=f.viewport.scrollLeft;f.pointer('pointermove',1,40,100,f.viewport);near(f.viewport.scrollLeft,before,ending+' stops panning');assert(f.click().defaultPrevented);
  f.pointer('pointerdown',3,100,100);f.pointer('pointerup',3,100,100);f.click();assert.equal(f.clicks(),1,ending+' permits next independent tap');
 }
});
check('backgrounding clears stale fingers before the next independent touch',()=>{
 for(const ending of ['blur','pagehide','visibilitychange']){
  const f=fixture();f.pointer('pointerdown',1,100,100);
  if(ending==='visibilitychange'){Object.defineProperty(f.w.document,'hidden',{value:true,configurable:true});f.w.document.dispatchEvent(new f.w.Event(ending));}else f.w.dispatchEvent(new f.w.Event(ending));
  f.pointer('pointerdown',2,200,100);f.pointer('pointermove',2,180,120);near(f.scale(),1,ending+' does not form a phantom pinch');
  f.pointer('pointerup',2,180,120);assert(f.click().defaultPrevented);
 }
});
check('ordinary resize refresh retains manual zoom and same-puzzle reattachment retains it',()=>{
 const f=fixture();f.pointer('pointerdown',1,80,100);f.pointer('pointerdown',2,180,100);f.pointer('pointermove',2,230,100);const scale=f.scale();
 f.pointer('pointerup',1,80,100);f.pointer('pointerup',2,230,100);f.w.NPBoardInput.refresh(f.board);near(f.scale(),scale,'refresh');
 const replacement=f.board.cloneNode(true);delete replacement.dataset.panReady;replacement.classList.remove('np-pan-board');replacement.style.transform='';
 Object.defineProperties(replacement,{offsetWidth:{value:1000},offsetHeight:{value:1000}});f.viewport.replaceChildren(replacement);f.w.NPBoardInput.scan();near(f.scale(),scale,'same-puzzle reattachment');
});
check('fit boards align in free space and centered zoom keeps the same board midpoint',()=>{
 const f=fixture({width:1000,height:300}),api=f.w.NPBoardInput;
 api.fit(f.board);
 for(const [align,left]of [['left',0],['center',350],['right',700]]){api.align(f.board,align,true);near(parseFloat(f.board.parentElement.style.marginLeft),left,align+' placement');}
 api.align(f.board,'center',true);
 for(let i=0;i<6;i++)f.w.document.querySelectorAll('.np-pan-tools button')[2].click();
 near(f.viewport.scrollLeft,(1000*f.scale()-1000)/2,'center remains anchored when zoom crosses viewport width');
 assert.equal(f.clicks(),0,'Display operations never edit a cell');
});
check('alignment reveals oversized boards without leaving an inaccessible margin',()=>{
 const f=fixture(),api=f.w.NPBoardInput;
 for(const [align,left]of [['right',700],['center',350],['left',0]]){api.align(f.board,align,true);near(f.viewport.scrollLeft,left,align+' oversized view');near(parseFloat(f.board.parentElement.style.marginLeft),0,'No negative or hidden margin');}
});
console.log(JSON.stringify({passed:checks.length,checks},null,2));
