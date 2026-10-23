/* Keep the board and its controls in normal flow. Short screens may scroll. */
(()=>{
 'use strict';
 let pending=false,measuring=false,lastBoard=null,lastKey='';
 const px=value=>parseFloat(value)||0;
 let heldKey=null,preview=null;
 const viewportSize=()=>[window.innerWidth,window.innerHeight,window.visualViewport?.width,window.visualViewport?.height,window.visualViewport?.scale].join(':');
 function clearPreview(){
  const wasHeld=!!heldKey;
  heldKey?.button?.classList.remove('np-key-preview-active');
  heldKey=null;preview?.remove();preview=null;
  if(wasHeld)schedule();
 }
 function refreshPreview(){
  if(!heldKey)return;
  const board=document.getElementById('board');
  if(!board||board.dataset.panKey!==heldKey.boardKey||document.querySelector('dialog[open],.modal-wrap')){clearPreview();return;}
  // Locking a number redraws the keypad. Follow that same number until release.
  const button=document.querySelector('.number-pad [data-action="number"][data-number="'+heldKey.value+'"]');
  if(!button||button.disabled){clearPreview();return;}
  if(button!==heldKey.button){heldKey.button.classList.remove('np-key-preview-active');heldKey.button=button;}
  button.classList.add('np-key-preview-active');
  const rect=button.getBoundingClientRect(),width=Math.max(64,Math.min(80,rect.width));
  const screenWidth=window.innerWidth||document.documentElement.clientWidth;
  const left=Math.max(4,Math.min(screenWidth-width-4,rect.left+(rect.width-width)/2));
  const stem=Math.min(36,Math.max(24,rect.width-8));
  preview.style.width=width+'px';preview.style.left=left+'px';preview.style.top=Math.max(0,rect.top-60)+'px';
  preview.style.setProperty('--np-preview-stem-left',Math.max(0,Math.min(width-stem,rect.left+rect.width/2-left-stem/2))+'px');
  preview.style.setProperty('--np-preview-stem-width',stem+'px');
 }
 function showPreview(event){
  clearPreview();
  const button=event.target?.closest?.('.number-pad [data-action="number"]');
  const board=document.getElementById('board');
  if(!board||!button||button.disabled||event.button!==0||event.isPrimary===false)return;
  heldKey={id:event.pointerId,x:event.clientX,y:event.clientY,value:button.dataset.number,boardKey:board.dataset.panKey,viewport:viewportSize(),button};
  preview=document.createElement('div');preview.className='np-key-preview';preview.setAttribute('aria-hidden','true');preview.setAttribute('data-i18n-skip','');preview.setAttribute('translate','no');preview.textContent=heldKey.value;
  document.body.append(preview);refreshPreview();
 }
 function movePreview(event){
  if(!heldKey||heldKey.id!==event.pointerId)return;
  refreshPreview();if(!heldKey)return;
  const rect=heldKey.button.getBoundingClientRect();
  if(Math.hypot(event.clientX-heldKey.x,event.clientY-heldKey.y)>10||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)clearPreview();
 }
 function layout(notify=false){
  if(measuring)return false;
  const app=document.getElementById('app'),board=document.getElementById('board-scroll'),dock=app?.querySelector('.play-dock');
  const active=!!(board&&dock);
  document.body.classList.toggle('compact-playing',active);
  if(!active){clearPreview();lastBoard=null;lastKey='';return false;}
  refreshPreview();
  measuring=true;
  try{
   // Move secondary controls into settings before measuring the first frame.
   window.NPPlaySettings?.sync();
   window.NPBoardInput?.scan();
   const screen=board.closest('.screen')||app;
   const status=document.getElementById('play-status');
   if(status&&status.parentElement!==dock)dock.append(status);
   const viewportHeight=Math.max(120,Math.floor(window.visualViewport?.height||window.innerHeight));
   const appStyle=getComputedStyle(app);
   const availableW=Math.max(80,app.clientWidth-px(appStyle.paddingLeft)-px(appStyle.paddingRight));
   // Honor the saved key size in both dimensions, balancing the final row.
   const keyWidth=44*Math.max(1,px(document.documentElement.style.getPropertyValue('--np-key-scale'))||1);
   for(const pad of dock.querySelectorAll('.number-pad')){
    const count=pad.querySelectorAll('button').length;
    const gap=px(getComputedStyle(pad).columnGap)||5;
    const width=Math.min(720,pad.clientWidth||availableW);
    const maximum=Math.max(1,Math.min(9,Math.floor((width+gap)/(keyWidth+gap))));
    const columns=count?Math.min(maximum,Math.ceil(count/Math.ceil(count/maximum))):maximum;
    if(pad.style.getPropertyValue('--np-pad-columns')!==String(columns))pad.style.setProperty('--np-pad-columns',String(columns));
   }
   const current=window.NanpureAppTest?.getCurrent?.();
   const ratio=current?.linked?current.linked.width/current.linked.height:1;
   let used=0;
   for(const el of screen.children){
    if(el===board||el.tagName==='DIALOG')continue;
    const style=getComputedStyle(el);
    if(style.display==='none'||style.position==='fixed'||style.position==='absolute')continue;
    used+=el.getBoundingClientRect().height+px(style.marginTop)+px(style.marginBottom);
   }
   const availableH=viewportHeight-used-px(appStyle.paddingTop)-px(appStyle.paddingBottom)-16;
   // Keep a useful board size and let the surrounding page scroll on short screens.
   const minimumEdge=Math.min(availableW,280);
   const width=Math.floor(Math.min(availableW,720,Math.max(minimumEdge,availableH*ratio)));
   const height=Math.max(80,Math.floor(width/ratio));
   const key=width+':'+height;
   const changed=lastBoard!==board||key!==lastKey;
   // A newly shown status must not move the key out from under a held finger.
   // Re-measure on release; a real viewport resize still cancels the preview.
   if(changed&&heldKey&&lastBoard===board)return false;
   if(changed){lastBoard=board;lastKey=key;board.style.width=width+'px';board.style.height=height+'px';}
   screen.classList.toggle('play-needs-scroll',height>availableH);
   if(changed&&notify)window.dispatchEvent(new Event('resize'));
   return changed;
  }finally{measuring=false;}
 }
 function update(){pending=false;layout(true);}
 function schedule(){if(!pending){pending=true;requestAnimationFrame(update);}}
 function resize(){if(heldKey&&heldKey.viewport!==viewportSize())clearPreview();schedule();}
 function relevant(record){
  const target=record.target.nodeType===1?record.target:record.target.parentElement;
  return !target?.closest('#board,#timer,#video-score,#video-flash,.np-pan-tools');
 }
 function start(){
  const app=document.getElementById('app');if(!app)return;
  new MutationObserver(records=>{refreshPreview();if(records.some(relevant))schedule();}).observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open']});
  // Observe before tap assistance handles document events; never change input behavior.
  window.addEventListener('pointerdown',showPreview,{capture:true,passive:true});
  window.addEventListener('pointermove',movePreview,{capture:true,passive:true});
  for(const name of ['pointerup','pointercancel'])window.addEventListener(name,event=>{if(heldKey?.id===event.pointerId)clearPreview();},{capture:true,passive:true});
  window.addEventListener('pointerout',event=>{
   if(!heldKey||event.pointerId!==heldKey.id||!heldKey.button.isConnected)return;
   if(heldKey.button.contains(event.target)&&!heldKey.button.contains(event.relatedTarget))clearPreview();
  },{capture:true,passive:true});
  window.addEventListener('scroll',clearPreview,{capture:true,passive:true});
  for(const name of ['blur','pagehide'])window.addEventListener(name,clearPreview,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPreview();});
  window.addEventListener('resize',resize);
  window.visualViewport?.addEventListener('resize',resize);
  window.addEventListener('np-ui-text-change',schedule);
  document.addEventListener('change',event=>{if(event.target?.closest?.('.np-access-tools'))schedule();});
  document.addEventListener('np-hint-layout',schedule);
  schedule();
 }
 // The renderer calls layout before reading the board viewport's dimensions.
 window.NPCompactPlay={layout:()=>layout(false),refresh:schedule};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
