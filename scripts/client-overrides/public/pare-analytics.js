/* PareAsobi aggregate analytics. Daily rotating pseudonyms only; no IP, URL or referrer. */
(()=>{'use strict';
 const origin='https://atugari.github.io';
 if(location.origin!==origin||window.top!==window||navigator.doNotTrack==='1'||window.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
 const endpoint='https://puzzle-api.puzzle-hub-4826.workers.dev/api/pare/analytics';
 const day=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const read=(storage,key,today)=>{try{const x=JSON.parse(storage.getItem(key)||'null');return x?.day===today&&/^[a-f0-9]{64}$/.test(x.id)?x:null}catch{return null}};
 let visitor,session;
 try{const d=day();visitor=read(localStorage,'pare-analytics-visitor',d)||{day:d,id:random()};session=read(sessionStorage,'pare-analytics-session',d)||{day:d,id:random()};localStorage.setItem('pare-analytics-visitor',JSON.stringify(visitor));sessionStorage.setItem('pare-analytics-session',JSON.stringify(session));}catch{return}
 const map={'/':'home','/plaza.html':'pareasobi','/nanpure/':'nanpure','/puzzles/wado/':'wado','/puzzles/shirupure/':'shirupure','/puzzles/crossword/':'crossword','/puzzles/cross/':'cross','/puzzles/tenbin/':'tenbin','/puzzles/paths/':'paths','/puzzles/studio/':'studio','/puzzles/workshop/':'workshop','/puzzles/magic-square/':'magic-square','/puzzles/':'puzzles'};
 function gameId(){const declared=document.body?.dataset?.game;if(declared)return String(declared).toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||'unknown';return map[location.pathname]||location.pathname.split('/').filter(Boolean).pop()?.replace(/[^a-z0-9_-]/gi,'-').toLowerCase().slice(0,40)||'site'}
 const game=gameId();
 function send(event,screen='main'){
  if(!/^(page_view|game_access|game_start|game_complete|screen_view|ad_impression|ad_click)$/.test(event))return;
  screen=String(screen||'main').toLowerCase().replace(/[^a-z0-9_-]/g,'-').slice(0,48)||'main';
  const payload=JSON.stringify({visitor:visitor.id,session:session.id,game,screen,event});
  try{fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,signal:AbortSignal.timeout(5000)}).catch(()=>{})}catch{}
 }
 const api=window.PareAnalytics={screen:(name)=>send('screen_view',name),start:()=>send('game_start',document.body?.dataset?.screen||'play'),complete:()=>send('game_complete',document.body?.dataset?.screen||'result'),adImpression:(slot,screen)=>send('ad_impression',screen||slot||'unknown'),adClick:(slot,screen)=>send('ad_click',screen||slot||'unknown'),event:send};
 send('page_view',document.body?.dataset?.screen||'entry');
 if(!['site','pareasobi','plaza','home','puzzles'].includes(game))send('game_access','entry');
 document.addEventListener('pare-game-start',()=>api.start());
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-action="start"],[data-start-game],#btn-start,#btn-murige,#start-btn,.launch,[onclick*="startGame"],[onclick*="startChallenge"]'))api.start();if(e.target.closest?.('[data-action="complete"],[data-game-complete]'))api.complete();},true);
 document.addEventListener('pare-game-complete',()=>api.complete());
 document.addEventListener('pare-screen-change',e=>api.screen(e.detail?.screen||'unknown'));
 let lastScreen=document.body?.dataset?.screen||'';
 if(document.body)new MutationObserver(()=>{const next=document.body.dataset.screen||'';if(next&&next!==lastScreen){lastScreen=next;api.screen(next)}}).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
 let routePlaying=false;
 window.addEventListener('message',e=>{if(e.origin!==origin)return;const d=e.data;if(d?.type!=='np-notebook-route'||typeof d.key!=='string')return;const route=d.key.split(':').pop();api.screen(route);const playing=['play','game','tutorial'].includes(route);if(playing&&!routePlaying)api.start();routePlaying=playing;});
})();