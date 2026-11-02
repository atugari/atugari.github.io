// One entry point; all gallery code is loaded only when needed.
(function(){'use strict';
const script=document.currentScript,base=new URL('./',script.src),installed=new WeakSet();let module;
function capture(a){if(!a||installed.has(a)||typeof a.capture!=='function')return;installed.add(a);const original=a.capture;a.capture=function(type,data){const result=original.apply(this,arguments);if(type==='clear'&&data?.game==='sudoku'&&data.valid===true){module??=import(new URL('data.mjs',base));module.then(m=>m.addClear(data)).catch(()=>{});}return result;};}
function mount(){
 const host=document.querySelector('.home-bottom-links')||document.querySelector('.home-topline')||document.querySelector('#library header');
 if(host&&!host.querySelector('[data-gallery-entry]')){const a=document.createElement('a');a.dataset.galleryEntry='';a.href='/nanpure/gallery/';a.textContent='自分の展示室';a.className='np-gallery-entry';host.append(a);}
 capture(window.NPAchievements);
 for(const f of document.querySelectorAll('iframe'))try{if(!installed.has(f)){installed.add(f);f.addEventListener('load',mount);}capture(f.contentWindow.NPAchievements);const w=f.contentWindow;if(w.NPVideo&&!installed.has(w.NPVideo)&&typeof w.NPVideo.settle==='function'){const v=w.NPVideo,original=v.settle;installed.add(v);v.settle=function(p,win){const r=original.apply(this,arguments);if(win&&p.grid?.every((x,i)=>x===p.solution?.[i])){module??=import(new URL('data.mjs',base));module.then(m=>m.addClear({game:'sudoku',valid:true,puzzle:p,elapsed:(p.elapsed||0)*1000,hints:p.video?.hints??null,errors:p.video?.errors??null,auto:!!p.video?.auto,revealed:!!p.video?.revealed})).catch(()=>{});}return r;};}}catch{}
}
const style=document.createElement('style');style.textContent='.np-gallery-entry{display:inline-flex;align-items:center;justify-content:center;padding:.65em .9em;border:1px solid #b8aa8e;border-radius:10px;color:inherit;text-decoration:none;font-weight:700;background:var(--theme-surface,var(--surface,#fffaf0));min-height:42px}.np-home-ready .home-bottom-links .np-gallery-entry{flex:1;min-width:0;min-height:44px;padding:5px 4px;font-size:max(13px,var(--ui-min-font,0px));line-height:1.35;text-align:center}.np-gallery-entry:focus-visible{outline:3px solid #477b69;outline-offset:3px}';document.head.append(style);
new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});setInterval(mount,1500);mount();
})();
