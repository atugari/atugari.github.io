const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('scripts/client-overrides/public/notebook/generation-assist.js','utf8');
function setup(fetch,clock={}){
  const workers=[],events=[];
  class Worker{constructor(){this.terminated=false;workers.push(this);}postMessage(cfg){this.cfg=cfg;}terminate(){this.terminated=true;}}
  const root={Worker,crypto,performance:clock.performance||performance,fetch,NP:{validate(p){if(!p.valid)throw Error('invalid');}},NPGenerationMatches:(p,cfg)=>p.level===cfg.level};
  vm.runInNewContext(source,{window:root,Uint8Array,Date,AbortController,setTimeout,clearTimeout,...clock});
  const w=root.NPGenerationAssist.createWorker('blob:test');w.onmessage=e=>events.push(e.data);
  return {w,workers,events,root};
}
function clocked(fetch){
  let now=1000000,next=0;const timers=new Map();
  class Clock extends Date{static now(){return now;}}
  const environment=setup((...args)=>fetch(...args,now),{Date:Clock,performance:{now:()=>now},setTimeout(fn,ms){const id=++next;timers.set(id,{at:now+ms,fn});return id;},clearTimeout(id){timers.delete(id);}});
  async function advance(ms){
    const end=now+ms;
    for(let n=0;;n++){
      assert(n<1000,'unexpected timer loop');
      const due=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;
      now=due[1].at;timers.delete(due[0]);due[1].fn();
      for(let i=0;i<40;i++)await Promise.resolve();
    }
    now=end;for(let i=0;i<40;i++)await Promise.resolve();
  }
  return {...environment,advance};
}
const cfg={kind:'normal',n:9,level:4},pause=ms=>new Promise(r=>setTimeout(r,ms));
test('immediate local result has no relay wait or network request',async()=>{
  let requests=0;const {w,workers,events}=setup(async()=>{requests++;throw Error('offline');});
  w.postMessage(cfg);workers[0].onmessage({data:{p:{level:4}}});assert.equal(events.length,1);w.terminate();await pause(360);assert.equal(requests,0);
});
test('remote checked winner ends local search once; next puzzle creates a fresh local worker',async()=>{
  let cancel=0;const {w,workers,events}=setup(async(url,options)=>{if(options.method==='GET')return Response.json({state:'done',p:{valid:true,level:4}});const d=JSON.parse(options.body);if(d.action==='cancel'){cancel++;return Response.json({ok:true});}return Response.json({available:true,id:'a'.repeat(64),expires:Date.now()+4000});});
  w.postMessage(cfg);await pause(900);assert.equal(events.length,1);assert.equal(workers[0].terminated,true);
  workers[0].onmessage({data:{p:{level:4}}});assert.equal(events.length,1);
  w.postMessage({...cfg,level:1});assert.equal(workers.length,2);workers[0].onmessage({data:{p:{level:4}}});assert.equal(events.length,1);workers[1].onmessage({data:{p:{level:1}}});assert.equal(events.length,2);w.terminate();assert(cancel>=1);
});
test('offline or invalid remote result never prevents local completion; stopping discards late replies',async()=>{
  let local;const {w,workers,events}=setup(async(url,options)=>options.method==='GET'?Response.json({state:'done',p:{valid:true,level:5}}):Response.json({available:true,id:'a'.repeat(64),expires:Date.now()+4000}));
  w.postMessage(cfg);await pause(900);assert.equal(events.length,0);local=workers[0];assert.equal(local.terminated,false);
  local.onmessage({data:{p:{level:4}}});assert.equal(events.length,1);w.terminate();local.onmessage({data:{p:{level:4}}});assert.equal(events.length,1);
  const offline=setup(async()=>{throw Error('offline');});offline.w.postMessage(cfg);await pause(400);offline.workers[0].onmessage({data:{p:{level:4}}});assert.equal(offline.events.length,1);offline.w.terminate();
});
test('a temporary failure on the second puzzle recovers without changing its difficulty',async()=>{
  const levels=[],jobs=new Map();let creates=0;
  const t=clocked(async(url,o,now)=>{
    if(o.method==='GET')return Response.json({state:'done',p:{valid:true,level:jobs.get(new URL(url).searchParams.get('id'))}});
    const d=JSON.parse(o.body);if(d.action==='cancel')return Response.json({ok:true});
    levels.push(d.level);if(++creates===2)throw Error('temporary connection failure');
    const id=String(creates).repeat(64);jobs.set(id,d.level);return Response.json({available:true,id,expires:now+45000});
  });
  t.w.postMessage(cfg);await t.advance(1000);assert.equal(t.events.length,1);
  t.w.postMessage({...cfg,level:18});await t.advance(3000);
  assert.deepEqual(levels,[4,18,18]);assert.equal(t.events.length,2);assert.equal(t.events[1].p.level,18);
  assert.equal(t.root.NPGenerationAssist.getTimings().at(-1).source,'assisted');t.w.terminate();
});
test('an unavailable relay does not suppress the next puzzle or remain unavailable forever',async()=>{
  let creates=0;
  const t=clocked(async(url,o,now)=>{
    if(o.method==='GET')return Response.json({state:'done',p:{valid:true,level:4}});
    if(JSON.parse(o.body).action==='cancel')return Response.json({ok:true});
    if(++creates===1)return Response.json({available:false});
    return Response.json({available:true,id:'a'.repeat(64),expires:now+45000});
  });
  t.w.postMessage(cfg);await t.advance(400);
  t.workers[0].onmessage({data:{p:{level:4}}});assert.equal(t.events.length,1);
  t.w.postMessage(cfg);await t.advance(1000);
  assert.equal(creates,2);assert.equal(t.events.length,2);t.w.terminate();
});
test('an unavailable relay is retried while the same local puzzle continues',async()=>{
  let creates=0;
  const t=clocked(async(url,o,now)=>{
    if(o.method==='GET')return Response.json({state:'done',p:{valid:true,level:4}});
    if(JSON.parse(o.body).action==='cancel')return Response.json({ok:true});
    if(++creates<3)return Response.json({available:false});
    return Response.json({available:true,id:'a'.repeat(64),expires:now+45000});
  });
  t.w.postMessage(cfg);await t.advance(4000);
  assert.equal(creates,3);assert.equal(t.events.length,1);t.w.terminate();
});
test('expiry cancels the old job before requesting assistance again for the same puzzle',async()=>{
  let creates=0;const order=[];
  const t=clocked(async(url,o,now)=>{
    if(o.method==='GET')return Response.json(creates===1?{state:'pending'}:{state:'done',p:{valid:true,level:4}});
    const d=JSON.parse(o.body);order.push(d.action);
    if(d.action==='cancel')return Response.json({ok:true});
    return Response.json({available:true,id:String(++creates).repeat(64),expires:now+45000});
  });
  t.w.postMessage(cfg);await t.advance(47000);
  assert.equal(creates,2);assert.equal(t.events.length,1);assert.deepEqual(order.slice(0,3),['create','cancel','create']);t.w.terminate();
});
test('temporary polling failure retries the existing job without cancelling its searches',async()=>{
  let creates=0,polls=0,cancels=0;
  const t=clocked(async(url,o,now)=>{
    if(o.method==='GET'){if(++polls===1)throw Error('temporary polling failure');return Response.json({state:'done',p:{valid:true,level:4}});}
    if(JSON.parse(o.body).action==='cancel'){cancels++;return Response.json({ok:true});}
    creates++;return Response.json({available:true,id:'a'.repeat(64),expires:now+45000});
  });
  t.w.postMessage(cfg);await t.advance(900);assert.equal(cancels,0);assert.equal(t.workers[0].terminated,false);
  await t.advance(1500);assert.equal(creates,1);assert.equal(polls,2);assert.equal(t.events.length,1);t.w.terminate();
});
test('local completion and stopping both prevent all later retries',async()=>{
  for(const stop of [false,true]){
    let creates=0;const t=clocked(async()=>{creates++;return Response.json({available:false});});
    t.w.postMessage(cfg);await t.advance(400);
    if(stop)t.w.terminate();else t.workers[0].onmessage({data:{p:{level:4}}});
    await t.advance(70000);assert.equal(creates,1);assert.equal(t.events.length,stop?0:1);t.w.terminate();
  }
});
test('late creation after stopping is cancelled and never starts another retry',async()=>{
  let resolveCreate,creates=0,cancels=0;
  const t=clocked(async(url,o)=>{
    if(JSON.parse(o.body).action==='cancel'){cancels++;return Response.json({ok:true});}
    creates++;return new Promise(resolve=>{resolveCreate=resolve;});
  });
  t.w.postMessage(cfg);await t.advance(400);t.w.terminate();
  resolveCreate(Response.json({available:true,id:'a'.repeat(64),expires:1045000}));await t.advance(70000);
  assert.equal(creates,1);assert.equal(cancels,1);assert.equal(t.events.length,0);
});
test('rate limiting respects Retry-After before requesting assistance again',async()=>{
  let creates=0;
  const t=clocked(async(url,o,now)=>{
    if(o.method==='GET')return Response.json({state:'done',p:{valid:true,level:4}});
    if(JSON.parse(o.body).action==='cancel')return Response.json({ok:true});
    if(++creates===1)return Response.json({error:'limited'},{status:429,headers:{'Retry-After':'45'}});
    return Response.json({available:true,id:'a'.repeat(64),expires:now+45000});
  });
  t.w.postMessage(cfg);await t.advance(45000);assert.equal(creates,1);await t.advance(1000);
  assert.equal(creates,2);assert.equal(t.events.length,1);t.w.terminate();
});
