import test from'node:test';import assert from'node:assert/strict';import worker from'../src/index.js';import{database}from'./db.mjs';import{hash}from'../src/http.js';import{dailySummary,japanDay}from'../src/shared/daily-plan.js';
const key='a'.repeat(64),other='b'.repeat(64),ownerKey='c'.repeat(64),origin='https://atugari.github.io';
async function setup(){const DB=database(),env={DB,OWNER_KEY_HASH:await hash(ownerKey)};async function call(path,{data,method,who=key,cloud=key,admin=false,headers={},bytes}={}){const r=await worker.fetch(new Request('https://worker.test'+path,{method:method||((data||bytes)?'POST':'GET'),headers:{Origin:origin,'x-nanpure-key':who,'x-cloud-key':cloud,...(admin?{Authorization:'Bearer '+ownerKey}:{}),...headers},body:bytes|| (data?JSON.stringify(data):undefined)}),env);return{status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():new Uint8Array(await r.arrayBuffer()),headers:r.headers}}return{DB,call}}
test('daily eligibility, answer privacy, replay, timing, rank and archive',async()=>{const {DB,call}=await setup(),day=japanDay(),p={...dailySummary(day,1),puzzle:[0,2,3,4],solution:[1,2,3,4]};DB.raw.prepare('INSERT INTO daily_assignments VALUES(?,?,?,?,?,?)').run(day+':1',day,1,'test',JSON.stringify(p),Date.now());
 let r=await call('/api/daily');assert(!JSON.stringify(r.data).includes('solution'));r=await call('/api/daily',{data:{action:'start',level:1,mode:'auto'}});assert.equal(r.status,200);const id=r.data.id;assert(!r.data.solution);assert.equal(r.data.ranked,true);
 const again=await call('/api/daily',{data:{action:'start',level:1,mode:'auto'}});assert.equal(again.data.id,id);assert.equal(again.data.started,r.data.started);
 r=await call('/api/daily',{who:other,data:{action:'check',level:1,id,grid:p.solution}});assert.equal(r.status,400);
 r=await call('/api/daily',{data:{action:'check',level:1,id,grid:[1,1,1,1]}});assert.equal(r.data.correct,false);
 DB.raw.prepare('UPDATE attempts SET started=started-10000 WHERE id=?').run(id);
 r=await call('/api/daily',{data:{action:'check',level:1,id,grid:p.solution}});assert.equal(r.data.correct,true);const elapsed=r.data.elapsed;
 r=await call('/api/daily',{data:{action:'finish',level:1,id,grid:p.solution,name:'テスト'}});assert.equal(r.data.elapsed,elapsed);
 r=await call('/api/daily',{data:{action:'finish',level:1,id,grid:p.solution,name:'again'}});assert.equal(r.status,409);
 r=await call('/api/ranking');assert.equal(r.data.rows.length,1);assert.equal(r.data.completed,1);
 r=await call('/api/daily',{who:other,data:{action:'start',level:1,mode:'practice'}});assert.deepEqual(r.data.solution,p.solution);
 r=await call('/api/daily',{who:other,data:{action:'start',level:1,mode:'ranked'}});assert.equal(r.data.ranked,false);
 r=await call('/api/daily',{who:other,data:{action:'finish',id:r.data.id,level:1,grid:p.solution,name:'cheat'}});assert.equal(r.status,409);
 r=await call('/api/daily',{data:{action:'start',level:1,day:'2099-01-01',mode:'practice'}});assert.equal(r.status,400);DB.raw.close();
});
test('contact is private, idempotent and owner reply reaches receipt only',async()=>{const{DB,call}=await setup();const data={category:'question',topic:'howto',detail:'Private test',requestId:crypto.randomUUID(),locale:'ja'};let r=await call('/api/contact',{data});assert.equal(r.status,200);const {id,accessKey}=r.data;r=await call('/api/contact',{data});assert.equal(r.data.id,id);
 r=await call('/api/contact?id='+id,{who:other});assert.equal(r.status,404);r=await call('/api/contact?id='+id,{who:other,headers:{'x-contact-key':accessKey}});assert.equal(r.data.items.length,1);assert(!r.data.items[0].accessHash);assert(!r.data.items[0].sender);
 r=await call('/api/admin',{headers:{'oai-authenticated-user-email':'owner@example.test'}});assert.equal(r.status,403);
 r=await call('/api/admin',{admin:true,data:{id,status:'answered',response:'Reply'}});assert.equal(r.data.ok,true);r=await call('/api/contact');assert.equal(r.data.items[0].response,'Reply');r=await call('/api/contact',{who:other});assert.equal(r.data.items.length,0);DB.raw.close();
});
test('chunked cloud saves: isolation, incomplete uploads, atomic revision conflicts and integrity',async()=>{const {DB,call}=await setup();const bytes=new TextEncoder().encode(JSON.stringify({format:'nanpure-website-backup-v1',data:{}})),digest=await hash(bytes);
 async function begin(expected=null){const r=await call('/api/cloud',{data:{action:'begin',expected,bytes:bytes.length,chunks:1,puzzles:0,digest}});assert.equal(r.status,200);return r.data.revision}
 const a=await begin(),b=await begin();let r=await call('/api/cloud',{data:{action:'commit',revision:a}});assert.equal(r.status,409);
 for(const revision of[a,b]){r=await call('/api/cloud?action=chunk&revision='+revision+'&position=0',{bytes});assert.equal(r.status,200)}
 r=await call('/api/cloud',{data:{action:'commit',revision:a}});assert.equal(r.status,200);r=await call('/api/cloud',{data:{action:'commit',revision:b}});assert.equal(r.status,409);
 r=await call('/api/cloud?action=chunk&revision='+a+'&position=0');assert.deepEqual(r.data,bytes);
 r=await call('/api/cloud?action=chunk&revision='+a+'&position=0',{cloud:other});assert.equal(r.status,404);
 r=await call('/api/cloud?action=chunk&revision='+a+'&position=0',{bytes});assert.equal(r.status,409);
 r=await call('/api/cloud',{data:{action:'commit',revision:a}});assert.equal(r.status,200);const c=await begin(a);await call('/api/cloud?action=chunk&revision='+c+'&position=0',{bytes});r=await call('/api/cloud',{data:{action:'commit',revision:c}});assert.equal(r.status,200);assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM cloud_chunks WHERE revision=?').get(a).n,0);DB.raw.close();
});
