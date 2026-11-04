/* Shared presentation preference. Puzzle data and the Shirupure document are untouched. */
(()=>{'use strict';const w=window,key='np-site-theme-v1',colors={notebook:'#f4efe3',color:'#fffdf8',lounge:'#0c1c31','contrast-light':'#f2f5f8','contrast-dark':'#121821'},allowed=Object.keys(colors);if(w.NPSiteTheme)return;let theme='notebook',error='';
function read(){try{const saved=JSON.parse(localStorage.getItem(key)||'null');return allowed.includes(saved?.theme)?saved.theme:'notebook'}catch{return 'notebook'}}
function apply(next){if(!allowed.includes(next))return false;theme=next;document.documentElement.dataset.siteTheme=next;document.documentElement.style.colorScheme=next==='lounge'||next==='contrast-dark'?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[next]);w.dispatchEvent(new Event('np-theme-change'));requestAnimationFrame(()=>w.dispatchEvent(new Event('resize')));for(const frame of document.querySelectorAll('iframe.notebook')){try{frame.contentWindow.NPSiteTheme?.apply(next)}catch{}}return true}
function set(next){if(!allowed.includes(next))return false;try{if(parent!==w&&parent.NPSiteTheme)return parent.NPSiteTheme.set(next)}catch{}error='';try{localStorage.setItem(key,JSON.stringify({theme:next}))}catch{error='デザインを保存できませんでした。この画面では切り替えられます。'}return apply(next)}
const script=document.currentScript?.src;
if(script){const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('themes/accessible.css',script).href;document.head.append(css)}
w.NPSiteTheme={get:()=>theme,set,apply,status:()=>error};let initial=read();try{if(parent!==w&&parent.NPSiteTheme)initial=parent.NPSiteTheme.get()}catch{}apply(initial);w.addEventListener('storage',e=>{if(e.key===key||e.key===null)apply(read())});
})();


(()=>{const base=document.currentScript?.src;if(!base||window.NPSiteLayout)return;const s=document.createElement("script");s.src=new URL("site-layout.js",base).href;document.head.append(s)})();
