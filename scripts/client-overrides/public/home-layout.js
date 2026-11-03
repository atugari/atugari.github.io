(function(w){'use strict';
if(w.NPHomeLayout)return;
const asset=new URL('./',document.currentScript?.src||location.href);
if(!document.querySelector('link[data-home-layout]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('home-layout.css',asset).href;style.dataset.homeLayout='';document.head.append(style)}
const t=text=>w.NPI18n?.t(text)||text;
function showGuide(){
 const main=document.querySelector('.designed-home'),source=main?.querySelector('.site-intro'),button=main?.querySelector('[data-home-guide]');if(!source)return;
 const box=document.createElement('dialog');box.className='np-home-guide';box.setAttribute('aria-labelledby','np-home-guide-heading');
 const head=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.id='np-home-guide-heading';title.textContent=t('ナンプレ帳でできること');close.type='button';close.textContent=t('閉じる');close.addEventListener('click',()=>box.close());head.append(title,close);
 const content=source.cloneNode(true);content.classList.add('np-home-guide-content');content.removeAttribute('aria-labelledby');content.querySelector('h2')?.remove();content.querySelectorAll('[data-np-titles]').forEach(n=>n.remove());
 const actions=document.createElement('div');actions.className='np-home-guide-actions';const original=main.querySelector('.tutorial-entry');if(original){const b=document.createElement('button');b.type='button';b.textContent=original.textContent;b.onclick=()=>{box.close();original.click()};actions.append(b)}
 box.append(head,content,actions);box.addEventListener('close',()=>{box.remove();button?.focus({preventScroll:true})});document.body.append(box);box.showModal();
}
function mount(){document.querySelectorAll('[data-home-title],[data-home-guide]').forEach(node=>{if(!node.closest('.designed-home'))node.remove()});const main=document.querySelector('.designed-home');if(!main)return null;main.classList.add('np-home-ready');return main.querySelector('.home-topline')}
w.NPHomeLayout={mount,showGuide};let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}).observe(document.documentElement,{childList:true,subtree:true});mount();
})(window);
