// Local-only recording. A replay is uploaded only by an explicit Publish click.
(function(w){'use strict';if(w.NPReplayRecorder)return;
const script=document.currentScript,base=new URL('./',script.src);let storage,active=null,timer=0,pending=null,restoring=Promise.resolve(),installed=new WeakSet();
const load=()=>storage??=import(new URL('journal.mjs',base));
const key=p=>String(p.uid||p.id||'')+'|'+p.kind+'|'+p.n+'|'+(p.video?.startedAt||p.started||0)+'|'+p.puzzle?.join(',');
function persist(){clearTimeout(timer);if(!active)return;const run=structuredClone(active);pending=load().then(m=>m.putRun(run)).catch(()=>{w.dispatchEvent(new CustomEvent('np-replay-error',{detail:'リプレイを端末に保存できませんでした。'}));});}
function observe(p){
 if(!p?.puzzle||!p.grid||p.grid.length!==p.puzzle.length)return;
 const k=key(p);if(!active||active.key!==k){
  const id=crypto.randomUUID(),initial=Array.from(p.grid);active={version:1,id,key:k,record:JSON.parse(JSON.stringify(p)),initial,steps:[],annotations:[],partial:initial.some((v,i)=>!p.puzzle[i]&&v),complete:false,truncated:false,updated:Date.now(),last:initial.slice(),origin:w.NPReplayEntryId||null};
  for(const x of ['grid','notes','video','undo','elapsed','completed','recording'])delete active.record[x];
  const candidate=active;restoring=load().then(m=>m.findRun(k,candidate.id)).then(old=>{if(!old||active!==candidate)return;const bridge=[],at=Math.max(old.steps.at(-1)?.at||0,candidate.steps[0]?.at||0);for(let i=0;i<candidate.initial.length;i++)if(!p.puzzle[i]&&old.last?.[i]!==candidate.initial[i])bridge.push({at,i,v:candidate.initial[i]});candidate.id=old.id;candidate.initial=old.initial;candidate.partial=old.partial;candidate.annotations=old.annotations||[];candidate.steps=[...old.steps,...bridge,...candidate.steps.map(s=>({...s,at:Math.max(at,s.at)}))];if(candidate.steps.length>16000)candidate.truncated=true;if(candidate.complete)persist();}).catch(()=>{});
 }
 if(active.complete)return;if(p.solution)active.record.solution=Array.from(p.solution);
 const at=Math.max(active.steps.at(-1)?.at||0,Math.round((Number(p.elapsed)||0)*1000));
 let changed=false;for(let i=0;i<p.grid.length;i++)if(!p.puzzle[i]&&p.grid[i]!==active.last[i]){if(active.steps.length>=16000){active.truncated=true;break;}active.steps.push({at,i,v:p.grid[i]});changed=true;}
 active.last=Array.from(p.grid);active.updated=Date.now();active.elapsed=at;
 active.complete=!!p.completed&&!!p.solution&&p.grid.every((v,i)=>v===p.solution[i])&&!p.video?.auto&&!p.video?.revealed&&!p.titleRevealed;
 if(active.complete){persist();w.dispatchEvent(new CustomEvent('np-replay-complete',{detail:{id:active.id,entry:active.origin}}));try{if(parent!==w)parent.postMessage({type:'np-replay-complete',id:active.id,entry:active.origin},location.origin)}catch{}}
 else if(changed){clearTimeout(timer);timer=setTimeout(persist,600);}
}
function install(){const v=w.NPVideo;if(!v||installed.has(v))return;installed.add(v);
 for(const name of ['state','move','settle'])if(typeof v[name]==='function'){const fn=v[name];v[name]=function(p,...args){if(name==='move'&&p?.grid&&!active){const before={...p,grid:Array.from(p.grid)};if(Number.isInteger(args[0])&&!args[3])before.grid[args[0]]=args[2]||0;observe(before);}const result=fn.call(this,p,...args);queueMicrotask(()=>observe(p));return result;};}
 if(typeof v.reset==='function'){const fn=v.reset;v.reset=function(...args){active=null;const out=fn.apply(this,args);queueMicrotask(()=>observe(args[0]));return out;};}
}
w.NPReplayRecorder={observe,flush:async()=>{await restoring;persist();return pending},current:()=>active?.id||null};
install();new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});w.addEventListener('pagehide',persist);
})(window);
