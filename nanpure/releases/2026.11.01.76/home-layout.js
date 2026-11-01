(function(w){'use strict';
if(w.NPHomeLayout)return;
const asset=new URL('./',document.currentScript?.src||location.href);
if(!document.querySelector('link[data-home-layout]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('home-layout.css',asset).href;style.dataset.homeLayout='';document.head.append(style)}
const t=text=>w.NPI18n?.t(text)||text;
function mount(){
 document.querySelectorAll('[data-home-title],[data-home-guide]').forEach(node=>{if(!node.closest('.designed-home'))node.remove()});
 const main=document.querySelector('.designed-home');if(!main)return null;
 const top=main.querySelector('.home-topline'),links=main.querySelector('.home-bottom-links');if(!top||!links)return null;
 if(!links.querySelector('[data-home-guide]')){
  const button=document.createElement('button');button.type='button';button.dataset.homeGuide='';button.textContent=t('遊び方と保存');button.setAttribute('aria-haspopup','dialog');
  button.addEventListener('click',()=>{
   const source=main.querySelector('.site-intro');if(!source)return;
   const box=document.createElement('dialog');box.className='np-home-guide';box.setAttribute('aria-labelledby','np-home-guide-heading');
   const head=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.id='np-home-guide-heading';title.textContent=t('ナンプレ帳でできること');close.type='button';close.textContent=t('閉じる');close.addEventListener('click',()=>box.close());head.append(title,close);
   const content=source.cloneNode(true);content.classList.add('np-home-guide-content');content.removeAttribute('aria-labelledby');content.querySelector('h2')?.remove();content.querySelectorAll('[data-np-titles]').forEach(n=>n.remove());
   const actions=document.createElement('div');actions.className='np-home-guide-actions';
   for(const original of [main.querySelector('.tutorial-entry'),document.querySelector('.quick-help button:last-of-type')])if(original){const b=document.createElement('button');b.type='button';b.textContent=original.textContent;b.addEventListener('click',()=>{box.close();original.click()});actions.append(b)}
   box.append(head,content,actions);box.addEventListener('close',()=>{box.remove();button.focus({preventScroll:true})});document.body.append(box);box.showModal();
  });links.append(button);
 }
 main.classList.add('np-home-ready');return top;
}
w.NPHomeLayout={mount};
w.addEventListener('np-language-change',()=>{document.querySelectorAll('[data-home-guide]').forEach(b=>b.textContent=t('遊び方と保存'))});
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}).observe(document.documentElement,{childList:true,subtree:true});
mount();
})(window);
