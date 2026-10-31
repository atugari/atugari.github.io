/* Shared play workspace; move the real controls and preserve their handlers. */
(function(w){
 'use strict';
 const storeKey='collection-workspace-v1',positions=['auto','bottom','top','left','right','float'];
 const digitSizes=[100,125,150,175,200],alignments=['left','center','right'];
 const prefs={position:'auto',shape:'grid',wide:false,x:null,y:null,digitSize:100,align:'center'};
 try{const saved=JSON.parse(localStorage.getItem(storeKey)||'{}');if(positions.includes(saved.position))prefs.position=saved.position;if(['grid','wide','tall'].includes(saved.shape))prefs.shape=saved.shape;prefs.wide=saved.wide===true;if(digitSizes.includes(saved.digitSize))prefs.digitSize=saved.digitSize;if(alignments.includes(saved.align))prefs.align=saved.align;for(const key of ['x','y'])if(Number.isFinite(saved[key]))prefs[key]=Math.max(0,Math.min(1,saved[key]));}catch{}
 let screen=null,board=null,viewport=null,panel=null,tools=null,dialog=null,boardObserver=null,drag=null,scheduled=false,collapsed=false,beforeWide='bottom',notice=null,noticeQueued=false,noticeDismissed=false;
 const px=n=>(Math.round(n*100)/100)+'px';
 function save(){try{localStorage.setItem(storeKey,JSON.stringify(prefs));}catch{}}
 function parentFocus(){try{if(parent!==w){parent.document.body.classList.toggle('collection-focus',prefs.wide&&!!screen);parent.document.body.classList.toggle('collection-compact',!!screen&&screen.dataset.compactBoard==='true');}}catch{}}
 function position(){return prefs.position==='auto'?(w.innerWidth>=900||w.innerWidth>=600&&w.innerHeight<=500?'right':'bottom'):prefs.position;}
 function compactBoard(){return !!board&&w.innerWidth<=600&&getComputedStyle(board).gridTemplateColumns.trim().split(/\s+/).length===16;}
 function scheduleReadability(){if(noticeQueued)return;noticeQueued=true;requestAnimationFrame(()=>{
  noticeQueued=false;if(!notice||!board?.isConnected)return;
  const size=w.NPBoardInput?.measure(board),small=!!size&&(size.cellSize<24||(size.digitSize!==null&&size.digitSize<11));
  notice.hidden=noticeDismissed||!small;
  clampPanel();
 });}
 function clampPanel(){
  if(!panel||position()!=='float')return;
  const width=w.innerWidth,height=w.innerHeight,rect=panel.getBoundingClientRect();
  const maxX=Math.max(4,width-rect.width-4),maxY=Math.max(4,height-rect.height-4);
  const x=4+(maxX-4)*(prefs.x??1),y=4+(maxY-4)*(prefs.y??.85);
  panel.style.left=px(x);panel.style.top=px(y);
 }
 function sizeKeys(){
  if(!panel)return;
  const pad=panel.querySelector('.number-pad');if(!pad)return;
  const n=pad.querySelectorAll('button').length,available=panel.clientWidth-12;
  const compact=screen.dataset.compactBoard==='true'&&['bottom','top'].includes(position());
  let desired=compact?8:position()==='float'?(prefs.shape==='wide'?9:prefs.shape==='tall'?3:(n<=9?3:5)):(position()==='left'||position()==='right')?5:9;
  const columns=Math.max(1,Math.min(n,desired,Math.floor((available+4)/(compact?40:48))));
  pad.style.setProperty('--np-workspace-columns',String(columns));
 }
 function refresh(revealBoard=false){
  if(!screen||!screen.isConnected)return;
  screen.dataset.numberPosition=position();screen.dataset.compactBoard=String(compactBoard());parentFocus();
  sizeKeys();sizeDigits();clampPanel();w.NPBoardInput?.align(board,prefs.align,revealBoard);scheduleReadability();
 }
 function sizeDigits(){
  if(!board)return;
  board.dataset.digitSize=String(prefs.digitSize);
  board.style.setProperty('--np-workspace-digit-scale',String(prefs.digitSize/100));
  const digitsInCells=Array.from(board.querySelectorAll('.cell>span:not(.notes,.hundred-notes,.cage-label,.cage-border)')).filter(text=>!text.children.length&&/^\d+$/.test(text.textContent.trim()));
  for(const text of digitsInCells)text.classList.add('np-workspace-digit');
  const cell=board.querySelector('.cell');
  if(cell){
   const columns=getComputedStyle(board).gridTemplateColumns.trim().split(/\s+/).length;
   const digits=String(board.classList.contains('hundred-board')?100:columns).length;
   const limit=Math.min(cell.clientHeight*(board.querySelector('.cage-label') ? .7 : .88),cell.clientWidth/(digits*.64));
   board.style.setProperty('--np-workspace-digit-limit',px(Math.max(1,limit)));
   if(prefs.digitSize!==100){
    // Font families and uneven cell borders have different glyph widths. Check
    // the rendered numeric spans as well, rather than trusting a character ratio.
    let fitted=limit;
    for(const text of digitsInCells){
     const rect=text.getBoundingClientRect(),box=text.parentElement.getBoundingClientRect(),available=Math.max(1,box.width-Math.min(2,box.width*.04));
     if(rect.width>available)fitted=Math.min(fitted,parseFloat(getComputedStyle(text).fontSize)*available/rect.width);
    }
    if(fitted<limit)board.style.setProperty('--np-workspace-digit-limit',px(Math.max(1,fitted)));
   }
  }
  // Linked boards draw their main digits in SVG; candidate notes and clues keep
  // their own sizes. SVG's cell coordinates are 40 units wide.
  for(const text of board.querySelectorAll('text[data-linked-digit],text[data-multi-digit]')){
   if(prefs.digitSize===100){text.style.removeProperty('--np-workspace-linked-font');continue;}
   const original=Number(text.getAttribute('font-size'))||22,digits=text.textContent.trim().length||1;
   text.style.setProperty('--np-workspace-linked-font',px(Math.max(original,Math.min(original*prefs.digitSize/100,34,40/(digits*.64)))));
  }
 }
 function makeDialog(){
  dialog?.remove();dialog=document.createElement('dialog');dialog.className='np-workspace-dialog';dialog.setAttribute('aria-label','盤面の文字と位置');
  dialog.innerHTML='<h2>盤面の文字と位置</h2><label>文字サイズ<select data-digit-size aria-label="盤面の文字サイズ">'+digitSizes.map(n=>'<option value="'+n+'">'+n+'%'+(n===100?'（標準）':'')+'</option>').join('')+'</select></label><p>数字がマスに収まる範囲で大きくします。</p><label>盤面の位置<select data-board-align aria-label="盤面の位置"><option value="left">左</option><option value="center">中央</option><option value="right">右</option></select></label><label>数字ボタンの位置<select data-dialog-position aria-label="数字ボタンの位置"><option value="auto">自動（余白を使う）</option><option value="bottom">下</option><option value="top">上</option><option value="left">左</option><option value="right">右</option><option value="float">浮かせる</option></select></label><form method="dialog"><button type="submit">閉じる</button></form>';
  dialog.querySelector('[data-digit-size]').onchange=e=>{prefs.digitSize=Number(e.target.value);refresh();save();};
  dialog.querySelector('[data-board-align]').onchange=e=>{prefs.align=e.target.value;refresh(true);save();};
  dialog.querySelector('[data-dialog-position]').onchange=e=>setPosition(e.target.value);
  document.body.append(dialog);
 }
 function setPosition(value){
  if(!positions.includes(value))return;
  finishDrag();prefs.position=value;collapsed=false;apply();if(value==='auto')requestAnimationFrame(()=>{if(board?.isConnected){w.NPBoardInput?.fit(board);refresh();}});save();
 }
 function apply(revealBoard=false){
  if(!screen)return;
  screen.dataset.numberPosition=position();screen.dataset.numberPreference=prefs.position;screen.dataset.keyShape=prefs.shape;
  screen.classList.toggle('np-wide',prefs.wide);panel.classList.toggle('np-keys-collapsed',collapsed);
  tools.querySelector('[data-position]').value=prefs.position;
  if(dialog)dialog.querySelector('[data-dialog-position]').value=prefs.position;
  const wide=tools.querySelector('[data-wide]');wide.textContent=prefs.wide?'通常表示':'盤面を広く';wide.setAttribute('aria-pressed',String(prefs.wide));
  panel.querySelector('[data-shape]').value=prefs.shape;
  const collapse=panel.querySelector('[data-collapse]');collapse.textContent=collapsed?'数字を表示':'たたむ';collapse.setAttribute('aria-expanded',String(!collapsed));
  parentFocus();refresh(revealBoard);
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
  if(!current||!nextViewport||!nextScreen){boardObserver?.disconnect();dialog?.remove();dialog=null;screen=null;board=null;viewport=null;panel=null;tools=null;document.body.classList.remove('np-collection-workspace');parentFocus();return;}
  if(current===board&&screen?.isConnected){refresh();return;}
  finishDrag();board=current;viewport=nextViewport;screen=nextScreen;
  const numbers=screen.querySelector('#number-controls');if(!numbers)return;
  document.body.classList.add('np-collection-workspace');screen.classList.add('np-workspace-screen');collapsed=false;noticeDismissed=false;
  tools=document.createElement('div');tools.className='np-workspace-tools';tools.setAttribute('aria-label','盤面と数字の配置');
  tools.innerHTML='<button type="button" data-wide aria-pressed="false">盤面を広く</button><div class="np-direct-zoom" role="group" aria-label="盤面の拡大"><button type="button" data-zoom="out" aria-label="盤面を縮小する">−</button><button type="button" data-zoom="fit">全体</button><button type="button" data-zoom="in" aria-label="盤面を拡大する">＋</button></div><button type="button" data-board-settings>文字・位置</button><label>数字<select data-position aria-label="数字の位置"><option value="auto">自動（余白を使う）</option><option value="bottom">下</option><option value="top">上</option><option value="left">左</option><option value="right">右</option><option value="float">浮かせる</option></select></label>';
  viewport.before(tools);
  panel=document.createElement('section');panel.className='np-number-panel';panel.setAttribute('aria-label','移動できる数字ボタン');
  panel.innerHTML='<div class="np-number-bar"><button type="button" class="np-number-handle" aria-label="数字ボタンを移動する。ドラッグまたは矢印キーで移動">⠿ 数字</button><label class="np-shape-label"><span>形</span><select data-shape aria-label="数字ボタンの形"><option value="grid">格子</option><option value="wide">横長</option><option value="tall">縦長</option></select></label><button type="button" data-collapse aria-expanded="true">たたむ</button></div>';
  const actions=screen.querySelector('.play-dock>.tools');if(actions){actions.classList.add('np-workspace-actions');panel.append(actions);}panel.append(numbers);screen.append(panel);
  notice=document.createElement('div');notice.className='np-small-board-notice';notice.setAttribute('role','status');notice.hidden=true;
  notice.innerHTML='<span>⚠ マスが小さめ</span><button type="button" data-readable aria-label="マスを見やすい大きさに拡大する" title="拡大後は盤面をドラッグして移動できます">拡大</button><button type="button" data-dismiss-size aria-label="小さいマスの案内を閉じる">×</button>';
  panel.querySelector('[data-collapse]').before(notice);
  notice.querySelector('[data-readable]').onclick=()=>w.NPBoardInput?.readable(board);
  notice.querySelector('[data-dismiss-size]').onclick=()=>{noticeDismissed=true;notice.hidden=true;clampPanel();};
  tools.querySelector('[data-position]').onchange=e=>setPosition(e.target.value);
  makeDialog();tools.querySelector('[data-board-settings]').onclick=()=>{dialog.querySelector('[data-digit-size]').value=String(prefs.digitSize);dialog.querySelector('[data-board-align]').value=prefs.align;dialog.querySelector('[data-dialog-position]').value=prefs.position;dialog.showModal();};
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
  boardObserver?.disconnect();if(w.ResizeObserver){boardObserver=new ResizeObserver(()=>{sizeDigits();scheduleReadability();});boardObserver.observe(board);boardObserver.observe(viewport);}
  apply(true);if(prefs.position==='auto'){const mounted=board;requestAnimationFrame(()=>{if(board===mounted&&mounted.isConnected){w.NPBoardInput?.fit(mounted);refresh();}});}
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(mount);}}
 new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.removedNodes.length))schedule();}).observe(document.getElementById('app'),{childList:true,subtree:true});
 for(const type of ['resize','orientationchange'])w.addEventListener(type,()=>{finishDrag();requestAnimationFrame(()=>refresh());});
 document.addEventListener('np-board-viewchange',scheduleReadability);
 w.addEventListener('blur',finishDrag);w.addEventListener('pagehide',finishDrag);document.addEventListener('visibilitychange',()=>{if(document.hidden)finishDrag();});
 w.NPCollectionWorkspace={refresh};w.NPPlayWorkspace=w.NPCollectionWorkspace;mount();
})(window);
