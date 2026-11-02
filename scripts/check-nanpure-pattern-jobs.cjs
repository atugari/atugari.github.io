// Independent tasks, fair scheduling, exact snapshots, explicit Stop and durable recovery.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={console,Date,Math,setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);
for(const name of ['pattern-model.js','pattern-jobs.js'])vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/'+name,'utf8'),ctx);
const model=ctx.NPPatternModel,allWorkers=[],timers=new Set(),memory=new Map();
const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
class Worker{constructor(){this.posts=[];this.ended=false;allWorkers.push(this);}postMessage(data){this.posts.push(structuredClone(data));}terminate(){this.ended=true;}reply(data){this.onmessage({data});}}
const create=()=>ctx.NPPatternJobsFactory.create({model,engine:'test engine',storage,Worker,Blob:class{},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;},clearTimeout:id=>{timers.delete(id);clearTimeout(id);}});
try{
 const queue=create(),mask=Array.from(model.presets.heart),options={targetLevel:18,levelPolicy:'exact',required:[],excluded:[]};
 const a=queue.add({mask,options}),b=queue.add({mask,options}),c=queue.add({mask:Array.from(model.presets.diamond),options});
 mask[0]=true;options.targetLevel=1;assert.equal(queue.get(a.id).mask[0],false);assert.equal(queue.get(a.id).options.targetLevel,18);
 assert.equal(allWorkers.length,2);assert.equal(queue.get(c.id).state,'queued');
 allWorkers[0].reply({state:'unknown',attempts:7});
 assert.equal(queue.get(a.id).attempts,7);assert.equal(allWorkers[0].posts.at(-1).id,c.id,'Later tasks receive a slice even while earlier tasks are hard');
 queue.stop(b.id);assert.equal(queue.get(b.id).state,'stopped');assert(allWorkers[1].ended);assert.equal(queue.get(a.id).state,'checking');
 allWorkers[0].reply({state:'unknown',attempts:4});assert.equal(queue.get(c.id).attempts,4);
 const stale=allWorkers.find(w=>!w.ended&&w.posts.at(-1)?.id===a.id).onmessage;queue.stop(a.id);const stopped=queue.get(a.id).attempts;stale({data:{state:'unknown',attempts:999}});assert.equal(queue.get(a.id).attempts,stopped,'An old worker response cannot restart or overwrite stopped tasks');
 queue.resume(a.id);assert.equal(queue.get(a.id).state,'checking');
 queue.persist();const restored=create();assert.equal(restored.list().length,3);assert.equal(restored.get(b.id).state,'stopped');assert.equal(restored.get(a.id).attempts,stopped);assert.equal(restored.get(c.id).attempts,4);
 const real=model.search(model.presets.heart,0,{milliseconds:5000});
 const q=create(),job=q.add({mask:Array.from(model.presets.heart),options:{targetLevel:1,levelPolicy:'easier',required:[],excluded:[]}});
 // A separate queue with an empty checkpoint makes the completion worker unambiguous.
 const freshMemory=new Map(),freshWorkers=[];
 class FreshWorker extends Worker{constructor(){super();freshWorkers.push(this);}}
 const fresh=ctx.NPPatternJobsFactory.create({model,engine:'test',storage:{getItem:()=>null,setItem:(k,v)=>freshMemory.set(k,v)},Worker:FreshWorker,Blob:class{},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout,clearTimeout});
 const ready=fresh.add({mask:Array.from(model.presets.heart),options:{targetLevel:10,levelPolicy:'easier'}});
 freshWorkers[0].reply({...JSON.parse(JSON.stringify(real)),rating:{humanSolvable:true,level:1,techniques:[]}});
 assert.equal(fresh.get(ready.id).state,'ready');assert.equal(fresh.get(ready.id).options.targetLevel,10);assert.equal(fresh.get(ready.id).result.rating.level,1);
 fresh.markSaved(ready.id,'saved-puzzle');assert.equal(fresh.get(ready.id).savedUid,'saved-puzzle');
 const wrong=fresh.add({mask:Array.from(model.presets.diamond),options:{targetLevel:1}});freshWorkers[0].reply({...JSON.parse(JSON.stringify(real)),rating:{humanSolvable:true,level:1}});assert.equal(fresh.get(wrong.id).state,'error','Results cannot be assigned to another pattern');
 for(const manager of [queue,restored,q,fresh])for(const row of manager.list())manager.stop(row.id);
 console.log('PASS independent pattern jobs: immutable snapshots, two-worker budget, fair slices, isolated Stop, stale callback guard, restore offsets, ready results and identity, per-job completion constraints');
}finally{for(const id of timers)clearTimeout(id);for(const w of allWorkers)w.terminate();}
