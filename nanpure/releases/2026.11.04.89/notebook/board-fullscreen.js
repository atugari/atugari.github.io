/* Full-screen play keeps the real input controls and never replaces puzzle data. */
(function(w){
 'use strict';
 let screen=null,board=null,tools=null,button=null,menuButton=null,menu=null,host=null;
 let active=false,pending=false,nativeOwned=false,scheduled=false,moved=[],message=null,messageTimer=null;
 const fsElement=doc=>doc.fullscreenElement||doc.webkitFullscreenElement;
 function context(){
  let current=w;const frames=[];
  try{while(current.parent!==current){const next=current.parent;void next.document;const frame=current.frameElement;if(!frame)break;frame.allowFullscreen=true;frames.push(frame);current=next;}}catch{}
  return{window:current,document:current.document,root:current.document.documentElement,frames};
 }
 function fit(){
  const current=board;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(current===board&&current?.isConnected){w.NPPlayWorkspace?.refresh();w.NPBoardInput?.fit(current);}}));
 }
 function say(text){
  if(!message){message=document.createElement('p');message.className='np-fullscreen-message';message.setAttribute('role','status');document.body.append(message);}
  clearTimeout(messageTimer);message.textContent=text;message.hidden=false;
  messageTimer=setTimeout(()=>{if(message)message.hidden=true;},6000);
 }
 function move(element,target){
  if(!element)return;const anchor=document.createComment('fullscreen-control');element.before(anchor);moved.push({element,anchor});target.append(element);
 }
 function restore(){
  menu?.close();
  for(const {element,anchor}of moved){if(anchor.parentNode)anchor.replaceWith(element);}
  moved=[];menu?.remove();menu=null;
 }
 function labels(){
  if(button){button.textContent=active?'全画面を終了':'全画面';button.setAttribute('aria-pressed',String(active));button.title=active?'Escキーでも通常表示に戻れます':'ブラウザ上部も隠して、盤面を大きく表示します';}
  if(menuButton)menuButton.hidden=!active||!menu;
 }
 function hostLayout(enabled){
  if(!host)return;
  for(const frame of host.frames){
   const doc=frame.ownerDocument;
   if(enabled&&!doc.getElementById('np-fullscreen-host-style')){const style=doc.createElement('style');style.id='np-fullscreen-host-style';style.textContent='body.np-fullscreen-host{overflow:hidden!important}body.np-fullscreen-host iframe.np-fullscreen-frame{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;min-height:0!important;border:0!important;margin:0!important;padding:0!important;z-index:2147483000!important;display:block!important}';doc.head.append(style);}
   frame.classList.toggle('np-fullscreen-frame',enabled);doc.body.classList.toggle('np-fullscreen-host',enabled);
  }
 }
 function expand(){
  if(!screen)return;
  screen.classList.add('np-fullscreen');document.body.classList.add('np-fullscreen-playing');
  const head=screen.querySelector(':scope>.play-head');if(head)move(head,tools);
  const controls=[...screen.querySelectorAll(':scope>.multi-board-legend,:scope>.multi-cell-context,:scope>.linked-controls,:scope>#hundred-nav')];
  if(controls.length){
   menu=document.createElement('dialog');menu.className='np-fullscreen-boards';menu.setAttribute('aria-label','盤面の切り替え');
   menu.innerHTML='<h2>盤面の切り替え</h2><form method="dialog"><button type="submit">閉じる</button></form>';
   const form=menu.querySelector('form');for(const element of controls){move(element,menu);menu.insertBefore(element,form);}
   screen.append(menu);
   menu.addEventListener('click',e=>{if(e.target===menu)menu.close();else if(e.target.closest('[data-action="linked-focus"],[data-action="hundred-jump"]'))menu.close();});
  }
  hostLayout(true);labels();fit();
 }
 function collapse(){
  active=false;nativeOwned=false;restore();screen?.classList.remove('np-fullscreen');if(screen)delete screen.dataset.fullscreenMode;document.body.classList.remove('np-fullscreen-playing');hostLayout(false);labels();if(message)message.hidden=true;fit();
 }
 async function leave(){
  if(pending)return;pending=true;
  try{if(nativeOwned&&fsElement(host.document)===host.root){const exit=host.document.exitFullscreen||host.document.webkitExitFullscreen;if(exit)await exit.call(host.document);}}
  catch{}finally{collapse();pending=false;button?.focus({preventScroll:true});}
 }
 function changed(){
  if(!active)return;
  if(fsElement(host.document)===host.root){nativeOwned=true;fit();}
  else if(nativeOwned&&!pending)collapse();
 }
 async function enter(){
  if(active||pending||!screen)return;pending=true;host=context();active=true;expand();
  host.document.addEventListener('fullscreenchange',changed);host.document.addEventListener('webkitfullscreenchange',changed);
  let native=false;
  try{
   const request=host.root.requestFullscreen||host.root.webkitRequestFullscreen;
   if(request){await request.call(host.root);native=fsElement(host.document)===host.root;nativeOwned=native;}
  }catch(error){console.warn('Nanpure fullscreen request:',error.name,error.message);}
  finally{pending=false;if(screen)screen.dataset.fullscreenMode=native?'native':'page';fit();}
  if(active)say(native?'Escキーで全画面を終了できます':'ページ内で広く表示しています。ブラウザの全画面はF11キーでも切り替えられます。');
 }
 function cleanup(){
  const oldHost=host,owned=nativeOwned;
  collapse();oldHost?.document.removeEventListener('fullscreenchange',changed);oldHost?.document.removeEventListener('webkitfullscreenchange',changed);
  if(owned&&fsElement(oldHost.document)===oldHost.root){try{Promise.resolve((oldHost.document.exitFullscreen||oldHost.document.webkitExitFullscreen).call(oldHost.document)).catch(()=>{});}catch{}}
  button?.remove();menuButton?.remove();button=menuButton=null;screen=board=tools=null;
 }
 function mount(){
  scheduled=false;
  const next=document.getElementById('board'),nextScreen=next?.closest('.np-workspace-screen'),nextTools=nextScreen?.querySelector('.np-workspace-tools');
  if(!next){if(screen)cleanup();return;}
  // The game redraws its screen before the workspace moves the controls.
  // Keep the session until that second mount has created the toolbar.
  if(!nextTools)return;
  if(nextScreen===screen&&button?.isConnected)return;
  const continuing=active;if(screen){restore();screen.classList.remove('np-fullscreen');button?.remove();menuButton?.remove();}
  board=next;screen=nextScreen;tools=nextTools;
  button=document.createElement('button');button.type='button';button.dataset.fullscreen='';button.onclick=()=>active?leave():enter();
  tools.prepend(button);
  menuButton=document.createElement('button');menuButton.type='button';menuButton.dataset.fullscreenBoards='';menuButton.textContent='盤面一覧';menuButton.onclick=()=>menu?.showModal();tools.append(menuButton);
  if(continuing){expand();screen.dataset.fullscreenMode=nativeOwned?'native':'page';}else labels();
  // Narrow screens retain their compact toolbar; the same entry is in Text/layout.
  const layout=document.querySelector('.np-workspace-dialog');
  if(layout&&!layout.querySelector('[data-fullscreen-entry]')){const entry=document.createElement('button');entry.type='button';entry.dataset.fullscreenEntry='';entry.textContent='全画面で表示';entry.onclick=()=>{layout.close();enter();};layout.querySelector('form').before(entry);}
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(mount);}}
 new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.removedNodes.length))schedule();}).observe(document.getElementById('app'),{childList:true,subtree:true});
 document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'&&!document.querySelector('dialog[open]')&&!nativeOwned){e.preventDefault();leave();}});
 w.addEventListener('pagehide',cleanup);w.NPBoardFullscreen={enter,leave,isActive:()=>active};mount();
})(window);
