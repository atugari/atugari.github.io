import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {cloud} from '../src/cloud.js';
import {hash} from '../src/http.js';
import {cloudRetiresAt,cloudRetired,deleteRetiredCloudData} from '../src/shared/cloud-retirement.js';

const key='a'.repeat(64),origin='https://atugari.github.io';
async function fixture(t){
 const DB=database();t.after(()=>DB.raw.close());
 const owner=await hash('x-cloud-key:'+key),other=await hash('x-cloud-key:'+'b'.repeat(64));
 for(const id of [owner,other]){
  DB.raw.prepare('INSERT INTO cloud_saves(owner,revision,object_key,created,bytes,puzzles,chunks,digest) VALUES(?,?,?,?,?,?,?,?)').run(id,id,id,Date.now(),2,1,1,'0'.repeat(64));
  DB.raw.prepare('INSERT INTO cloud_chunks(owner,revision,position,data) VALUES(?,?,0,?)').run(id,id,new Uint8Array([1,2]));
  DB.raw.prepare('INSERT INTO cloud_uploads VALUES(?,?,?,?,?,?,?,?,?)').run('pending-'+id,id,null,Date.now(),Date.now()+3600000,2,1,1,'0'.repeat(64));
 }
 DB.raw.prepare('INSERT INTO rate_limits VALUES(?,?,?)').run('cloud-save-v2:private',1,Date.now()+1000000);
 DB.raw.prepare('INSERT INTO rate_limits VALUES(?,?,?)').run('visits:keep',2,Date.now()+1000000);
 DB.raw.prepare('INSERT INTO daily_maintenance VALUES(?,?,0)').run('keep','private daily inventory');
 async function call(method='GET',data=null,path='/api/cloud'){
  const r=await worker.fetch(new Request('https://worker.test'+path,{method,headers:{Origin:origin,'X-Cloud-Key':key,'X-Nanpure-Key':key,...(method==='OPTIONS'?{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-cloud-key'}:{})},...(data?{body:JSON.stringify(data)}:{})}),{DB});
  return{status:r.status,data:await r.json().catch(()=>null)};
 }
 const counts=()=>Object.fromEntries(['cloud_saves','cloud_uploads','cloud_chunks'].map(name=>[name,DB.raw.prepare('SELECT COUNT(*) AS n FROM '+name).get().n]));
 return{DB,call,counts};
}

test('one fixed Japanese service end date is shared by all users',()=>{
 assert.equal(new Date(cloudRetiresAt).toISOString(),'2026-11-08T15:00:00.000Z');
 assert.equal(cloudRetired(cloudRetiresAt-1),false);assert.equal(cloudRetired(cloudRetiresAt),true);
});

test('before the deadline all saved data remains readable and its end date never changes',async t=>{
 t.mock.method(Date,'now',()=>cloudRetiresAt-1000);
 const{DB,call,counts}=await fixture(t);const before=counts();
 const r=await call();assert.equal(r.status,200);assert.equal(r.data.limits.retirement.at,cloudRetiresAt);
 assert.equal(await deleteRetiredCloudData(DB),false);await worker.scheduled({scheduledTime:cloudRetiresAt+1},{DB});
 assert.deepEqual(counts(),before);assert(!DB.raw.prepare("SELECT key FROM daily_maintenance WHERE key='cloud-retired'").get());
});

test('at the deadline all cloud operations stop and only cloud data is deleted',async t=>{
 t.mock.method(Date,'now',()=>cloudRetiresAt);
 const{DB,call,counts}=await fixture(t);
 for(const [method,data]of [['GET',null],['POST',{action:'begin'}],['POST',{action:'commit',revision:'pending'}],['OPTIONS',null]]){
  const r=await call(method,data);assert.equal(r.status,410);assert.match(r.data.error,/提供を終了/);
 }
 assert.deepEqual(counts(),{cloud_saves:0,cloud_uploads:0,cloud_chunks:0});
 assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key LIKE 'cloud%'").get().n,0);
 assert.equal(DB.raw.prepare("SELECT count FROM rate_limits WHERE key='visits:keep'").get().count,2);
 assert.equal(DB.raw.prepare("SELECT value FROM daily_maintenance WHERE key='keep'").get().value,'private daily inventory');
 assert.equal((await call('GET',null,'/api/daily')).status,200);
 assert.equal((await call('GET',null,'/api/ranking')).status,200);
});

test('native scheduled cleanup deletes every user without waiting for a visit and safely repeats',async t=>{
 t.mock.method(Date,'now',()=>cloudRetiresAt+1);
 const{DB,counts}=await fixture(t);await worker.scheduled({scheduledTime:cloudRetiresAt},{DB});
 assert.deepEqual(counts(),{cloud_saves:0,cloud_uploads:0,cloud_chunks:0});
 const marker=DB.raw.prepare("SELECT value FROM daily_maintenance WHERE key='cloud-retired'").get().value;
 await worker.scheduled({scheduledTime:cloudRetiresAt},{DB});assert.equal(DB.raw.prepare("SELECT value FROM daily_maintenance WHERE key='cloud-retired'").get().value,marker);
});

test('an upload started before the deadline cannot be committed afterwards',async t=>{
 let now=cloudRetiresAt-1000;t.mock.method(Date,'now',()=>now);
 const{call,counts}=await fixture(t);assert.equal((await call()).status,200);
 now=cloudRetiresAt;assert.equal((await call('POST',{action:'commit',revision:'pending'})).status,410);
 assert.deepEqual(counts(),{cloud_saves:0,cloud_uploads:0,cloud_chunks:0});
});

test('the database clock rejects a write that was already in flight when retirement arrived',async t=>{
 t.mock.method(Date,'now',()=>cloudRetiresAt);
 const{DB,counts}=await fixture(t);await deleteRetiredCloudData(DB);
 const before=counts();
 const request=new Request('https://worker.test/api/cloud',{method:'POST',headers:{Origin:origin,'X-Cloud-Key':key},body:JSON.stringify({action:'begin',expected:null,bytes:2,chunks:1,puzzles:0,digest:'0'.repeat(64)})});
 await assert.rejects(cloud(request,DB,new URL(request.url)));
 assert.deepEqual(counts(),before);
});
