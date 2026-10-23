/* Aggregate visits only. No page content, account, IP or referrer is sent. */
(function(){
 'use strict';
 if(location.origin!=='https://atugari.github.io'||window.top!==window||new URLSearchParams(location.search).get('view')==='manage'||navigator.doNotTrack==='1'||window.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
 const endpoint='https://puzzle-api.puzzle-hub-4826.workers.dev/api/visits';
 const browserKey='np-visit-day-v1',sessionKey='np-visit-session-v1';
 let pending=false,completed='';
 function random(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')}
 function day(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10)}
 function read(storage,key,today){try{const saved=JSON.parse(storage.getItem(key)||'null');return saved?.day===today&&/^[a-f0-9]{64}$/.test(saved.id)?saved:null}catch{return null}}
 async function report(){
  const today=day();if(document.hidden||pending||completed===today)return;
  let visitor,session;
  try{
   visitor=read(localStorage,browserKey,today)||{day:today,id:random()};
   session=read(sessionStorage,sessionKey,today)||{day:today,id:random(),sent:false};
   localStorage.setItem(browserKey,JSON.stringify(visitor));sessionStorage.setItem(sessionKey,JSON.stringify(session));
   if(session.sent){completed=today;return}
  }catch{return}
  pending=true;
  try{const response=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor:visitor.id,session:session.id}),keepalive:true,signal:AbortSignal.timeout(8000)});
   if(response.ok){completed=today;session.sent=true;try{sessionStorage.setItem(sessionKey,JSON.stringify(session))}catch{}}
  }catch{/* Statistics must never interrupt play. */}finally{pending=false}
 }
 if(document.readyState==='complete')void report();else window.addEventListener('load',()=>void report(),{once:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void report()});
})();
