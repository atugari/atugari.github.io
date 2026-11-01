/* A minimum size for interface text. Puzzle digits keep their own size settings. */
(()=>{'use strict';const w=window,key='np-ui-text-v1',values=['auto','0','16','18','20'];if(w.NPUIText)return;let value='auto';
function read(){try{const v=String(JSON.parse(localStorage.getItem(key)||'null'));return values.includes(v)?v:'auto'}catch{return 'auto'}}
function apply(next){if(!values.includes(next))return false;value=next;document.documentElement.dataset.uiMin=next;w.dispatchEvent(new Event('np-ui-text-change'));requestAnimationFrame(()=>w.dispatchEvent(new Event('resize')));for(const frame of document.querySelectorAll('iframe.notebook')){try{frame.contentWindow.NPUIText?.apply(next)}catch{}}return true}
function set(next){next=String(next);if(!values.includes(next))return false;try{if(parent!==w&&parent.NPUIText)return parent.NPUIText.set(next)}catch{}try{localStorage.setItem(key,JSON.stringify(next))}catch{}return apply(next)}
w.NPUIText={get:()=>value,set,apply};let initial=read();try{if(parent!==w&&parent.NPUIText)initial=parent.NPUIText.get()}catch{}apply(initial);w.addEventListener('storage',e=>{if(e.key===key||e.key===null)apply(read())});
})();
