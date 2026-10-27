/* Shared navigation for the print-only Android, Windows and web editions. */
(function(g){
 'use strict';
 function create(){
  const tabs=[...document.querySelectorAll('[data-workspace-tab]')],panels=[...document.querySelectorAll('[data-workspace-panel]')],dialog=document.getElementById('workspace-settings');
  let current='create';
  function activate(name,focus=true){
   if(!tabs.some(t=>t.dataset.workspaceTab===name))return;
   current=name;document.body.dataset.workspaceView=name;
   for(const tab of tabs){const on=tab.dataset.workspaceTab===name;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;}
   for(const panel of panels)panel.hidden=panel.dataset.workspacePanel!==name;
   document.dispatchEvent(new CustomEvent('wado-workspace-change',{detail:{view:name}}));
   if(focus){window.scrollTo(0,0);document.querySelector('[data-workspace-panel="'+name+'"] [data-workspace-heading]')?.focus({preventScroll:true});}
  }
  tabs.forEach((tab,index)=>{
   tab.addEventListener('click',()=>{activate(tab.dataset.workspaceTab,false);window.scrollTo(0,0);});
   tab.addEventListener('keydown',event=>{
    const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:offset?(index+offset+tabs.length)%tabs.length:-1;
    if(next<0)return;event.preventDefault();activate(tabs[next].dataset.workspaceTab,false);tabs[next].focus();
   });
  });
  for(const button of document.querySelectorAll('[data-workspace-go]'))button.addEventListener('click',()=>activate(button.dataset.workspaceGo));
  document.getElementById('workspace-open-settings').addEventListener('click',()=>dialog.showModal());
  for(const button of dialog.querySelectorAll('[data-workspace-close]'))button.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  function counts(total,selected){
   for(const node of document.querySelectorAll('[data-workspace-total]'))node.textContent=total;
   for(const node of document.querySelectorAll('[data-workspace-selected]'))node.textContent=selected;
   for(const button of document.querySelectorAll('[data-workspace-needs-selection]'))button.disabled=selected===0;
   for(const node of document.querySelectorAll('[data-workspace-selection-empty]'))node.hidden=selected>0;
  }
  function back(){if(dialog.open){dialog.close();return true;}if(current!=='create'){activate('create');return true;}return false;}
  activate('create',false);return{activate,counts,back};
 }
 g.WadoWorkspace={create};
})(globalThis);
