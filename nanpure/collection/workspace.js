/* Collection-only board workspace; move the real keypad, preserving input handlers. */
(function(w){
 'use strict';
 const storeKey='collection-workspace-v1',positions=['bottom','top','left','right','float'];
 const prefs={position:'bottom',shape:'grid',wide:false,x:null,y:null};
 try{const saved=JSON.parse(localStorage.getItem(storeKey)||'{}');if(positions.includes(saved.position))prefs.position=saved.position;if(['grid','wide','tall'].includes(saved.shape))prefs.shape=saved.shape;prefs.wide=saved.wide===true;for(const key of ['x','y'])if(Number.isFinite(saved[key]))prefs[key]=Math.max(0,Math.min(1,saved[key]));}catch{}
 let screen=null,board=null,viewport=null,panel=null,tools=null,drag=null,scheduled=false,collapsed=false,beforeWide='bottom';
 const px=n=>(Math.round(n*100)/100)+'px';
 function save(){try{localStorage.setItem(storeKey,JSON.stringify(prefs));}catch{}}
 function parentFocus(){try{if(parent!==w)parent.document.body.classList.toggle('collection-focus',prefs.wide&&!!screen);}catch{}}
 function clampPanel(){
  if(!panel||prefs.position!=='float')return;
  const width=w.innerWidth,height=w.innerHeight,rect=panel.getBoundingClientRect();
  const maxX=Math.max(4,width-rect.width-4),maxY=Math.max(4,height-rect.height-4);
  const x=4+(maxX-4)*(prefs.x??1),y=4+(maxY-4)*(prefs.y??.85);
  panel.style.left=px(x);panel.style.top=px(y);
 }
 function sizeKeys(){
  if(!panel)return;
  const pad=panel.querySelector('.number-pad');if(!pad)return;
  const n=pad.querySelectorAll('button').length,available=panel.clientWidth-12;
  let desired=prefs.position==='float'?(prefs.shape==='wide'?9:prefs.shape==='tall'?3:(n<=9?3:5)):(prefs.position==='left'||prefs.position==='right')?4:9;
  const columns=Math.max(1,Math.min(n,desired,Math.floor((available+4)/48)));
  pad.style.setProperty('--np-workspace-columns',String(columns));
 }
 function refresh(){
  if(!screen||!screen.isConnected)return;
  sizeKeys();clampPanel();w.NPBoardInput?.refresh(board);
 }
 function setPosition(value){
  if(!positions.includes(value))return;
  finishDrag();prefs.position=value;collapsed=false;apply();save();
 }
 function apply(){
  if(!screen)return;
  screen.dataset.numberPosition=prefs.position;screen.dataset.keyShape=prefs.shape;
  screen.classList.toggle('np-wide',prefs.wide);panel.classList.toggle('np-keys-collapsed',collapsed);
  tools.querySelector('[data-position]').value=prefs.position;
  const wide=tools.querySelector('[data-wide]');wide.textContent=prefs.wide?'通常表示':'盤面を広く';wide.setAttribute('aria-pressed',String(prefs.wide));
  panel.querySelector('[data-shape]').value=prefs.shape;
  const collapse=panel.querySelector('[data-collapse]');collapse.textContent=collapsed?'数字を表示':'たたむ';collapse.setAttribute('aria-expanded',String(!collapsed));
  parentFocus();refresh();
 }
 function finishDrag(){
  if(!drag)return;
  const handle=drag.handle,id=drag.id;drag=null;
  try{handle.releasePointerCapture(id);}catch{}
  panel?.classList.remove('np-key-dragging');save();
 }
 function movePanel(x,y){
  if(!panel)return;
  const rect=panel.getBoundingClientRect(),maxX=Math.max(0,w.innerWidth-rect.width-8),maxY=Math.max(0,w.innerHeight-rect.height-8);
  prefs.x=maxX?Math.max(0,Math.min(1,(x-4)/maxX)):0;
  prefs.y=maxY?Math.max(0,Math.min(1,(y-4)/maxY)):0;
  clampPanel();
 }
 function mount(){
  scheduled=false;
  const current=document.getElementById('board'),nextViewport=current?.closest('#board-scroll'),nextScreen=current?.closest('.screen');
  if(!current||!nextViewport||!nextScreen){screen=null;board=null;viewport=null;panel=null;tools=null;document.body.classList.remove('np-collection-workspace');parentFocus();return;}
  if(current===board&&screen?.isConnected){sizeKeys();return;}
  finishDrag();board=current;viewport=nextViewport;screen=nextScreen;
  const numbers=screen.querySelector('#number-controls');if(!numbers)return;
  document.body.classList.add('np-collection-workspace');screen.classList.add('np-workspace-screen');collapsed=false;
  tools=document.createElement('div');tools.className='np-workspace-tools';tools.setAttribute('aria-label','盤面と数字の配置');
  tools.innerHTML='<button type="button" data-wide aria-pressed="false">盤面を広く</button><div class="np-direct-zoom" role="group" aria-label="盤面の拡大"><button type="button" data-zoom="out" aria-label="盤面を縮小する">−</button><button type="button" data-zoom="fit">全体</button><button type="button" data-zoom="in" aria-label="盤面を拡大する">＋</button></div><label>数字<select data-position aria-label="数字の位置"><option value="bottom">下</option><option value="top">上</option><option value="left">左</option><option value="right">右</option><option value="float">浮かせる</option></select></label>';
  viewport.before(tools);
  panel=document.createElement('section');panel.className='np-number-panel';panel.setAttribute('aria-label','移動できる数字ボタン');
  panel.innerHTML='<div class="np-number-bar"><button type="button" class="np-number-handle" aria-label="数字ボタンを移動する。ドラッグまたは矢印キーで移動">⠿ 数字</button><label class="np-shape-label"><span>形</span><select data-shape aria-label="数字ボタンの形"><option value="grid">格子</option><option value="wide">横長</option><option value="tall">縦長</option></select></label><button type="button" data-collapse aria-expanded="true">たたむ</button></div>';
  panel.append(numbers);screen.append(panel);
  tools.querySelector('[data-position]').onchange=e=>setPosition(e.target.value);
  tools.querySelector('[data-wide]').onclick=()=>{prefs.wide=!prefs.wide;if(prefs.wide){beforeWide=prefs.position;if(prefs.position==='bottom'||prefs.position==='top')prefs.position='float';}else if(prefs.position==='float')prefs.position=beforeWide;apply();save();};
  tools.querySelectorAll('[data-zoom]').forEach(button=>button.onclick=()=>{if(button.dataset.zoom==='fit')w.NPBoardInput?.fit(board);else{const key=board.dataset.panKey;const controls=Array.from(document.querySelectorAll('.np-pan-tools')).find(el=>el.dataset.boardKey===key)||document.querySelector('.np-pan-tools');controls?.querySelectorAll('button')[button.dataset.zoom==='in'?2:0]?.click();}refresh();});
  panel.querySelector('[data-shape]').onchange=e=>{prefs.shape=e.target.value;apply();save();};
  panel.querySelector('[data-collapse]').onclick=()=>{collapsed=!collapsed;apply();};
  const handle=panel.querySelector('.np-number-handle');
  handle.addEventListener('pointerdown',e=>{
   if((e.pointerType==='mouse'&&e.button!==0)||e.isPrimary===false)return;
   if(prefs.position!=='float'){const rect=panel.getBoundingClientRect();prefs.position='float';apply();movePanel(rect.left,rect.top);}
   const rect=panel.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX-rect.left,y:e.clientY-rect.top,handle};
   try{handle.setPointerCapture(e.pointerId);}catch{}
   panel.classList.add('np-key-dragging');e.preventDefault();
  });
  handle.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;movePanel(e.clientX-drag.x,e.clientY-drag.y);e.preventDefault();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,finishDrag);
  handle.addEventListener('keydown',e=>{
   const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];
   if(!delta&&e.key!=='Home')return;e.preventDefault();if(prefs.position!=='float')setPosition('float');
   if(e.key==='Home'){prefs.x=1;prefs.y=.85;clampPanel();}else{const rect=panel.getBoundingClientRect();movePanel(rect.left+delta[0],rect.top+delta[1]);}save();
  });
  apply();
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(mount);}}
 new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.removedNodes.length))schedule();}).observe(document.getElementById('app'),{childList:true,subtree:true});
 for(const type of ['resize','orientationchange'])w.addEventListener(type,()=>{finishDrag();requestAnimationFrame(refresh);});
 w.addEventListener('blur',finishDrag);w.addEventListener('pagehide',finishDrag);document.addEventListener('visibilitychange',()=>{if(document.hidden)finishDrag();});
 w.NPCollectionWorkspace={refresh};mount();
})(window);
