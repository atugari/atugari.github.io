/* Independent, checkpointed pattern jobs. Navigation and editing never cancel a job. */
(function(root){
 'use strict';
 function create({model,engine,storage,Worker,Blob,URL,setTimeout,clearTimeout,now=Date.now,concurrency=2}){
  const key='nanpure-pattern-jobs-v1',jobs=[],slots=[],listeners=new Set();let cursor=0,sequence=0,checkpoint=null,storageError=false,notification=null,lastNotified=0;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const snapshot=job=>copy(Object.fromEntries(Object.entries(job).filter(([k])=>!['inflight','token'].includes(k))));
  const find=id=>jobs.find(j=>j.id===id);
  function persist(){
   if(checkpoint)clearTimeout(checkpoint);checkpoint=null;
   try{storage?.setItem(key,JSON.stringify({version:1,sequence,jobs:jobs.map(snapshot)}));storageError=false;}catch(_){storageError=true;}
  }
  function emit(immediate=false){
   if(immediate)persist();else if(!checkpoint)checkpoint=setTimeout(persist,1000);
   const notify=()=>{notification=null;lastNotified=now();for(const listener of listeners)try{listener();}catch(_){}};
   if(immediate||now()-lastNotified>=250){if(notification)clearTimeout(notification);notify();}
   else if(!notification)notification=setTimeout(notify,250);
  }
  const code='var global=self;\n'+engine+'\nself.NPPatternModel=('+model.create.toString()+')();self.onmessage=function(e){try{self.postMessage(NPPatternModel.search(e.data.mask,e.data.omit,{milliseconds:700,maxAttempts:350,offset:e.data.offset,targetLevel:e.data.targetLevel,levelPolicy:e.data.levelPolicy,required:e.data.required,excluded:e.data.excluded,rate:Nanpure.ratePuzzle}));}catch(err){self.postMessage({state:"error"});}};';
  function retire(slot){slot.retired=true;slot.worker?.terminate();const at=slots.indexOf(slot);if(at>=0)slots.splice(at,1);}
  function failure(slot){const job=find(slot.id);if(job&&job.token===slot.token){job.inflight=false;job.state='error';job.updated=now();}retire(slot);emit(true);pump();}
  function makeSlot(){
   let url;const slot={id:null,token:null,worker:null,retired:false};
   try{url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));slot.worker=new Worker(url);URL.revokeObjectURL(url);url=null;}catch(_){if(url)URL.revokeObjectURL(url);return null;}
   slot.worker.onmessage=event=>{
    if(slot.retired)return;const job=find(slot.id),token=slot.token;if(!job||job.token!==token||job.state!=='checking')return;
    const data=event.data;job.inflight=false;slot.id=null;slot.token=null;
    job.attempts+=Math.max(0,Number(data.attempts)||0);job.updated=now();
    if(data.state==='ready'){
     try{
      model.validate(data);
      if(data.mask.some((v,i)=>!!v!==job.mask[i])||data.omittedDigit!==job.omit||!model.matchesRating(data.rating,job.options))throw Error('Job constraints changed');
      job.result=copy(data);job.state='ready';
     }catch(_){job.state='error';}
    }else if(data.state==='unknown')job.state='checking';
    else if(data.state==='impossible'){job.state='impossible';job.reason=copy(data);}
    else job.state='error';
    emit(data.state!=='unknown');pump();
   };
   slot.worker.onerror=event=>{event.preventDefault?.();if(!slot.retired)failure(slot);};slots.push(slot);return slot;
  }
  function pump(){
   if(!engine)return;
   while(jobs.some(j=>['queued','checking'].includes(j.state)&&!j.inflight)){
    let slot=slots.find(s=>!s.id&&!s.retired);if(!slot&&slots.length<concurrency)slot=makeSlot();
    if(!slot){if(!slots.length){for(const job of jobs)if(['queued','checking'].includes(job.state))job.state='error';emit(true);}break;}
    const waiting=jobs.some(j=>j.state==='queued'&&!j.inflight);
    let job=null;for(let n=0;n<jobs.length;n++){const at=(cursor+n)%jobs.length,candidate=jobs[at];if((waiting?candidate.state==='queued':['queued','checking'].includes(candidate.state))&&!candidate.inflight){job=candidate;cursor=(at+1)%jobs.length;break;}}
    if(!job)break;job.state='checking';job.inflight=true;slot.id=job.id;slot.token=job.token;
    try{slot.worker.postMessage({id:job.id,mask:job.mask.slice(),omit:job.omit,...job.options,offset:job.attempts});}catch(_){failure(slot);break;}
   }
  }
  try{
   const stored=JSON.parse(storage?.getItem(key)||'null');if(stored?.version===1&&Array.isArray(stored.jobs)){
    sequence=Number.isSafeInteger(stored.sequence)?stored.sequence:0;
    for(const input of stored.jobs)try{
     if(typeof input.id!=='string'||find(input.id)||!Number.isFinite(input.started)||!Number.isSafeInteger(input.attempts)||input.attempts<0)continue;
     const mask=model.maskOf(input.mask),options=model.optionsOf(input.options);if(model.analyze(mask,input.omit).state==='impossible')continue;
     const job={...input,mask,options,token:0,inflight:false};
     if(['queued','checking'].includes(job.state))job.state='queued';
     else if(job.state==='ready'){
      model.validate(job.result);if(job.result.mask.some((v,i)=>!!v!==mask[i])||job.result.omittedDigit!==job.omit||!model.matchesRating(job.result.rating,options))continue;
     }else if(!['stopped','error','impossible'].includes(job.state))continue;
     jobs.push(job);
    }catch(_){}
   }
  }catch(_){}
  function add(input){
   const mask=model.maskOf(input.mask),omit=input.omit||0,options=model.optionsOf(input.options);
   if(model.analyze(mask,omit).state==='impossible')throw Error('Invalid pattern');
   const number=++sequence,job={id:'pattern-job-'+now().toString(36)+'-'+number,number,mask,omit,options,started:now(),updated:now(),attempts:0,state:'queued',result:null,token:0,inflight:false,savedUid:null};
   jobs.push(job);emit(true);pump();emit();return snapshot(job);
  }
  function stop(id){const job=find(id);if(!job||!['queued','checking'].includes(job.state))return;job.token++;job.state='stopped';job.inflight=false;job.updated=now();for(const slot of [...slots])if(slot.id===id)retire(slot);emit(true);pump();}
  function resume(id){const job=find(id);if(!job||!['stopped','error'].includes(job.state))return;job.token++;job.state='queued';job.updated=now();emit(true);pump();}
  function markSaved(id,uid){const job=find(id);if(job){job.savedUid=uid;emit(true);}}
  function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
  pump();
  return{add,stop,resume,markSaved,subscribe,persist,list:()=>jobs.map(snapshot),get:id=>{const job=find(id);return job?snapshot(job):null;},hasStorageError:()=>storageError};
 }
 root.NPPatternJobsFactory={create};
})(typeof window!=='undefined'?window:globalThis);
