/* Race the existing local generator with checked results from the owner's lab. */
(function(root){
  'use strict';
  const endpoint='https://puzzle-api.puzzle-hub-4826.workers.dev/api/generation';
  const timings=[];
  const key=()=>Array.from(root.crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  function createWorker(url){
    let local=null,run=0,active=null,closed=false;
    const client=key(),out={onmessage:null,onerror:null};
    const emit=data=>out.onmessage?.({data});
    function valid(task){return !closed&&active===task&&!task.done;}
    function schedule(task,step,delay){
      if(!valid(task))return;
      clearTimeout(task.timer);
      task.timer=setTimeout(()=>{task.timer=null;step(task);},delay);
    }
    function backoff(attempt,error){
      return error?.status===429?Math.max(30000,error.retryAfterMs||0):Math.min(15000,1000*2**Math.min(attempt,4));
    }
    function discard(task){
      if(task.cleanup)return task.cleanup;
      const id=task.id;task.id=null;task.expires=0;
      if(!id)return Promise.resolve();
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
      const cleanup=Promise.resolve().then(()=>root.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Nanpure-Key':client},body:JSON.stringify({action:'cancel',id}),signal:controller.signal,keepalive:true})).catch(()=>{}).finally(()=>{
        clearTimeout(timer);if(task.cleanup===cleanup)task.cleanup=null;
      });
      task.cleanup=cleanup;return cleanup;
    }
    function cancel(task){
      if(!task)return Promise.resolve();
      clearTimeout(task.timer);task.timer=null;task.controller?.abort();
      return discard(task);
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
        if(!r.ok)throw Object.assign(Error('unavailable'),{status:r.status,retryAfterMs:Math.min(60000,Math.max(0,Number(r.headers?.get('Retry-After'))||0)*1000)});
        return await r.json();
      }finally{clearTimeout(timer);if(task.controller===control)task.controller=null;}
    }
    async function restart(task,delay){
      await discard(task);
      schedule(task,assist,delay);
    }
    async function poll(task){
      if(!valid(task))return;
      if(Date.now()>=task.expires){await restart(task,350);return;}
      try{
        const answer=await call(endpoint+'?id='+encodeURIComponent(task.id),null,task);
        if(!valid(task))return;
        if(answer.state==='done'){
          try{
            root.NP.validate(answer.p);
            if(!root.NPGenerationMatches(answer.p,task.cfg))throw Error('conditions');
          }catch{await restart(task,backoff(task.failures++));return;}
          finish(task,answer.p,'assisted');return;
        }
        if(answer.state!=='pending'){await restart(task,1000);return;}
        task.pollFailures=0;
        schedule(task,poll,Math.min(1000,Math.max(0,task.expires-Date.now())));
      }catch(error){
        if(!valid(task))return;
        if([404,409,410].includes(error.status)){await restart(task,1000);return;}
        schedule(task,poll,Math.min(backoff(task.pollFailures++,error),Math.max(0,task.expires-Date.now())));
      }
    }
    async function assist(task){
      if(!valid(task))return;
      try{
        await task.previousCleanup;
        if(!valid(task))return;
        const received=await call(endpoint,{action:'create',kind:'normal',n:9,level:task.cfg.level},task);
        if(!received.available){schedule(task,assist,backoff(task.failures++));return;}
        if(!/^[a-f0-9]{64}$/.test(received.id||''))throw Error('invalid request');
        task.id=received.id;
        if(!valid(task)){cancel(task);return;}
        task.expires=Math.min(Number(received.expires)||0,Date.now()+45000);
        if(task.expires<=Date.now()){await restart(task,1000);return;}
        task.failures=0;task.pollFailures=0;
        schedule(task,poll,Math.min(500,task.expires-Date.now()));
      }catch(error){if(valid(task))await restart(task,backoff(task.failures++,error));}
    }
    out.postMessage=function(cfg){
      if(closed)return;
      const previousCleanup=cancel(active);
      const task=active={run:++run,started:root.performance.now(),done:false,cfg:Object.assign({},cfg),failures:0,pollFailures:0,previousCleanup};
      if(!local){
        local=new root.Worker(url);const instance=local;
        local.onmessage=e=>{if(local!==instance)return;const t=active;if(!t||t.done||closed)return;if(e.data?.p)finish(t,e.data.p,'local');else emit(e.data);};
        local.onerror=e=>{if(!closed&&local===instance&&!active?.done)out.onerror?.(e);};
      }
      local.postMessage(cfg);
      if(cfg.kind==='normal'&&cfg.n===9&&Number.isInteger(cfg.level)&&cfg.level>=4&&cfg.level<=18&&!cfg.linkedShape)
        schedule(task,assist,350);
    };
    out.terminate=function(){closed=true;run++;cancel(active);active=null;local?.terminate();local=null;};
    return out;
  }
  root.NPGenerationAssist={createWorker,getTimings:()=>timings.map(t=>Object.assign({},t))};
})(window);
