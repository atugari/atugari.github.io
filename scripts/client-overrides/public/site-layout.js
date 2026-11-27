/* Layout is a shared preference, independent of puzzle data and board zoom. */
(()=>{'use strict';const w=window,key='np-site-layout-v1',asset=new URL('./',document.currentScript.src);if(w.NPSiteLayout)return;let mode='auto',error='';
const t=s=>w.NPI18n?.t(s)||s;
function read(){try{const raw=localStorage.getItem(key);return raw==='pc'||JSON.parse(raw||'null')?.mode==='pc'?'pc':'auto'}catch{return 'auto'}}
function apply(value){mode=value==='pc'?'pc':'auto';document.documentElement.dataset.layoutMode=mode;for(const s of document.querySelectorAll('[data-site-layout-select]'))s.value=mode;for(const note of document.querySelectorAll('[data-layout-note]'))note.hidden=mode!=='pc'||innerWidth>=500;for(const f of document.querySelectorAll('iframe.notebook'))try{f.contentWindow.NPSiteLayout?.apply(mode)}catch{}w.dispatchEvent(new Event('np-layout-change'));w.dispatchEvent(new Event('resize'));return mode}
function set(value){try{if(parent!==w&&parent.NPSiteLayout)return parent.NPSiteLayout.set(value)}catch{}error='';try{localStorage.setItem(key,JSON.stringify({mode:value==='pc'?'pc':'auto'}))}catch{error=t('表示方法を保存できませんでした。この画面では切り替えられます。')}apply(value)}
function control(){const label=document.createElement('label');label.className='np-site-layout-control';const span=document.createElement('span');span.textContent=t('表示');const select=document.createElement('select');select.dataset.siteLayoutSelect='';select.setAttribute('aria-label',t('画面の表示方法'));for(const [value,text]of [['auto','自動'],['pc','PC表示']]){const option=document.createElement('option');option.value=value;option.textContent=t(text);select.append(option)}select.value=mode;select.onchange=()=>{set(select.value);label.title=error};label.append(span,select);return label}
function mount(){
 const header=document.querySelector('.site-shell>.header .header-actions'),existing=header?.querySelector('.np-site-layout-control');
 if(header?.closest('.mode-home'))existing?.remove();else if(header&&!existing)header.prepend(control());
 const preferences=document.querySelector('.play-settings .menu-language');
 if(preferences&&!preferences.nextElementSibling?.classList.contains('np-site-layout-setting')){
  const row=document.createElement('div');row.className='np-site-layout-setting';row.append(control());
  const note=document.createElement('small');note.dataset.layoutNote='';note.textContent=t('横向きにすると、PC表示で広く使えます。');
  note.hidden=mode!=='pc'||innerWidth>=500;row.append(note);preferences.after(row);
 }
 for(const f of document.querySelectorAll('iframe.notebook'))if(!f.dataset.layoutWatched){f.dataset.layoutWatched='';f.addEventListener('load',()=>{try{f.contentWindow.NPSiteLayout?.apply(mode)}catch{}})}}
w.NPSiteLayout={get:()=>mode,set,apply,status:()=>error};let initial=read();try{if(parent!==w&&parent.NPSiteLayout)initial=parent.NPSiteLayout.get()}catch{}apply(initial);
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('site-layout.css',asset).href;document.head.append(css);
let queued=false;const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;mount()})}};new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});w.addEventListener('np-language-change',()=>{document.querySelectorAll('.np-site-layout-control').forEach(n=>n.replaceWith(control()))});w.addEventListener('storage',e=>{if(e.key===key||e.key===null)apply(read())});w.addEventListener('resize',()=>{for(const note of document.querySelectorAll('[data-layout-note]'))note.hidden=mode!=='pc'||innerWidth>=500});mount();
})();
/* Shell chrome: keep only the back button while a multi puzzle is arranged,
   and return to an interrupted multi creation after a browser reload. */
(()=>{'use strict';if(window!==window.parent)return;const w=window;
let wantMinimal=false;
const guardMinimal=()=>{const el=document.querySelector('.site-shell');if(!el)return;const f=document.querySelector('iframe.notebook');const vis=!!(f&&f.getClientRects().length);const home=el.classList.contains('mode-home');if(wantMinimal&&vis&&!home){if(!el.classList.contains('np-minimal'))el.classList.add('np-minimal')}else if(!f||(home&&Date.now()-armedAt>2500)){el.classList.remove('np-minimal')}};
const healMinimal=guardMinimal;
w.addEventListener('message',e=>{if(e.origin!==location.origin)return;const d=e.data;if(d&&d.type==='np-chrome-minimal'){wantMinimal=!!d.minimal;if(wantMinimal)healMinimal();else{const el=document.querySelector('.site-shell');if(el)el.classList.remove('np-minimal')}}});
let armedAt=0;w.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('.main-choice')){wantMinimal=true;armedAt=Date.now();const el=document.querySelector('.site-shell');if(el)el.classList.add('np-minimal')}},true);
const shellObs=new MutationObserver(()=>{if(!wantMinimal)return;const el=document.querySelector('.site-shell');if(!el||el.classList.contains('np-minimal')||el.classList.contains('mode-home'))return;const f=document.querySelector('iframe.notebook');if(f&&f.getClientRects().length)el.classList.add('np-minimal')});const watchShell=()=>{const el=document.querySelector('.site-shell');if(el)shellObs.observe(el,{attributes:true,attributeFilter:['class']})};watchShell();
w.addEventListener('pageshow',healMinimal);setInterval(()=>{watchShell();healMinimal()},500);
try{const nav=performance.getEntriesByType('navigation')[0],at=Number(localStorage.getItem('nanpure-resume-multi-v1')||0);
if(nav&&nav.type==='reload'&&at&&Date.now()-at<86400000){const t0=Date.now();const iv=setInterval(()=>{const b=document.querySelector('.main-choice');if(b){clearInterval(iv);b.click()}else if(Date.now()-t0>10000)clearInterval(iv)},300)}else if(at&&Date.now()-at>=86400000)localStorage.removeItem('nanpure-resume-multi-v1')}catch{}})();
