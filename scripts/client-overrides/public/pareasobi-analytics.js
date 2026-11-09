/* Pareasobi first-party aggregate analytics. No IP, referrer, account, or entered content is sent. */
(()=>{'use strict';
const ORIGIN='https://atugari.github.io',API='https://puzzle-api.puzzle-hub-4826.workers.dev/api/pareasobi/event';
if(location.origin!==ORIGIN||window.top!==window||navigator.doNotTrack==='1'||window.doNotTrack==='1'||navigator.globalPrivacyControl===true||new URLSearchParams(location.search).has('analytics-preview'))return;
const labels={
 '/plaza.html':'plaza','/':'maru','/index.html':'maru','/dungeon.html':'tobe','/speed.html':'speed',
 '/kuroshiro/':'kuroshiro','/maze/':'maze','/move-moove-mooove.html':'move','/combination-blocks.html':'combination',
 '/narabe100.html':'narabe100','/echo-dive.html':'echo','/shopping-memo.html':'memo','/timer-gauge.html':'timer','/skins.html':'skins'
};
function gameFor(path){
 if(labels[path])return labels[path];
 if(path.startsWith('/nanpure/'))return'nanpure';
 const m=path.match(/^\/puzzles\/(shirupure|wado|crossword|cross|tenbin|paths|studio|workshop|magic-square)\//);return m?m[1]:'other';
}
const game=gameFor(location.pathname),page=location.pathname.slice(0,180)||'/',day=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
function random(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')}
function id(storage,key){try{let v=storage.getItem(key);if(!/^[a-f0-9]{64}$/.test(v||'')){v=random();storage.setItem(key,v)}return v}catch{return random()}}
let visitor,session;try{const d=day();visitor=id(localStorage,'pare-analytics-visitor-v1');session=id(sessionStorage,'pare-analytics-session-'+d)}catch{visitor=random();session=random()}
function emit(event,screen='home',eventId=random()){
 if(!['page_view','screen_view','game_start','game_complete','game_abandon','ad_impression'].includes(event))return;
 const payload={visitor,session,eventId,game,page,screen:String(screen||'home').slice(0,48),event};
 try{fetch(API,{method:'POST',mode:'cors',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{})}catch{}
}
let currentScreen='',started=false,lastStartAt=0;
function screen(name){name=String(name||'home').slice(0,48);if(name===currentScreen)return;currentScreen=name;emit('screen_view',name);if(/^(result|complete|clear|finish|finished|ending)$/i.test(name))complete();else if(['play','game','tutorial'].includes(name))start();else if(started)abandon()}
emit('page_view','document');screen(document.body?.dataset?.screen||'home');
function start(){const now=Date.now();if(now-lastStartAt<2500)return;lastStartAt=now;started=true;emit('game_start',currentScreen||'play')}
function complete(){emit('game_complete',currentScreen||'result')}
function abandon(){if(started){emit('game_abandon',currentScreen||'play');started=false}}
window.addEventListener('pare:analytics',e=>{const d=e.detail||{};if(d.event==='game_start')start();else if(d.event==='game_complete')complete();else if(d.event==='game_abandon')abandon();else if(d.event==='screen_view')screen(d.screen)});
document.addEventListener('click',e=>{
 const target=e.target.closest?.('button,a,[data-analytics-event],[data-analytics-start],[data-analytics-screen]');if(!target)return;
 if(target.dataset.analyticsEvent==='game_complete')complete();else if(target.hasAttribute('data-analytics-start'))start();else if(target.dataset.analyticsScreen)screen(target.dataset.analyticsScreen);else if(game!=='plaza'&&/(で遊ぶ|に挑戦|開始|スタート|プレイする|始める)/.test((target.textContent||'').trim()))start();
},true);
function routeMessage(data){
 if(data.type==='np-notebook-route'){const route=String(data.key||'').split(':').pop()||'home';screen(route);if(['play','game','tutorial'].includes(route))start();else if(started)abandon()}
 else if(data.type==='np-notebook-playing'){if(data.playing)start();else if(started)abandon()}
}
window.addEventListener('message',e=>{if(e.origin===ORIGIN&&e.source!==window)routeMessage(e.data||{})});
window.addEventListener('hashchange',()=>screen(location.hash.slice(1)||'home'));
const adSeen=new WeakSet();
function inspectAds(root=document,view=window){
 const selector='ins.adsbygoogle,[data-ad-slot][data-ad-status],.ad-container[data-ad-status="filled"]';
 const nodes=[...(root.matches?.(selector)?[root]:[]),...(root.querySelectorAll?.(selector)||[])];
 for(const el of nodes){
  const filled=el.getAttribute('data-ad-status')==='filled'||el.dataset.adStatus==='filled';
  if(!filled){adSeen.delete(el);continue;}
  if(adSeen.has(el))continue;
  adSeen.add(el);
  if(!('IntersectionObserver'in view)){emit('ad_impression',el.closest?.('[data-screen]')?.dataset.screen||currentScreen||'home');continue}
  const observer=new view.IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&entry.intersectionRatio>=.5){observer.disconnect();view.setTimeout(()=>{const r=el.getBoundingClientRect(),visible=r.width>0&&r.height>0&&r.bottom>0&&r.top<view.innerHeight;if(visible)emit('ad_impression',el.closest?.('[data-screen]')?.dataset.screen||currentScreen||'home')},1000)}},{threshold:[.5]});
  observer.observe(el);
 }
}
inspectAds();new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')inspectAds(r.target.parentElement||document);for(const n of r.addedNodes)if(n.nodeType===1)inspectAds(n)}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-ad-status']});
new MutationObserver(()=>{const node=document.body?.matches?.('[data-screen]')?document.body:document.querySelector('[data-screen]');if(node?.dataset.screen)screen(node.dataset.screen)}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-screen']});
const shell=document.querySelector('.site-shell');if(shell)new MutationObserver(()=>{const mode=String(shell.className).match(/(?:^|\s)mode-([a-z0-9_-]+)/i)?.[1];if(mode)screen(mode)}).observe(shell,{attributes:true,attributeFilter:['class']});

const watchedFrames=new WeakSet();
function watchFrame(frame){
 const attach=()=>{try{const view=frame.contentWindow,doc=view.document;if(!doc||watchedFrames.has(doc))return;watchedFrames.add(doc);inspectAds(doc,view);new view.MutationObserver(records=>{for(const r of records){if(r.type==='attributes')inspectAds(r.target.parentElement||doc,view);for(const n of r.addedNodes)if(n.nodeType===1)inspectAds(n,view)}}).observe(doc.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-ad-status']})}catch{}};
 frame.addEventListener('load',attach);try{if(frame.contentDocument?.readyState==='complete')attach()}catch{}
 const readScreen=()=>{try{const doc=frame.contentDocument;if(!doc)return;const bodyScreen=doc.body?.dataset?.screen;if(bodyScreen){screen(bodyScreen);return}for(const [id,name] of [['play-setup','setup'],['play-game','play'],['play-library','library']]){const el=doc.getElementById(id);if(el&&!el.hidden){screen(name);return}}const marked=doc.querySelector('[data-screen]');if(marked?.dataset.screen)screen(marked.dataset.screen)}catch{}};
 frame.addEventListener('load',readScreen);const timer=setInterval(()=>{if(!frame.isConnected){clearInterval(timer);return}readScreen()},1500);
}
document.querySelectorAll('iframe').forEach(watchFrame);
new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1){if(n.tagName==='IFRAME')watchFrame(n);n.querySelectorAll?.('iframe').forEach(watchFrame)}}).observe(document.body,{subtree:true,childList:true});
window.PareAnalytics={screen,start,complete,abandon};
})();
