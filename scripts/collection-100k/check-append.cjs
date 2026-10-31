const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {sha}=require('./pack-writer.cjs'),codec=require('../../nanpure/collection/compact-codec.js');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'nanpure/collection');
async function main(){
 const {validCatalog}=await import(pathToFileURL(path.join(out,'catalog-model.mjs'))),catalog=JSON.parse(fs.readFileSync(path.join(out,'catalog.json')));
 assert(validCatalog(catalog));for(const bad of [null,{...catalog,total:catalog.total+1},{...catalog,configs:[null]},{...catalog,configs:[{...catalog.configs[0],start:2}]}])assert(!validCatalog(bad));
 const imports=catalog.imports||[];if(!imports.length){console.log('PASS initial collection catalog');return;}
 const last=imports[imports.length-1],reportBytes=fs.readFileSync(path.join(out,last.file));assert.equal(sha(reportBytes),last.sha256);const report=JSON.parse(reportBytes);
 assert.equal(sha(JSON.stringify(catalog.configs.slice(0,report.baseline.configCount))),report.baseline.configPrefixSha256,'Original configuration metadata and ID ranges are unchanged');
 assert.equal(report.total,catalog.total);assert.equal(report.added,last.added);assert.equal(report.checkedExisting,report.baseline.total);
 const newRecords=[];let checked=0;
 for(const cfg of catalog.configs){
  const indexBytes=fs.readFileSync(path.join(out,cfg.index.file));assert.equal(indexBytes.length,cfg.index.bytes);assert.equal(sha(indexBytes),cfg.index.sha256);const index=JSON.parse(indexBytes);assert.equal(index.key,cfg.key);let next=cfg.start;
  for(const pack of index.packs){
   const encoded=fs.readFileSync(path.join(out,pack.file),'utf8').trim(),bytes=Buffer.from(encoded,'base64');assert.equal(bytes.toString('base64'),encoded);assert.equal(bytes.length,pack.bytes);assert.equal(sha(bytes),pack.sha256);assert.equal(pack.first,next);
   const payload=JSON.parse(zlib.gunzipSync(bytes)),rows=payload.format==='np-compact-v1'?payload.records.map(codec.restoreRecord):payload;assert.equal(rows.length,pack.count);
   for(const row of rows){assert.equal(row.id,'P-'+String(next++).padStart(6,'0'));assert.equal(row.key,cfg.key);assert.equal(row.puzzle.uid,'ready100k-'+row.id);checked++;if(Number(row.id.slice(2))>report.baseline.total)newRecords.push(row);}
  }assert.equal(next,cfg.start+cfg.count);
 }
 assert.equal(checked,catalog.total);assert.equal(newRecords.length,report.added);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'normal-collection-check-'));
 try{
  const solver=path.join(temp,'solver');execFileSync('g++',['-O3','-std=c++17',path.join(__dirname,'normal-solver.cpp'),'-o',solver]);
  const answer=[1,2,3,4,3,4,1,2,2,1,4,3,4,3,2,1],solutions=[];
  function enumerate(grid){const i=grid.indexOf(0);if(i<0){solutions.push(grid.slice());return;}const r=i>>2,c=i%4;for(let v=1;v<=4;v++){let legal=true;for(let k=0;k<4;k++)if(grid[r*4+k]===v||grid[k*4+c]===v||grid[(Math.floor(r/2)*2+Math.floor(k/2))*4+Math.floor(c/2)*2+k%2]===v)legal=false;if(legal){grid[i]=v;enumerate(grid);grid[i]=0;}}}
  enumerate(Array(16).fill(0));assert.equal(solutions.length,288);
  let random=20261031;const cases=[];for(let k=0;k<512;k++){random=(Math.imul(random,1664525)+1013904223)>>>0;const mask=k===0?0:k===1?65535:random&65535,puzzle=answer.map((v,i)=>mask&(1<<i)?v:0),expected=Math.min(2,solutions.filter(s=>puzzle.every((v,i)=>!v||s[i]===v)).length);cases.push({puzzle,solution:answer,n:4,blockRows:2,blockCols:2,expected});}
  const encode=p=>[p.n,p.blockRows,p.blockCols,...p.puzzle,...p.solution].join(' ')+'\n';
  const small=execFileSync(solver,[],{input:cases.map(encode).join(''),encoding:'utf8',maxBuffer:1024*1024}).trim().split('\n');assert.equal(small.length,cases.length);small.forEach((line,i)=>assert.equal(line.split(' ')[0],String(cases[i].expected),'Exact-cover result matches exhaustive 4x4 truth'));
  const output=execFileSync(solver,[],{input:newRecords.map(r=>encode(r.puzzle)).join(''),encoding:'utf8',maxBuffer:16*1024*1024,timeout:600000}).trim().split('\n');assert.equal(output.length,newRecords.length);
  output.forEach((line,i)=>assert.equal(line.split(' ')[0],'1','Independent uniqueness: '+newRecords[i].id+' '+line));
  console.log('PASS append: '+checked+' pack records and checksums, immutable original configuration prefix, '+newRecords.length+' independently unique new boards; solver checked against 512 subsets of all 288 valid 4x4 solutions.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1});
