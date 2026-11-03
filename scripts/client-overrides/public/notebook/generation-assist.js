/* Race the existing local generator with checked results from the owner's lab. */
(function(root){
  'use strict';
  const endpoint='https://puzzle-api.puzzle-hub-4826.workers.dev/api/generation';
  let unavailableUntil=0;const timings=[];
  const key=()=>Array.from(root.crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  function createWorker(url){
    let local=null,run=0,active=null,closed=false;
    const client=key(),out={onmessage:null,onerror:null};
    const emit=data=>out.onmessage?.({data});
    function cancel(task){
      if(!task)return;
      clearTimeout(task.timer);task.controller?.abort();
      if(task.id)root.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Nanpure-Key':client},body:JSON.stringify({action:'cancel',id:task.id}),keepalive:true}).catch(()=>{});
    }
    function finish(task,p,source){
      if(closed||active!==task||task.done)return;
      task.done=true;cancel(task);
      if(source==='assisted'){local?.terminate();local=null;}
      const elapsedMs=Math.round(root.performance.now()-task.started);
      timings.push({source,elapsedMs});if(timings.length>30)timings.shift();
      root.dispatchEvent?.(new CustomEvent('nanpure-generation-timing',{detail:{source,elapsedMs}}));
      emit({p});
    }
    async function call(path,data,task){
      const control=new AbortController();task.controller=control;
      const timer=setTimeout(()=>control.abort(),3500);
      try{
        const r=await root.fetch(path,{method:data?'POST':'GET',headers:{'X-Nanpure-Key':client,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:control.signal,cache:'no-store'});
        if(!r.ok)throw Error('unavailable');return await r.json();
      }finally{clearTimeout(timer);if(task.controller===control)task.controller=null;}
    }
    function valid(task){return !closed&&active===task&&!task.done;}
    async function assist(task,cfg){
      if(!valid(task))return;
      try{
        const received=await call(endpoint,{action:'create',kind:'normal',n:9,level:cfg.level},task);
        if(!received.available){unavailableUntil=Date.now()+30000;return;}
        task.id=received.id;
        if(!valid(task)){cancel(task);return;}
        const expires=Math.min(Number(received.expires)||0,Date.now()+45000);
        const poll=async()=>{
          if(!valid(task)||Date.now()>=expires){cancel(task);return;}
          try{
            const answer=await call(endpoint+'?id='+encodeURIComponent(task.id),null,task);
            if(!valid(task))return;
            if(answer.state==='done'){
              root.NP.validate(answer.p);
              if(!root.NPGenerationMatches(answer.p,cfg))throw Error('conditions');
              finish(task,answer.p,'assisted');return;
            }
            if(answer.state!=='pending')return;
            task.timer=setTimeout(poll,1000);
          }catch{cancel(task);}
        };
        task.timer=setTimeout(poll,500);
      }catch{if(valid(task))unavailableUntil=Date.now()+30000;}
    }
    out.postMessage=function(cfg){
      if(closed)return;
      cancel(active);
      const task=active={run:++run,started:root.performance.now(),done:false};
      if(!local){
        local=new root.Worker(url);const instance=local;
        local.onmessage=e=>{if(local!==instance)return;const t=active;if(!t||t.done||closed)return;if(e.data?.p)finish(t,e.data.p,'local');else emit(e.data);};
        local.onerror=e=>{if(!closed&&local===instance&&!active?.done)out.onerror?.(e);};
      }
      local.postMessage(cfg);
      if(cfg.kind==='normal'&&cfg.n===9&&Number.isInteger(cfg.level)&&cfg.level>=4&&cfg.level<=18&&!cfg.linkedShape&&Date.now()>=unavailableUntil)
        task.timer=setTimeout(()=>assist(task,Object.assign({},cfg)),350);
    };
    out.terminate=function(){closed=true;run++;cancel(active);active=null;local?.terminate();local=null;};
    return out;
  }
  root.NPGenerationAssist={createWorker,getTimings:()=>timings.map(t=>Object.assign({},t))};
})(window);
