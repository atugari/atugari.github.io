import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/index.js';import {database} from './db.mjs';
import {emptyRoom,slotFromPuzzle} from '../../nanpure/gallery/model.mjs';
import {events,phase,cleanReplay,replayGrid} from '../../nanpure/exhibitions/model.mjs';
const origin='https://atugari.github.io',key='a'.repeat(64),other='b'.repeat(64),event=events[0].id;
function puzzle(index=0){const solution=Array.from({length:81},(_,i)=>(Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9+1),puzzle=solution.slice();puzzle[index]=0;return {kind:'normal',n:9,level:1,puzzle,solution,uid:'test-'+index};}
const room=()=>({...emptyRoom(),slots:Array.from({length:7},(_,i)=>slotFromPuzzle(puzzle(i),'created',{title:'作品'+i}))});
function recording(index=0){const p=puzzle(index);return {version:1,record:p,initial:p.puzzle.slice(),steps:[{at:5000,i:index,v:p.solution[index]}],annotations:[{step:1,text:'ここに気づいた！'}],elapsed:5000};}
function setup(){const DB=database();const call=async(path,data,k=key)=>{const response=await worker.fetch(new Request('http://api.test/api/'+path,{method:data?'POST':'GET',headers:{Origin:origin,...(k?{'X-Gallery-Key':k}:{})},...(data?{body:JSON.stringify(data)}:{})}),{DB});return {status:response.status,data:await response.json()}};const save=(published=true,k=key)=>call('gallery',{action:'save',room:room(),published,expected:0},k);const submit=(slot=0,expected=0,k=key)=>call('exhibitions',{action:'submit',slot,event,expected,confirm:true},k);return {DB,call,save,submit};}
test('event dates use exact Japan-time boundaries and retain a closed archive',()=>{const e=events[0];assert.equal(phase(e,Date.parse(e.start)-1),'upcoming');assert.equal(phase(e,Date.parse(e.start)),'open');assert.equal(phase(e,Date.parse(e.end)-1),'open');assert.equal(phase(e,Date.parse(e.end)),'closed');});
test('only an explicitly published own gallery can enter, with a snapshot and no identity leakage',async()=>{
 const {DB,call,save,submit}=setup();assert.equal((await submit()).status,409);await save(false);assert.equal((await submit()).status,409);await call('gallery',{action:'save',room:room(),published:true,expected:1});
 assert.equal((await call('exhibitions',{action:'submit',slot:0,event,expected:0,confirm:false})).status,400);const r=await submit();assert.equal(r.status,200);assert.equal((await submit(0)).status,409);
 const view=await call('exhibitions?entry='+r.data.id,null,null);assert.equal(view.status,200);assert.equal(view.data.entry.slot.title,'作品0');for(const s of [key,'owner','room_content','fingerprint'])assert(!JSON.stringify(view.data).includes(s));
 const edited=room();edited.slots[0].title='展示室だけ変更';await call('gallery',{action:'save',room:edited,published:true,expected:2});assert.equal((await call('exhibitions?entry='+r.data.id)).data.entry.slot.title,'作品0');
 const date=Date.now;try{Date.now=()=>Date.parse(events[0].end);assert.equal((await submit(1)).status,409);assert.equal((await call('exhibitions?event='+event)).data.entries.length,1);}finally{Date.now=date;}DB.raw.close();
});
test('concurrent submissions and reactivations never exceed three, duplicate puzzles are refused',async()=>{
 const {DB,save,submit,call}=setup();await save();const results=await Promise.all([0,1,2,3].map(i=>submit(i)));assert.equal(results.filter(r=>r.status===200).length,3);assert.equal(DB.raw.prepare('SELECT count(*) n FROM exhibition_entries WHERE active=1').get().n,3);
 const first=results.find(r=>r.status===200);assert.equal((await call('exhibitions',{action:'withdraw',id:first.data.id,expected:1},other)).status,409);await call('exhibitions',{action:'withdraw',id:first.data.id,expected:1});await submit(4);assert.equal((await submit(0,2)).status,409);
 const edited=room();edited.slots[5]=edited.slots[1];await call('gallery',{action:'save',expected:1,published:true,room:edited});assert.equal((await submit(5)).status,409);DB.raw.close();
});
test('reactions are separate, idempotent and reversible; private and withdrawn entries disappear',async()=>{
 const {DB,call,save,submit}=setup();await save();const id=(await submit()).data.id;const react=(enabled,kind='idea')=>call('exhibitions',{action:'react',id,kind,enabled},other);
 assert.equal((await react(true)).data.reactions.idea.count,1);assert.equal((await react(true)).data.reactions.idea.count,1);assert.equal((await react(true,'beautiful')).data.reactions.beautiful.count,1);assert.equal((await react(false)).data.reactions.idea.count,0);assert.equal((await react(true,'arbitrary')).status,400);
 assert.equal((await call('exhibitions',{action:'react',id,kind:'idea',enabled:true})).status,400);
 await call('gallery',{action:'unpublish',expected:1});assert.equal((await call('exhibitions?entry='+id)).status,404);assert.equal((await call('exhibitions')).data.total,0);assert.equal((await react(true)).status,404);await call('gallery',{action:'save',room:room(),published:true,expected:2});assert.equal((await call('exhibitions?entry='+id)).status,200);
 await call('exhibitions',{action:'withdraw',id,expected:1});assert.equal((await call('exhibitions?entry='+id)).status,404);DB.raw.close();
});
test('all entries are reachable by stable pages without disclosing keys or private rooms',async()=>{
 const {DB,call,save,submit}=setup();await save();await submit();const e=DB.raw.prepare('SELECT * FROM exhibition_entries LIMIT 1').get();for(let i=1;i<27;i++)DB.raw.prepare('INSERT INTO exhibition_entries(id,event,owner,room_id,slot,content,fingerprint,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(i.toString(16).padStart(24,'0'),event,'fixture-'+i,e.room_id,0,e.content,'shape-'+i,e.created+i,e.created+i);
 const a=await call('exhibitions?page=1'),b=await call('exhibitions?page=2'),c=await call('exhibitions?page=3');assert.equal(a.data.total,27);assert.deepEqual([a,b,c].map(r=>r.data.entries.length),[12,12,3]);assert.equal(new Set([a,b,c].flatMap(r=>r.data.entries.map(e=>e.id))).size,27);assert.equal((await call('exhibitions?page=NaN')).status,400);assert.equal((await call('exhibitions?page=100001')).status,400);DB.raw.close();
});
test('replays validate every transition, strip private fields, and preserve actual undo steps and annotations',()=>{
 const r=recording(),s=r.record.solution[0];r.steps=[{at:1,i:0,v:s},{at:2,i:0,v:0},{at:3,i:0,v:s}];r.record.notes={secret:123};r.ownerKey=key;const clean=cleanReplay(r);assert.deepEqual(replayGrid(clean,2),clean.initial);assert.deepEqual(replayGrid(clean,3),clean.record.solution);assert(!JSON.stringify(clean).includes('secret'));assert(!JSON.stringify(clean).includes(key));
 for(const extra of [{steps:[{at:1,i:2,v:3}]},{steps:[{at:1,i:0,v:0}]},{steps:[{at:3,i:0,v:s},{at:1,i:0,v:s}]},{annotations:[{step:4,text:'invalid'}]},{annotations:[{step:0,text:'\u0001'}]}])assert.throws(()=>cleanReplay({...r,...extra}));
 const bad=recording();bad.initial[1]=0;assert.throws(()=>cleanReplay(bad));
});
test('replay publication is explicit, puzzle-matched, owner-isolated and removable with revision protection',async()=>{
 const {DB,call,save,submit}=setup();await save();const id=(await submit()).data.id,body={action:'publishReplay',entry:id,recording:recording(),title:'わたしの手順',name:'テスト',confirm:true};assert.equal((await call('exhibitions',{...body,confirm:false},other)).status,400);assert.equal((await call('exhibitions',{...body,recording:recording(1)},other)).status,400);
 const r=await call('exhibitions',body,other);assert.equal(r.status,200);let view=await call('exhibitions?replay='+r.data.id,null,null);assert.equal(view.status,200);assert.equal(view.data.replay.mine,false);assert(!JSON.stringify(view.data).includes(other));assert.equal((await call('exhibitions?entry='+id)).data.replays.length,1);
 assert.equal((await call('exhibitions',{action:'unpublishReplay',id:r.data.id,expected:1})).status,409);assert.equal((await call('exhibitions',{action:'unpublishReplay',id:r.data.id,expected:0},other)).status,409);
 await call('exhibitions',{action:'withdraw',id,expected:1});assert.equal((await call('exhibitions?replay='+r.data.id)).status,404);const removed=await call('exhibitions',{action:'unpublishReplay',id:r.data.id,expected:1},other);assert.equal(removed.status,200);assert.equal(DB.raw.prepare('SELECT bytes FROM gallery_replays').get().bytes,2);assert.equal((await call('exhibitions?replay='+r.data.id)).status,404);DB.raw.close();
});
test('capacity and authentication errors leave existing gallery and replay data unchanged',async()=>{
 const {DB,call,save,submit}=setup();await save();assert.equal((await call('exhibitions',{action:'submit',event,slot:0,expected:0,confirm:true},null)).status,401);assert.equal((await call('exhibitions?mine=replays',null,null)).status,401);
 const original=DB.prepare.bind(DB);DB.prepare=sql=>{const q=original(sql);if(sql==='SELECT 1')q.all=async()=>({results:[{}],meta:{database_size:450*1024*1024}});return q};assert.equal((await submit()).status,507);assert.equal((await call('exhibitions',{action:'publishReplay',recording:recording(),title:'test',name:'test',confirm:true})).status,507);assert.equal(DB.raw.prepare('SELECT count(*) n FROM galleries').get().n,1);assert.equal(DB.raw.prepare('SELECT count(*) n FROM gallery_replays').get().n,0);DB.raw.close();
});
