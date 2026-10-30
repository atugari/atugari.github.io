// Regression checks for the adapter's asynchronous loading and save boundary.
// No public browser data, puzzle data, or storage keys are changed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../puzzles/navigation.js'),'utf8');
function environment(){
 const listeners={},observers=[],assigned=[],notices=[],byId=new Map();
 const d={documentElement:{lang:'ja'},head:{append(){}},body:{prepend:node=>notices.push(node)},
  querySelectorAll:()=>[],querySelector:()=>d.body,getElementById:id=>byId.get(id),
  createElement:()=>({setAttribute(){},set id(v){this._id=v;byId.set(v,this)},get id(){return this._id}}),
  addEventListener:(name,fn)=>listeners[name]=fn};
 const w={document:d,location:{assign:url=>assigned.push(url)},addEventListener(){},requestAnimationFrame:fn=>fn(),
  MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}}};
 vm.runInNewContext(source,{window:w,console});
 const click=()=>listeners.click({target:{closest:()=>({dataset:{action:'open-crossword'},classList:{contains:()=>false},tagName:'BUTTON'})},preventDefault(){},stopImmediatePropagation(){}});
 return{w,assigned,notices,click,render:()=>observers.forEach(fn=>fn())};
}
(async()=>{
 const e=environment(),settings={kinds:['normal','killer','jigsaw','cross'],count:20},queued=[{kind:'cross',id:'old-job'}];
 e.w.NPBatch={jobs:k=>k,plan:k=>k,queued};e.render();
 assert.deepEqual(e.w.NPBatch.jobs(settings).kinds,['normal','killer','jigsaw']);
 assert.deepEqual(settings.kinds,['normal','killer','jigsaw','cross'],'Saved settings are not rewritten');
 assert.strictEqual(e.w.NPBatch.queued,queued,'Existing generation queue is retained');
 const wrapped=e.w.NPBatch.jobs;e.render();assert.strictEqual(e.w.NPBatch.jobs,wrapped,'No repeated wrappers');
 e.w.NPWebGeneration={render:o=>o};e.render();
 assert.deepEqual(e.w.NPWebGeneration.render({settings}).settings.kinds,['normal','killer','jigsaw'],'A later web renderer is also scoped');
 const tick=()=>new Promise(setImmediate);
 e.w.appPause=()=>false;e.click();await tick();assert.deepEqual(e.assigned,[]);assert.equal(e.notices.length,1);
 e.w.appPause=()=>true;e.w.NPStorage={flush:async()=>{throw Error('disk full')}};e.click();await tick();assert.deepEqual(e.assigned,[]);
 const order=[];e.w.appPause=async()=>{order.push('pause');return true};e.w.NPStorage.flush=async()=>{order.push('flush')};e.click();await tick();
 assert.deepEqual(order,['pause','flush']);assert.deepEqual(e.assigned,['/puzzles/crossword/']);
 console.log('PASS navigation: delayed engine and renderer, original settings and queues, idempotence, failed save/flush stay open, successful save before leaving.');
})().catch(error=>{console.error(error);process.exitCode=1});
