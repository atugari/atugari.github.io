// Verify the exact catalog, every downloadable pack, and representative player opens.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'nanpure/collection');
const catalog=JSON.parse(fs.readFileSync(path.join(base,'catalog.json'))),html=fs.readFileSync(path.join(base,'player.html'),'utf8');
const ctx=vm.createContext({console,Date,Math,performance,setTimeout,clearTimeout,Uint8Array,Uint16Array,Uint32Array,TextEncoder,TextDecoder,atob,btoa});ctx.window=ctx;ctx.self=ctx;
for(const [,id,code]of html.matchAll(/<script[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g))if(id.startsWith('core-')||['common-source','generator-source'].includes(id))vm.runInContext(code,ctx);
vm.runInContext(fs.readFileSync(path.join(base,'compact-codec.js'),'utf8'),ctx);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),failures=[],conditions=[];let packs=0,records=0,opened=0;
for(const cfg of catalog.configs){
 const result={cid:cfg.cid,kind:cfg.kind,n:cfg.n,level:cfg.level,detail:cfg.detail,count:cfg.count,scope:cfg.kind==='cross'?'pareasobi':'nanpure',playable:true};
 try{
  assert(cfg.count>0,'Empty condition');const raw=fs.readFileSync(path.join(base,cfg.index.file));assert.equal(raw.byteLength,cfg.index.bytes);assert.equal(hash(raw),cfg.index.sha256);
  const index=JSON.parse(raw);assert.equal(index.key,cfg.key);assert.equal(index.packs.reduce((sum,p)=>sum+p.count,0),cfg.count);
  let next=cfg.start;const samples=[];
  for(const descriptor of index.packs){
   assert.equal(descriptor.first,next);next+=descriptor.count;
   const compressed=Buffer.from(fs.readFileSync(path.join(base,descriptor.file),'utf8').trim(),'base64');assert.equal(compressed.byteLength,descriptor.bytes);assert.equal(hash(compressed),descriptor.sha256);
   const payload=JSON.parse(zlib.gunzipSync(compressed));const rows=payload.format==='np-compact-v1'?payload.records.map(row=>ctx.NPCollectionCodec.restoreRecord(row)):payload;
   assert.equal(rows.length,descriptor.count);rows.forEach((row,i)=>{assert.equal(row.id,'P-'+String(descriptor.first+i).padStart(6,'0'));assert.equal(row.key,cfg.key);assert(row.puzzle);assert.equal(row.puzzle.kind,cfg.kind);assert.equal(row.puzzle.n,cfg.n);assert.equal(row.puzzle.level,cfg.level);if(cfg.complexity)assert.equal(row.puzzle.complexity,cfg.complexity);if(cfg.multiShape||cfg.linkedShape)assert.equal(row.puzzle.linked?.shape,cfg.multiShape||cfg.linkedShape);});
   if(!samples.length)samples.push(rows[0]);if(descriptor===index.packs.at(-1))samples.push(rows.at(-1));packs++;records+=rows.length;
  }
  for(const row of samples){const p=row.puzzle;assert.equal(ctx.NP.validate(p),true);assert.equal(p.kind,cfg.kind);assert.equal(p.n,cfg.n);assert.equal(p.level,cfg.level);if(cfg.multiShape)assert.equal(p.linked.shape,cfg.multiShape);if(cfg.linkedShape)assert.equal(p.linked.shape,cfg.linkedShape);if(cfg.complexity)assert.equal(p.complexity,cfg.complexity);opened++;}
 }catch(error){result.playable=false;result.error=error.message;failures.push(result);}
 conditions.push(result);
}
const publicConditions=conditions.filter(c=>c.scope==='nanpure'),report={catalogTotal:catalog.total,verifiedRecords:records,verifiedPacks:packs,playerSamples:opened,numberRules:new Set(publicConditions.map(c=>c.kind)).size,numberConditions:publicConditions.length,numberPuzzles:publicConditions.reduce((n,c)=>n+c.count,0),movedCrossPuzzles:conditions.filter(c=>c.scope==='pareasobi').reduce((n,c)=>n+c.count,0),unplayable:failures,conditions};
if(process.argv[2])fs.writeFileSync(path.resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,conditions:undefined},null,2));assert.equal(failures.length,0,'Catalog contains unplayable conditions');assert.equal(records,catalog.total);
