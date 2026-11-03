import test from 'node:test';import assert from 'node:assert/strict';import os from 'node:os';import fs from 'node:fs';import path from 'node:path';
import {openDatabase,createServer} from '../oracle/server.mjs';import worker from '../src/index.js';import {emptyRoom} from '../../nanpure/gallery/model.mjs';
test('OCI SQLite adapter preserves a room and its hashed owner across restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gallery-oci-')),file=path.join(dir,'gallery.sqlite'),key='c'.repeat(64);let db=openDatabase(file);
 const request=(body)=>new Request('http://api.test/api/gallery'+(body?'':'?mine=1'),{method:body?'POST':'GET',headers:{Origin:'https://atugari.github.io','X-Gallery-Key':key},...(body?{body:JSON.stringify(body)}:{})});
 try{const first=await worker.fetch(request({action:'save',published:true,expected:0,room:emptyRoom()}),{DB:db});assert.equal(first.status,200);const saved=(await first.json()).gallery;db.raw.close();db=openDatabase(file);const next=await worker.fetch(request(),{DB:db});assert.equal((await next.json()).gallery.id,saved.id);assert.equal(db.raw.prepare('SELECT count(*) n FROM gallery_migrations').get().n,8);assert(!db.raw.prepare('SELECT owner FROM galleries').get().owner.includes(key));assert.equal(typeof createServer,'function');}finally{db.raw.close();fs.rmSync(dir,{recursive:true,force:true})}
});
