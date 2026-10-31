const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const codec=require('../../nanpure/collection/compact-codec.js');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function publicPuzzle(p,id){
 const puzzle={...p,uid:'ready100k-'+id,grid:p.puzzle.slice(),notes:{},elapsed:0,completed:false};
 for(const key of ['batchToken','batchJob','created','printedAt','updated','mistakeCount','titleRevealed','video'])delete puzzle[key];
 return puzzle;
}
function writePacks(out,cid,key,rows){
 const dir=path.join(out,'data',cid);fs.mkdirSync(path.dirname(dir),{recursive:true});fs.mkdirSync(dir);
 const packs=[],stats={roundtrip:0,packs:0,packBytes:0,transportBytes:0,maxDecodedPackBytes:0,maxCompressedPackBytes:0};let batch=[];
 function flush(){
  if(!batch.length)return;
  const plain=JSON.stringify(batch),small=JSON.stringify({format:'np-compact-v1',records:batch.map(codec.compactRecord)}),a=zlib.gzipSync(plain,{level:9}),b=zlib.gzipSync(small,{level:9}),bytes=a.length<=b.length?a:b;
  const restored=JSON.parse(zlib.gunzipSync(bytes)),decoded=restored.format==='np-compact-v1'?restored.records.map(codec.restoreRecord):restored;assert.deepEqual(decoded,batch);
  const file='data/'+cid+'/'+String(packs.length).padStart(4,'0')+'.gz.b64';fs.writeFileSync(path.join(out,file),bytes.toString('base64'),{flag:'wx'});
  packs.push({file,first:Number(batch[0].id.slice(2)),count:batch.length,bytes:bytes.length,sha256:sha(bytes)});
  stats.roundtrip+=batch.length;stats.packs++;stats.packBytes+=bytes.length;stats.transportBytes+=Buffer.byteLength(bytes.toString('base64'));stats.maxDecodedPackBytes=Math.max(stats.maxDecodedPackBytes,Buffer.byteLength(plain));stats.maxCompressedPackBytes=Math.max(stats.maxCompressedPackBytes,bytes.length);batch=[];
 }
 for(const row of rows){if(batch.length&&Buffer.byteLength(JSON.stringify([...batch,row]))>131072)flush();batch.push(row);if(batch.length===32)flush();}
 flush();const text=JSON.stringify({key,packs}),file='data/'+cid+'/index.json';fs.writeFileSync(path.join(out,file),text,{flag:'wx'});
 return{index:{file,bytes:Buffer.byteLength(text),sha256:sha(text)},packs,stats};
}
module.exports={sha,publicPuzzle,writePacks};
