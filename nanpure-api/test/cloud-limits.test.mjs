import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {hash} from '../src/http.js';

const primary='a'.repeat(64),secondary='b'.repeat(64),origin='https://atugari.github.io';
function setup(t){
 // Preserve the pre-retirement contract when this historical suite runs later.
 if(Date.now()>=Date.parse('2026-11-09T00:00:00+09:00'))t.mock.method(Date,'now',()=>Date.parse('2026-10-26T00:00:00+09:00'));
 const DB=database();t.after(()=>DB.raw.close());
 async function call(data,{code=primary,ip='192.0.2.1',device=primary,path='/api/cloud',bytes}={}){
  const r=await worker.fetch(new Request('https://worker.test'+path,{method:data||bytes?'POST':'GET',headers:{Origin:origin,'x-cloud-key':code,'x-nanpure-key':device,'cf-connecting-ip':ip},body:bytes||(data?JSON.stringify(data):undefined)}),{DB});
  return{status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():new Uint8Array(await r.arrayBuffer())};
 }
 async function begin(expected=null,options={},size=2){return call({action:'begin',expected,bytes:size,chunks:Math.ceil(size/131072),puzzles:0,digest:await hash(new Uint8Array(size))},options)}
 async function save(expected=null,options={}){const started=await begin(expected,options);assert.equal(started.status,200);const revision=started.data.revision;assert.equal((await call(null,{...options,path:'/api/cloud?action=chunk&revision='+revision+'&position=0',bytes:new Uint8Array(2)})).status,200);const committed=await call({action:'commit',revision},options);assert.equal(committed.status,200);return committed.data;}
 return{DB,call,begin,save};
}

test('5 MiB boundary is accepted, larger input is rejected before consuming a slot',async t=>{
 const{DB,call,begin}=setup(t);let r=await begin(null,{},5*1024*1024+1);assert.equal(r.status,413);assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM cloud_uploads').get().n,0);
 r=await call();assert.equal(r.data.quota.remaining,3);assert.equal(r.data.quota.used,0);assert.equal(r.data.limits.maxBytes,5*1024*1024);
 r=await begin(null,{},5*1024*1024);assert.equal(r.status,200);assert.equal(r.data.quota.reserved,1);const revision=r.data.revision;
 await call({action:'cancel',revision});assert.equal((await call()).data.quota.remaining,3);
});

test('three completed saves exhaust one save ID while reads and idempotent commits still work',async t=>{
 const{call,begin,save}=setup(t);let last=null;
 for(let i=0;i<3;i++){last=await save(last?.save.revision||null);assert.equal(last.quota.used,i+1);assert.equal(last.quota.remaining,2-i);assert.equal(last.quota.reserved,0);}
 const denied=await begin(last.save.revision);assert.equal(denied.status,429);
 const read=await call();assert.equal(read.data.save.revision,last.save.revision);assert.equal(read.data.quota.remaining,0);
 const repeated=await call({action:'commit',revision:last.save.revision});assert.equal(repeated.status,200);assert.equal(repeated.data.quota.used,3);
 assert.equal((await call(null,{path:'/api/cloud?action=chunk&revision='+last.save.revision+'&position=0'})).status,200);
});

test('one code shares its quota across devices and IPs; separate codes on one shared IP remain independent',async t=>{
 const{call,save,begin}=setup(t);let last=null;
 for(let i=0;i<3;i++)last=await save(last?.save.revision||null,{device:i%2?secondary:primary,ip:'192.0.2.'+(i+1)});
 assert.equal((await begin(last.save.revision,{device:secondary,ip:'198.51.100.9'})).status,429);
 const other=await save(null,{code:secondary});assert.equal(other.quota.used,1);assert.equal((await call()).data.quota.used,3);
});

test('cancelled, incomplete and conflicting uploads do not count as completed saves',async t=>{
 const{call,begin,save}=setup(t);const a=await begin();assert.equal((await call({action:'commit',revision:a.data.revision})).status,409);
 await call({action:'cancel',revision:a.data.revision});assert.equal((await call()).data.quota.remaining,3);
 const completed=await save();assert.equal((await begin('d'.repeat(8)+'-dddd-dddd-dddd-dddddddddddd')).status,409);
 const read=await call();assert.equal(read.data.quota.used,1);assert.equal(read.data.quota.remaining,2);assert.equal(read.data.save.revision,completed.save.revision);
});

test('concurrent reservations cannot take the final daily slot twice',async t=>{
 const{call,save,begin}=setup(t);let a=await save();a=await save(a.save.revision);
 const attempts=await Promise.all([begin(a.save.revision),begin(a.save.revision)]);assert.deepEqual(attempts.map(r=>r.status).sort(),[200,429]);
 const state=await call();assert.equal(state.data.quota.used,2);assert.equal(state.data.quota.reserved,1);assert.equal(state.data.quota.remaining,0);
 await call({action:'cancel',revision:attempts.find(r=>r.status===200).data.revision});assert.equal((await call()).data.quota.remaining,1);
});

test('concurrent commits account for a completed upload only once',async t=>{
 const{call,begin}=setup(t),a=await begin(),revision=a.data.revision;
 await call(null,{path:'/api/cloud?action=chunk&revision='+revision+'&position=0',bytes:new Uint8Array(2)});
 const r=await Promise.all([call({action:'commit',revision}),call({action:'commit',revision})]);assert(r.some(v=>v.status===200));assert(r.every(v=>[200,409].includes(v.status)));assert.equal((await call()).data.quota.used,1);
});

test('daily limits reset at Japanese midnight, including an upload completed just after midnight',async t=>{
 let now=Date.parse('2026-10-26T23:59:00+09:00');t.mock.method(Date,'now',()=>now);
 const{call,save,begin}=setup(t);let last=await save();last=await save(last.save.revision);const pending=await begin(last.save.revision);
 assert.equal((await call()).data.quota.remaining,0);assert.equal((await call()).data.quota.resetAt,Date.parse('2026-10-27T00:00:00+09:00'));
 now+=61000;assert.equal((await call()).data.quota.remaining,3);
 await call(null,{path:'/api/cloud?action=chunk&revision='+pending.data.revision+'&position=0',bytes:new Uint8Array(2)});
 const done=await call({action:'commit',revision:pending.data.revision});assert.equal(done.status,200);assert.equal(done.data.quota.used,0);
 last=await save(done.data.save.revision);assert.equal(last.quota.used,1);assert.equal(last.quota.remaining,2);
});

test('expired upload reservations release daily slots without deleting the saved backup',async t=>{
 let now=Date.parse('2026-10-26T12:00:00+09:00');t.mock.method(Date,'now',()=>now);
 const{call,begin,save}=setup(t),saved=await save(),pending=await begin(saved.save.revision);
 assert.equal((await call()).data.quota.remaining,1);now+=3600001;
 assert.equal((await call()).data.quota.remaining,2);assert.equal((await call({action:'commit',revision:pending.data.revision})).status,409);assert.equal((await call()).data.save.revision,saved.save.revision);
});

test('the shared storage guard rejects a new reservation without consuming quota',async t=>{
 const{DB,call,begin}=setup(t),owner=await hash('x-cloud-key:'+secondary),revision=crypto.randomUUID();
 DB.raw.prepare('INSERT INTO cloud_saves(owner,revision,object_key,created,bytes,puzzles,chunks,digest) VALUES(?,?,?,?,?,?,?,?)').run(owner,revision,revision,Date.now(),200*1024*1024,0,0,'0'.repeat(64));
 assert.equal((await begin()).status,507);const state=await call();assert.equal(state.data.quota.remaining,3);assert.equal(state.data.quota.reserved,0);
});

test('backups above the new size limit remain readable and are never removed by a rejected upload',async t=>{
 const{DB,call,begin}=setup(t),owner=await hash('x-cloud-key:'+primary),revision=crypto.randomUUID(),bytes=new Uint8Array(131072).fill(7);
 DB.raw.prepare('INSERT INTO cloud_saves(owner,revision,object_key,created,bytes,puzzles,chunks,digest) VALUES(?,?,?,?,?,?,?,?)').run(owner,revision,revision,Date.now(),6*1024*1024,200,48,'0'.repeat(64));
 DB.raw.prepare('INSERT INTO cloud_chunks(owner,revision,position,data) VALUES(?,?,?,?)').run(owner,revision,0,bytes);
 assert.equal((await call()).data.save.bytes,6*1024*1024);assert.deepEqual((await call(null,{path:'/api/cloud?action=chunk&revision='+revision+'&position=0'})).data,bytes);
 assert.equal((await begin(revision,{},6*1024*1024)).status,413);assert.equal((await call()).data.save.revision,revision);assert.equal((await call()).data.quota.remaining,3);
});
