import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {cleanPuzzle} from '../../nanpure/gallery/model.mjs';
test('all 22 shipped sudoku rules retain their rule metadata when exhibited',async()=>{
 globalThis.self=globalThis;const {readProblemPack}=await import('../../nanpure/collection/pack-reader.mjs');
 const base=new URL('../../nanpure/collection/',import.meta.url),catalog=JSON.parse(fs.readFileSync(new URL('catalog.json',base))),kinds=[...new Set(catalog.configs.map(c=>c.kind))].filter(k=>k!=='cross');assert.equal(kinds.length,22);
 for(const kind of kinds){const c=catalog.configs.find(c=>c.kind===kind),idx=JSON.parse(fs.readFileSync(new URL(c.index.file,base))),pack=idx.packs[0],bytes=Uint8Array.from(Buffer.from(fs.readFileSync(new URL(pack.file,base),'utf8').trim(),'base64'));
  const rows=await readProblemPack(bytes,{...pack,key:c.key,ids:Array.from({length:pack.count},(_,i)=>'P-'+String(pack.first+i).padStart(6,'0'))}),p=rows[0].puzzle,clean=cleanPuzzle(p);
  assert.equal(clean.kind,kind);for(const field of Object.keys(p).filter(k=>!['grid','elapsed','completed','notes'].includes(k)))assert.deepEqual(clean[field],p[field],kind+':'+field);
 }
});
