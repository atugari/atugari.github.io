import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/index.js';import {database} from './db.mjs';
import {emptyRoom,slotFromPuzzle,validCompletion,cleanRoom,MAX_BYTES} from '../../nanpure/gallery/model.mjs';
const origin='https://atugari.github.io',key='a'.repeat(64),other='b'.repeat(64);
function fixture(n=9){const b=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>(Math.floor(i/n)*b+Math.floor(Math.floor(i/n)/b)+i%n)%n+1);return {uid:'test',kind:'normal',n,level:3,puzzle:solution.map((v,i)=>i%3===0?v:0),solution,grid:solution.slice(),completed:true,elapsed:140,video:{hints:1,errors:0}}}
const room=()=>({...emptyRoom(),slots:[slotFromPuzzle(fixture(),'clear'),null,null,null,null,null,null]});
function setup(){const DB=database(),env={DB};const call=(query='',body,k=key)=>worker.fetch(new Request('https://api.test/api/gallery'+query,{method:body?'POST':'GET',headers:{Origin:origin,...(k?{'X-Gallery-Key':k}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {DB,env,call}}
test('one owner has one room, publication is explicit and private contents and keys never leak',async()=>{
 const {DB,call}=setup();let r=await call('?mine=1');assert.deepEqual(await r.json(),{gallery:null});
 r=await call('',{action:'save',expected:0,published:false,room:room()});assert.equal(r.status,200);let saved=(await r.json()).gallery;
 assert.equal(saved.published,false);assert(!JSON.stringify(saved).includes('owner'));assert(!JSON.stringify(saved).includes(key));assert.equal(DB.raw.prepare('SELECT owner FROM galleries').get().owner.length,64);
 assert.equal((await call('?room='+saved.id,null,null)).status,404);
 assert.deepEqual(await (await call('?mine=1',null,other)).json(),{gallery:null});
 r=await call('',{action:'save',expected:1,published:true,room:room()});saved=(await r.json()).gallery;assert.equal(saved.revision,2);assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM galleries').get().n,1);
 const publicView=await call('?room='+saved.id,null,null);assert.equal(publicView.status,200);assert.equal((await publicView.json()).gallery.room.slots[0].recordOrigin,'device');assert.equal(publicView.headers.get('cache-control'),'no-store');
 assert.equal((await call('',{action:'unpublish',expected:2})).status,200);assert.equal((await call('?room='+saved.id,null,null)).status,404);assert.equal((await (await call('?mine=1')).json()).gallery.room.slots[0].elapsed,140000);
});
test('concurrent creation and edits cannot overwrite a newer room',async()=>{
 const {DB,call}=setup();const initial={action:'save',expected:0,published:false,room:room()};let responses=await Promise.all([call('',initial),call('',initial)]);assert.deepEqual(responses.map(v=>v.status).sort(),[200,409]);
 const a=room(),b=room();a.name='A';b.name='B';responses=await Promise.all([call('',{...initial,expected:1,room:a}),call('',{...initial,expected:1,room:b})]);assert.deepEqual(responses.map(v=>v.status).sort(),[200,409]);assert.equal(DB.raw.prepare('SELECT revision FROM galleries').get().revision,2);
});
test('owner authentication, origin, request size and unexpected methods are enforced',async()=>{
 const {call,env}=setup();assert.equal((await call('?mine=1',null,null)).status,401);assert.equal((await call('',{action:'save',expected:0,published:true,room:room()},other.slice(0,20))).status,401);
 const r=await worker.fetch(new Request('https://api.test/api/gallery',{method:'POST',headers:{Origin:'https://evil.test','X-Gallery-Key':key},body:'{}'}),env);assert.equal(r.status,403);
 assert.equal((await call('',{action:'save',expected:0,published:true,room:{...room(),bio:'x'.repeat(MAX_BYTES+20000)}})).status,413);
 const preflight=await worker.fetch(new Request('https://api.test/api/gallery',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-gallery-key'}}),env);assert.equal(preflight.status,204);
});
test('only selected bounded data is public, with no video, notes, owner credentials or arbitrary uploads',()=>{
 const p=fixture();p.video.secret='never publish';p.notes={1:[3]};p.ownerKey=key;
 const s=slotFromPuzzle(p,'clear'),r=cleanRoom({...emptyRoom(),slots:[s,null,null,null,null,null,null]});const raw=JSON.stringify(r);for(const key of ['never publish','notes','ownerKey'])assert(!raw.includes(key));
 for(const patch of [{slots:Array(8).fill(null)},{name:''},{bio:'x'.repeat(201)}])assert.throws(()=>cleanRoom({...r,...patch}));
 assert.throws(()=>cleanRoom({...r,slots:[{...s,record:{...s.record,puzzle:[1]}},null,null,null,null,null,null]}));
 assert.throws(()=>cleanRoom({...r,slots:[{...s,elapsed:-1},null,null,null,null,null,null]}));
 assert(validCompletion(p));for(const extra of [{completed:false},{grid:[]},{titleRevealed:true},{video:{auto:true}},{video:{revealed:true}}])assert(!validCompletion({...p,...extra}));
});
test('100 by 100 boards remain portable and legacy completion dates stay unknown',()=>{
 const p=fixture(100),s=slotFromPuzzle(p,'clear',{at:null});const r=cleanRoom({...emptyRoom(),slots:[s,null,null,null,null,null,null]});assert.equal(r.slots[0].record.puzzle.length,10000);assert.equal(r.slots[0].at,null);assert(new TextEncoder().encode(JSON.stringify(r)).length<MAX_BYTES);
});
test('capacity guard leaves the old room readable and permits smaller updates',async()=>{
 const {DB,call}=setup();await call('',{action:'save',expected:0,published:true,room:room()});const original=DB.prepare.bind(DB);DB.prepare=(sql)=>{const q=original(sql);if(sql==='SELECT 1'){q.all=async()=>({results:[{1:1}],meta:{size_after:450*1024*1024}})}return q};
 const bigger=room();bigger.bio='容量'.repeat(90);assert.equal((await call('',{action:'save',expected:1,published:true,room:bigger})).status,507);assert.equal((await (await call('?mine=1')).json()).gallery.revision,1);
 const smaller={...emptyRoom(),name:'A',bio:''};assert.equal((await call('',{action:'save',expected:1,published:false,room:smaller})).status,200);
});
