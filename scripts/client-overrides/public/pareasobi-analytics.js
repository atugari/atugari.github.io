/* Pareasobi first-party aggregate analytics. No IP, referrer, account, or entered content is sent. */
(()=>{'use strict';
const ORIGIN='https://atugari.github.io',API='https://puzzle-api.puzzle-hub-4826.workers.dev/api/pareasobi/event';
if(location.origin!==ORIGIN||window.top!==window||navigator.doNotTrack==='1'||window.doNotTrack==='1'||navigator.globalPrivacyControl===true||new URLSearchParams(location.search).has('analytics-preview'))return;
const labels={
 '/plaza.html':'plaza','/':'maru','/index.html':'maru','/dungeon.html':'tobe','/speed.html':'speed',
 '/kuroshiro/':'kuroshiro','/maze/':'maze','/move-moove-mooove.html':'move','/combination-blocks.html':'other',
 '/narabe100.html':'other','/echo-dive.html':'other','/shopping-memo.html':'memo','/timer-gauge.html':'timer','/skins.html':'skins'
};
function gameFor(path){
 if(labels[path])return labels[path];
 if(path.startsWith('/nanpure/'))return'nanpure';
 const m=path.match(/^\/puzzles\/(shirupure|wado|crossword|cross|tenbin|paths|studio|workshop)\//);return m?m[1]:'other';
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
let currentScreen='',started=false;
function screen(name){name=String(name||'home').slice(0,48);if(name===currentScreen)return;currentScreen=name;emit('screen_view',name)}
emit('page_view','document');screen(document.body?.dataset?.screen||'home');
function start(){if(started)return;started=true;emit('game_start',currentScreen||'play')}
function complete(){emit('game_complete',currentScreen||'result')}
function abandon(){if(started){emit('game_abandon',currentScreen||'play');started=false}}
window.addEventListener('pare:analytics',e=>{const d=e.detail||{};if(d.event==='game_start')start();else if(d.event==='game_complete')complete();else if(d.event==='game_abandon')abandon();else if(d.event==='screen_view')screen(d.screen)});
document.addEventListener('click',e=>{
 const target=e.target.closest?.('button,a,[data-analytics-event],[data-analytics-start],[data-analytics-screen]');if(!target)return;
 if(target.dataset.analyticsEvent==='game_complete')complete();else if(target.hasAttribute('data-analytics-start'))start();else if(target.dataset.analyticsScreen)screen(target.dataset.analyticsScreen);else if(game!=='plaza'&&/^(開始|スタート|遊ぶ|挑戦する|プレイ開始|新しい問題で遊ぶ)/.test((target.textContent||'').trim()))start();
},true);
function routeMessage(data){
 if(data.type==='np-notebook-route'){const route=String(data.key||'').split(':').pop()||'home';screen(route);if(['play','game','tutorial'].includes(route))start();else if(started)abandon()}
 else if(data.type==='np-notebook-playing'){if(data.playing)start();else if(started)abandon()}
}
window.addEventListener('message',e=>{if(e.origin===ORIGIN&&e.source!==window)routeMessage(e.data||{})});
window.addEventListener('hashchange',()=>screen(location.hash.slice(1)||'home'));
const adSeen=new WeakSet();
function inspectAds(root=document){
 const selector='ins.adsbygoogle,[data-ad-slot][data-ad-status],.ad-container[data-ad-status="filled"]';
 const nodes=[...(root.matches?.(selector)?[root]:[]),...(root.querySelectorAll?.(selector)||[])];
 for(const el of nodes){if(adSeen.has(el))continue;
  const filled=el.getAttribute('data-ad-status')==='filled'||el.dataset.adStatus==='filled';
  if(!filled)continue;
  adSeen.add(el);
  if(!('IntersectionObserver'in window)){emit('ad_impression',currentScreen||'home');continue}
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&entry.intersectionRatio>=.5){observer.disconnect();setTimeout(()=>{const r=el.getBoundingClientRect(),visible=r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;if(visible)emit('ad_impression',currentScreen||'home')},1000)}},{threshold:[.5]});
  observer.observe(el);
 }
}
inspectAds();new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')inspectAds(r.target.parentElement||document);for(const n of r.addedNodes)if(n.nodeType===1)inspectAds(n)}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-ad-status']});
new MutationObserver(()=>{const node=document.body?.matches?.('[data-screen]')?document.body:document.querySelector('[data-screen]');if(node?.dataset.screen)screen(node.dataset.screen)}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-screen']});
window.PareAnalytics={screen,start,complete,abandon};
})();
