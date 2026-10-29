const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert/strict');
const repo=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||'nanpure/collection');fs.mkdirSync(out,{recursive:true});if(process.argv.length<4)throw Error('Usage: node scripts/collection-100k/build.cjs OUTPUT BACKUP...');
const {c}=require('./engines.cjs').load(),{configurations,fingerprint}=require('./model.cjs'),codec=require(repo+'/nanpure/collection/compact-codec.js');
const configs=configurations(c).filter(x=>x.game==='number'),candidates=new Map();
for(const cfg of configs){const k=[cfg.kind,cfg.n,cfg.level].join(':');if(!candidates.has(k))candidates.set(k,[]);candidates.get(k).push(cfg);}
const groups=new Map(),seen=new Set(),report={inputs:[],duplicates:0,excluded:0,total:0,packs:0,packBytes:0,transportBytes:0,roundtrip:0,configs:0};
for(const file of process.argv.slice(3)){
 const raw=fs.readFileSync(path.resolve(file));let d=JSON.parse(raw);if(d.format==='nanpure-compressed-v1')d=JSON.parse(zlib.inflateSync(Buffer.from(d.data,'base64')));
 report.inputs.push({file:path.basename(file),count:d.puzzles.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});
 for(const p of d.puzzles){const fp=fingerprint(c,p,{game:'number'});if(seen.has(fp)){report.duplicates++;continue}seen.add(fp);
  const cfg=(candidates.get([p.kind,p.n,p.level].join(':'))||[]).find(x=>c.NPGenerationMatches(p,x));if(!cfg)throw Error('No matching configuration: '+JSON.stringify([p.kind,p.n,p.level]));
  if(!groups.has(cfg.key))groups.set(cfg.key,{cfg,rows:[]});groups.get(cfg.key).rows.push({p,fp});
 }console.log('Read '+file+': '+d.puzzles.length);
}
// Keep every available configuration; trim only the largest configuration groups.
let count=seen.size;while(count>100000){let largest;for(const g of groups.values())if(!largest||g.rows.length>largest.rows.length)largest=g;largest.rows.pop();count--;report.excluded++;}
assert.equal(count,100000);const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest={format:2,total:count,packSize:32,release:'2026.10.27.65',configs:[]};let serial=1,groupNo=0,maxDecoded=0,maxPacked=0;
for(const g of groups.values()){
 const cid='C'+String(++groupNo).padStart(3,'0'),start=serial,packs=[];let batch=[];
 fs.mkdirSync(path.join(out,'data',cid),{recursive:true});
 function flush(){if(!batch.length)return;const plain=JSON.stringify(batch),small=JSON.stringify({format:'np-compact-v1',records:batch.map(codec.compactRecord)}),a=zlib.gzipSync(plain,{level:9}),b=zlib.gzipSync(small,{level:9}),bytes=a.length<=b.length?a:b;
  const restored=JSON.parse(zlib.gunzipSync(bytes)),rows=restored.format==='np-compact-v1'?restored.records.map(codec.restoreRecord):restored;assert.deepEqual(rows,batch);report.roundtrip+=batch.length;
  const file='data/'+cid+'/'+String(packs.length).padStart(4,'0')+'.gz.b64';fs.writeFileSync(path.join(out,file),bytes.toString('base64'));
  packs.push({file,first:Number(batch[0].id.slice(2)),count:batch.length,bytes:bytes.length,sha256:sha(bytes)});report.packs++;report.packBytes+=bytes.length;report.transportBytes+=Buffer.byteLength(bytes.toString('base64'));maxDecoded=Math.max(maxDecoded,Buffer.byteLength(plain));maxPacked=Math.max(maxPacked,bytes.length);batch=[];
 }
 for(const {p,fp}of g.rows){const id='P-'+String(serial++).padStart(6,'0');const puzzle={...p,uid:'ready100k-'+id,grid:p.puzzle.slice(),notes:{},elapsed:0,completed:false};delete puzzle.batchToken;delete puzzle.batchJob;delete puzzle.created;delete puzzle.printedAt;
  const row={id,key:g.cfg.key,puzzle};if(batch.length&&Buffer.byteLength(JSON.stringify([...batch,row]))>131072)flush();batch.push(row);if(batch.length===32)flush();
 }flush();const index=JSON.stringify({key:g.cfg.key,packs}),file='data/'+cid+'/index.json';fs.writeFileSync(path.join(out,file),index);
 manifest.configs.push({...g.cfg,cid,start,count:g.rows.length,index:{file,bytes:Buffer.byteLength(index),sha256:sha(index)}});
}
assert.equal(serial-1,100000);fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(manifest));
Object.assign(report,{total:100000,configs:groups.size,maxDecodedPackBytes:maxDecoded,maxCompressedPackBytes:maxPacked,catalogBytes:fs.statSync(path.join(out,'catalog.json')).size});
fs.writeFileSync(path.join(out,'build-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
