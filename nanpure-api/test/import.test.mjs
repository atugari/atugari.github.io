import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {hash} from '../src/http.js';

test('private migration verifies every column, preserves unique conflicts and is idempotent',async()=>{
 const DB=database(),key='d'.repeat(64),env={DB,OWNER_KEY_HASH:await hash(key)};
 const row={id:'legacy-1',player:'legacy-player',day:'2026-10-20:book-v2',level:1,started:1000,finished:null,solved:null,elapsed:null,name:null,abandoned:2000,excluded:null,review_note:null};
 async function call(rows,mode,authenticated=true){const r=await worker.fetch(new Request('https://worker.test/api/admin/import',{method:'POST',headers:{Origin:'https://atugari.github.io',...(authenticated?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({table:'attempts',rows,mode})}),env);return{status:r.status,data:await r.json()}}
 assert.equal((await call([row],'check',false)).status,403);
 let r=await call([row],'check');assert.deepEqual(r.data,{ok:true,checked:1,identical:0,missing:1,conflicts:0});
 assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,0);
 assert.equal((await call([row])).data.inserted,1);
 r=await call([row],'check');assert.deepEqual(r.data,{ok:true,checked:1,identical:1,missing:0,conflicts:0});
 assert.equal((await call([row])).data.inserted,0);
 r=await call([{...row,review_note:'different'}],'check');assert.equal(r.data.conflicts,1);
 const fresh={...row,id:'fresh',player:'fresh-player'};
 assert.equal((await call([fresh,{...row,review_note:'different'}])).status,409);
 assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,1);
 assert.equal((await call([{...row,id:'different-id'}])).status,409);
 assert.equal(DB.raw.prepare('SELECT review_note FROM attempts WHERE id=?').get(row.id).review_note,null);
 assert.equal((await call([row,row])).status,400);
 DB.raw.close();
});
