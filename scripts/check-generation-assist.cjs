const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('scripts/client-overrides/public/notebook/generation-assist.js','utf8');
function setup(fetch){
  const workers=[],events=[];
  class Worker{constructor(){this.terminated=false;workers.push(this);}postMessage(cfg){this.cfg=cfg;}terminate(){this.terminated=true;}}
  const root={Worker,crypto,performance,fetch,NP:{validate(p){if(!p.valid)throw Error('invalid');}},NPGenerationMatches:(p,cfg)=>p.level===cfg.level};
  vm.runInNewContext(source,{window:root,Uint8Array,Date,AbortController,setTimeout,clearTimeout});
  const w=root.NPGenerationAssist.createWorker('blob:test');w.onmessage=e=>events.push(e.data);
  return {w,workers,events};
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
