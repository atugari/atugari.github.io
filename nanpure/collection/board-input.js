/* Panning and explicit zoom for the puzzle board. */
(function(w){
 'use strict';
 const states=new Map(),controllers=new Set();
 let queued=false;
 function attach(board){
  if(board.dataset.panReady)return;
  board.dataset.panReady='1';
  const key=board.dataset.panKey;
  let state=states.get(key);
  if(!state){state={scale:1,x:0,y:0,fit:false};states.set(key,state);if(states.size>20)states.delete(states.keys().next().value);}
  let viewport=board.parentElement;
  if(!viewport.classList.contains('board-scroll')){viewport=document.createElement('div');board.before(viewport);viewport.append(board);}
  viewport.classList.add('np-pan-viewport');
  const stage=document.createElement('div');stage.className='np-pan-stage';board.before(stage);stage.append(board);board.classList.add('np-pan-board');
  const tools=document.createElement('div');tools.className='np-pan-tools';
  tools.innerHTML='<button type="button" aria-label="盤面を縮小する">−</button><button type="button" aria-label="倍率を100%に戻す"><span data-i18n-skip>100%</span></button><button type="button" aria-label="盤面を拡大する">＋</button><button type="button" class="np-pan-fit" aria-label="盤面全体を表示する">全体を表示</button>';
  const buttons=tools.querySelectorAll('button');
  const percent=buttons[1].querySelector('span');
  const fixedBoard=board.id==='board';
  function placeTools(){
   if(fixedBoard){
    const options=document.querySelector('#np-play-settings .np-board-options');
    if(options&&tools.parentElement!==options){
     const size=options.querySelector('.np-cell-size');
     if(size)size.after(tools);else options.prepend(tools);
    }
   }else if(tools.nextElementSibling!==viewport)viewport.before(tools);
  }
  // Free Play keeps zoom controls in its existing settings dialog.
  placeTools();
  const pointers=new Map();
  let observer=null,ignoreUntil=0,moved=false,previous=null;
  function dimensions(){
   const zoom=parseFloat(getComputedStyle(board).zoom)||1;
   return{width:Math.max(1,board.offsetWidth*zoom),height:Math.max(1,board.offsetHeight*zoom)};
  }
  function fitScale(){
   const size=dimensions();
   return Math.max(.01,Math.min(1,viewport.clientWidth/size.width,viewport.clientHeight/size.height));
  }
  function minimum(){return Math.min(.35,fitScale());}
  function paint(){
   if(!fixedBoard)board.style.width=viewport.clientWidth+'px';
   if(state.fit)state.scale=fitScale();
   const size=dimensions();
   stage.style.width=size.width*state.scale+'px';stage.style.height=size.height*state.scale+'px';
   board.style.transform='scale('+state.scale+')';
   const value=Math.round(state.scale*100)+'%';if(percent.textContent!==value)percent.textContent=value;
   buttons[0].disabled=state.scale<=minimum()+.0001;buttons[2].disabled=state.scale>=4;
   viewport.dataset.scale=String(state.scale);
  }
  function zoom(next,clientX,clientY){
   const rect=viewport.getBoundingClientRect(),x=clientX-rect.left-viewport.clientLeft,y=clientY-rect.top-viewport.clientTop;
   const baseX=(viewport.scrollLeft+x)/state.scale,baseY=(viewport.scrollTop+y)/state.scale;
   state.fit=false;state.scale=Math.max(minimum(),Math.min(4,next));paint();
   viewport.scrollLeft=baseX*state.scale-x;viewport.scrollTop=baseY*state.scale-y;
   state.x=viewport.scrollLeft;state.y=viewport.scrollTop;
  }
  function zoomCenter(next){const rect=viewport.getBoundingClientRect();zoom(next,rect.left+viewport.clientWidth/2,rect.top+viewport.clientHeight/2);}
  function fit(){state.fit=true;paint();viewport.scrollLeft=viewport.scrollTop=0;state.x=state.y=0;}
  function pointerCenter(){
   const values=[...pointers.values()];
   if(values.length>1)return{x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2,d:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y)};
   return values[0]?{x:values[0].x,y:values[0].y,d:0}:null;
  }
  function finish(event){
   // Touch starts with implicit capture on a cell. Moving that capture to the
   // viewport emits a bubbling loss on the cell, not the end of the gesture.
   if(event.type==='lostpointercapture'&&event.target!==viewport)return;
   if(!pointers.has(event.pointerId))return;
   if(moved||event.type!=='pointerup')ignoreUntil=Date.now()+600;
   pointers.delete(event.pointerId);previous=pointerCenter();
   try{viewport.releasePointerCapture(event.pointerId);}catch{}
  }
  function cancelPointers(){
   if(pointers.size){moved=true;ignoreUntil=Date.now()+600;}
   const ids=[...pointers.keys()];pointers.clear();previous=null;
   for(const id of ids){try{viewport.releasePointerCapture(id);}catch{}}
  }
  function hidden(){if(document.hidden)cancelPointers();}
  function startGesture(event){if(event.pointerType==='touch'&&event.isPrimary)cancelPointers();}
  function touchEnded(event){if(event.touches.length===0)cancelPointers();}
  function scrollParent(delta){
   let remaining=delta;
   for(let parent=viewport.parentElement;parent&&Math.abs(remaining)>.5;parent=parent.parentElement){
    const style=getComputedStyle(parent);
    if(!/(auto|scroll)/.test(style.overflowY)||parent.scrollHeight<=parent.clientHeight)continue;
    const before=parent.scrollTop;parent.scrollTop+=remaining;remaining-=parent.scrollTop-before;
   }
   if(Math.abs(remaining)>.5)w.scrollBy(0,remaining);
  }
  buttons[0].onclick=()=>zoomCenter(state.scale/1.25);
  buttons[1].onclick=()=>{state.fit=false;state.scale=1;paint();viewport.scrollLeft=viewport.scrollTop=0;state.x=state.y=0;};
  buttons[2].onclick=()=>zoomCenter(state.scale*1.25);
  buttons[3].onclick=fit;
  viewport.addEventListener('wheel',event=>{
   // An ordinary wheel/trackpad gesture scrolls. Zoom requires an explicit modifier.
   if(!event.deltaY||!(event.ctrlKey||event.metaKey))return;
   event.preventDefault();
   const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
   zoom(state.scale*Math.exp(.0025*-Math.max(-240,Math.min(240,delta))),event.clientX,event.clientY);
  },{passive:false});
  viewport.addEventListener('pointerdown',event=>{
   if(event.button!==0&&event.pointerType==='mouse')return;
   if(!pointers.size){moved=false;ignoreUntil=0;}
   pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,sx:event.clientX,sy:event.clientY});previous=pointerCenter();
   if(pointers.size>1){moved=true;ignoreUntil=Date.now()+600;}
  });
  viewport.addEventListener('pointermove',event=>{
   const point=pointers.get(event.pointerId);if(!point)return;
   point.x=event.clientX;point.y=event.clientY;const center=pointerCenter();
   if(pointers.size>1){
    moved=true;const factor=previous&&previous.d>0?center.d/previous.d:1;
    zoom(state.scale*factor,previous.x,previous.y);viewport.scrollLeft-=center.x-previous.x;viewport.scrollTop-=center.y-previous.y;
   }else{
    if(Math.hypot(point.x-point.sx,point.y-point.sy)>7)moved=true;
    if(moved&&previous){const delta=previous.y-center.y,before=viewport.scrollTop;viewport.scrollLeft+=previous.x-center.x;viewport.scrollTop+=delta;if(event.pointerType!=='mouse')scrollParent(delta-(viewport.scrollTop-before));}
   }
   if(moved){try{viewport.setPointerCapture(event.pointerId);}catch{}event.preventDefault();ignoreUntil=Date.now()+600;state.x=viewport.scrollLeft;state.y=viewport.scrollTop;}
   previous=center;
  },{passive:false});
  viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);viewport.addEventListener('lostpointercapture',finish);
  w.addEventListener('pointerdown',startGesture,true);w.addEventListener('pointerup',finish,true);w.addEventListener('pointercancel',finish,true);w.addEventListener('touchend',touchEnded,{passive:true});w.addEventListener('touchcancel',cancelPointers,{passive:true});
  w.addEventListener('blur',cancelPointers);w.addEventListener('pagehide',cancelPointers);document.addEventListener('visibilitychange',hidden);
  viewport.addEventListener('click',event=>{if(event.detail!==0&&(moved||Date.now()<ignoreUntil)){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  viewport.addEventListener('scroll',()=>{state.x=viewport.scrollLeft;state.y=viewport.scrollTop;},{passive:true});
  paint();viewport.scrollLeft=state.x;viewport.scrollTop=state.y;
  if(w.ResizeObserver){observer=new ResizeObserver(paint);observer.observe(board);observer.observe(viewport);}
  controllers.add({board,refresh:paint,fit,placeTools,dispose:()=>{cancelPointers();w.removeEventListener('pointerdown',startGesture,true);w.removeEventListener('pointerup',finish,true);w.removeEventListener('pointercancel',finish,true);w.removeEventListener('touchend',touchEnded);w.removeEventListener('touchcancel',cancelPointers);w.removeEventListener('blur',cancelPointers);w.removeEventListener('pagehide',cancelPointers);document.removeEventListener('visibilitychange',hidden);observer?.disconnect();tools.remove();}});
 }
 function scan(){
  queued=false;
  for(const controller of controllers){if(!controller.board.isConnected){controller.dispose();controllers.delete(controller);}else controller.placeTools();}
  document.querySelectorAll('[data-pan-key]:not([data-pan-ready])').forEach(attach);
 }
 function refresh(board){for(const controller of controllers)if(!board||controller.board===board)controller.refresh();}
 function start(){
  const style=document.createElement('style');
  style.textContent='.np-pan-viewport{overflow:auto;max-width:100%;max-height:58vh;max-height:58dvh;touch-action:none;overscroll-behavior:auto;position:relative;background:#fff;box-sizing:border-box}.np-pan-viewport *{touch-action:none!important}.np-pan-stage{position:relative;overflow:hidden;min-width:0}.np-pan-board{position:absolute!important;left:0;top:0;transform-origin:0 0;margin:0!important;max-width:none!important;user-select:none;-webkit-user-select:none}.np-pan-tools{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:8px 0}.np-pan-tools button[aria-label]{min-width:44px;min-height:44px;width:auto;border:1px solid #b7c6b5;border-radius:10px;background:#fff;color:#285849;font:600 max(14px,var(--ui-min-font,0px)) system-ui;padding:8px 10px;touch-action:manipulation}.np-pan-tools .np-pan-fit{font-size:max(13px,var(--ui-min-font,0px))}.np-pan-tools button:disabled{opacity:.4}@media print{.np-pan-tools{display:none!important}.np-pan-viewport{max-height:none;overflow:visible}.np-pan-stage{width:auto!important;height:auto!important;overflow:visible}.np-pan-board{position:relative!important;transform:none!important;width:100%!important}}';
  document.head.append(style);
  new MutationObserver(records=>{if(!queued&&records.some(record=>record.addedNodes.length||record.removedNodes.length)){queued=true;requestAnimationFrame(scan);}}).observe(document.body,{childList:true,subtree:true});
  scan();
 }
 w.NPBoardInput={scan,refresh,fit(board){for(const controller of controllers)if(controller.board===board)controller.fit();}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);
