import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {hash} from '../src/http.js';

async function setup(t){
  const DB=database(),key='a'.repeat(64),session='b'.repeat(64),client='c'.repeat(64);
  const env={DB,OWNER_KEY_HASH:await hash(key)};t.after(()=>DB.raw.close());
  async function call(path,data,{admin=false,visitor=client}={}){
    const r=await worker.fetch(new Request('https://api.test'+path,{method:data?'POST':'GET',headers:{Origin:'https://atugari.github.io','Content-Type':'application/json','X-Nanpure-Key':visitor,...(admin?{Authorization:'Bearer '+key}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);
    return {status:r.status,data:await r.json()};
  }
  const poll=(capacity=4)=>call('/api/generation/relay',{action:'poll',session,capacity},{admin:true});
  return {DB,session,call,poll};
}
const create={action:'create',kind:'normal',n:9,level:4};
test('generation broker authenticates relay, isolates clients and accepts the first leased result only',async t=>{
  const {call,poll,session,DB}=await setup(t);
  assert.equal((await call('/api/generation',create)).data.available,false);
  assert.equal((await call('/api/generation/relay',{action:'poll',session,capacity:4})).status,403);
  await poll();
  const requests=await Promise.all(Array.from({length:8},()=>call('/api/generation',create)));
  assert.equal(requests.filter(r=>r.data.available).length,1);
  const {id}=requests.find(r=>r.data.available).data;
  assert.equal((await call('/api/generation?id='+id,null,{visitor:'d'.repeat(64)})).status,404);
  const {job}= (await poll()).data;
  assert.equal(job.id,id);assert.equal(job.level,4);
  const fake={kind:'normal',n:9,level:3,rating:{level:3},puzzle:Array(81).fill(0),solution:Array(81).fill(1)};
  assert.equal((await call('/api/generation/relay',{action:'result',session,id,lease:job.lease,p:fake},{admin:true})).status,400);
  const p={...fake,level:4,rating:{level:4}};
  // The relay is owner-authenticated; full proof validation happens on the PC.
  const saved=await call('/api/generation/relay',{action:'result',session,id,lease:job.lease,p},{admin:true});assert.equal(saved.status,200);
  assert.equal((await call('/api/generation/relay',{action:'result',session,id,lease:job.lease,p},{admin:true})).status,409);
  const result=await call('/api/generation?id='+id);assert.equal(result.data.state,'done');assert.deepEqual(result.data.p,p);
  assert(!JSON.stringify(result).includes(session));
  assert(!DB.raw.prepare('SELECT client FROM generation_requests').get().client.includes('c'.repeat(64)));
});
test('cancel, expiry, one relay, unsupported conditions and queue capacity preserve local fallback',async t=>{
  const {call,poll,session,DB}=await setup(t);await poll();
  assert.equal((await call('/api/generation/relay',{action:'poll',session:'e'.repeat(64),capacity:4},{admin:true})).status,409);
  for(const data of [{...create,level:3},{...create,n:6},{...create,kind:'killer'},{...create,level:19},{...create,solution:[]}])assert.equal((await call('/api/generation',data)).status,400);
  const {id}=(await call('/api/generation',create)).data;
  await call('/api/generation',{action:'cancel',id});assert.equal((await poll()).data.job,null);
  assert.equal((await call('/api/generation?id='+id)).data.state,'cancelled');
  const next=(await call('/api/generation',create)).data;const old=(await poll()).data.job;
  DB.raw.prepare('UPDATE generation_requests SET lease_until=0 WHERE id=?').run(next.id);
  const fresh=(await poll()).data.job;assert.notEqual(fresh.lease,old.lease);
  DB.raw.prepare('UPDATE generation_requests SET expires=0 WHERE id=?').run(next.id);
  assert.equal((await poll()).data.job,null);
  assert.equal((await call('/api/generation?id='+next.id)).status,404);
  const results=[];for(let i=0;i<21;i++)results.push(await call('/api/generation',create,{visitor:(100+i).toString(16).padStart(64,'0')}));
  assert.equal(results.filter(r=>r.data.available).length,20);
  await call('/api/generation/relay',{action:'stop',session},{admin:true});
  assert.equal((await call('/api/generation',create)).data.available,false);
});
