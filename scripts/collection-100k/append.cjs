// Append verified normal puzzles. Existing packs, IDs and configuration segments
// are read and checked, never regenerated. Inputs' recovery settings stay private.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {sha,publicPuzzle,writePacks}=require('./pack-writer.cjs');
const codec=require('../../nanpure/collection/compact-codec.js');
const {load}=require('./engines.cjs'),{configurations}=require('./model.cjs');
function canonical(p){
 const n=p.n;let br=p.blockRows,bc=p.blockCols,cells=Uint8Array.from(p.puzzle),best;
 for(let turn=0;turn<4;turn++){
  const direct=Buffer.concat([Buffer.from([br,bc]),Buffer.from(cells)]),mirror=Buffer.alloc(n*n+2);mirror[0]=br;mirror[1]=bc;
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)mirror[2+r*n+c]=cells[r*n+n-1-c];
  for(const value of [direct,mirror])if(!best||Buffer.compare(value,best)<0)best=value;
  const next=new Uint8Array(n*n);for(let r=0;r<n;r++)for(let c=0;c<n;c++)next[c*n+n-1-r]=cells[r*n+c];cells=next;[br,bc]=[bc,br];
 }
 return sha(best);
}
function readBackup(file){const raw=fs.readFileSync(file);let obj=JSON.parse(raw);if(obj.format==='nanpure-compressed-v1')obj=JSON.parse(zlib.inflateSync(Buffer.from(obj.data,'base64'),{maxOutputLength:536870912}));assert.equal(obj.format,'nanpure-recovery-v1');assert(Array.isArray(obj.puzzles));return{file:path.basename(file),sha256:sha(raw),puzzles:obj.puzzles};}
async function main(){
 const args=process.argv.slice(2),take=flag=>{const i=args.indexOf(flag);if(i<0)throw Error('Missing '+flag);const value=args[i+1];args.splice(i,2);return path.resolve(value);};
 const out=take('--collection'),proofFile=take('--proof'),auditFile=take('--audit');if(!args.length)throw Error('No backup files');
 const baseBytes=fs.readFileSync(path.join(out,'catalog.json')),base=JSON.parse(baseBytes),proof=JSON.parse(fs.readFileSync(proofFile));
 const {validCatalog}=await import(pathToFileURL(path.join(out,'catalog-model.mjs')));assert(validCatalog(base),'Invalid base catalog');
 const inputs=args.map(f=>readBackup(path.resolve(f))),inputMeta=inputs.map(({file,sha256,puzzles})=>({file,sha256,count:puzzles.length}));
 assert.deepEqual(proof.inputs,inputMeta,'Proof must match the exact supplied files');assert.equal(proof.solverSha256,sha(fs.readFileSync(path.join(__dirname,'normal-solver.cpp'))));
 const received=inputs.reduce((n,x)=>n+x.puzzles.length,0);assert.equal(proof.checked,received);assert.equal(proof.unique,received);assert.deepEqual(proof.invalid,[]);
 const {c}=load(),cfgs=configurations(c).filter(x=>x.kind==='normal'),wantedSizes=new Set(),groups=new Map(),seen=new Map(),aliases=[];
 for(const input of inputs)for(const p of input.puzzles){assert.equal(p.kind,'normal','Only independently verified normal puzzles are accepted');wantedSizes.add(p.n);}
 let checkedExisting=0,checkedPacks=0;
 for(const cfg of base.configs){
  const indexBytes=fs.readFileSync(path.join(out,cfg.index.file));assert.equal(indexBytes.length,cfg.index.bytes);assert.equal(sha(indexBytes),cfg.index.sha256);const index=JSON.parse(indexBytes);assert.equal(index.key,cfg.key);let next=cfg.start;
  for(const descriptor of index.packs){
   const bytes=Buffer.from(fs.readFileSync(path.join(out,descriptor.file),'utf8').trim(),'base64');assert.equal(bytes.length,descriptor.bytes);assert.equal(sha(bytes),descriptor.sha256);assert.equal(descriptor.first,next);
   const value=JSON.parse(zlib.gunzipSync(bytes)),rows=value.format==='np-compact-v1'?value.records.map(codec.restoreRecord):value;assert.equal(rows.length,descriptor.count);
   for(const record of rows){const id='P-'+String(next++).padStart(6,'0');assert.equal(record.id,id);assert.equal(record.key,cfg.key);assert.equal(record.puzzle.uid,'ready100k-'+id);assert.equal(record.puzzle.kind,cfg.kind);assert.equal(record.puzzle.n,cfg.n);checkedExisting++;
    if(cfg.kind==='normal'&&wantedSizes.has(cfg.n)){const key=canonical(record.puzzle);if(!seen.has(key))seen.set(key,{id,level:record.puzzle.level,existing:true});}
   }checkedPacks++;
  }assert.equal(next,cfg.start+cfg.count);
 }
 assert.equal(checkedExisting,base.total);
 let duplicates=0;
 for(const input of inputs)for(let sourceIndex=0;sourceIndex<input.puzzles.length;sourceIndex++){
  const p=input.puzzles[sourceIndex];c.NP.validate(p);const cfg=cfgs.find(x=>x.n===p.n&&x.level===p.level&&c.NPGenerationMatches(p,x));if(!cfg)throw Error('Unsupported configuration: '+p.n+'/'+p.level);
  const identity=canonical(p);let target=seen.get(identity),duplicate=!!target;
  if(target){assert.equal(target.level,p.level,'Duplicate difficulty conflict');duplicates++;}
  else{target={p,cfg,identity,id:null,level:p.level};seen.set(identity,target);if(!groups.has(cfg.key))groups.set(cfg.key,{cfg,rows:[]});groups.get(cfg.key).rows.push(target);}
  aliases.push({sourceFile:input.file,sourceIndex,sourceUid:p.uid,sourceId:p.id,target,duplicate});
 }
 const added=[...groups.values()].reduce((n,x)=>n+x.rows.length,0);assert(base.total+added<=999999,'Six-digit public ID capacity exceeded');
 const report={format:'collection-append-v1',inputs:inputMeta,baseline:{total:base.total,configCount:base.configs.length,catalogSha256:sha(baseBytes),configPrefixSha256:sha(JSON.stringify(base.configs))},checkedExisting,checkedPacks,received,duplicates,added,total:base.total+added,independentUniqueVerified:proof.unique,solverSha256:proof.solverSha256,maxSearchVisits:proof.maxSearchVisits,bySize:{},segments:[]};
 if(!added){fs.writeFileSync(auditFile,JSON.stringify({...report,aliases:aliases.map(({target,...a})=>({...a,siteId:target.id}))},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({added:0,total:base.total,duplicates,unchanged:true}));return;}
 const stage=fs.mkdtempSync(path.join(out,'.append-stage-')),created=[];let committed=false,reportCreated=false,reportPath;
 try{
  let serial=base.total+1,cid=Math.max(...base.configs.map(x=>Number(x.cid.slice(1))));const catalog={...base,configs:base.configs.slice()},stats={packs:0,transportBytes:0,roundtrip:0};
  for(const group of [...groups.values()].sort((a,b)=>a.cfg.n-b.cfg.n||a.cfg.level-b.cfg.level)){
   const start=serial,name='C'+String(++cid).padStart(3,'0');assert(!fs.existsSync(path.join(out,'data',name)),'New CID must not overwrite a directory');
   const rows=group.rows.map(target=>{target.id='P-'+String(serial++).padStart(6,'0');return{id:target.id,key:group.cfg.key,puzzle:publicPuzzle(target.p,target.id)}}),built=writePacks(stage,name,group.cfg.key,rows);
   catalog.configs.push({...group.cfg,cid:name,start,count:rows.length,index:built.index});report.segments.push({cid:name,key:group.cfg.key,n:group.cfg.n,level:group.cfg.level,start,count:rows.length});report.bySize[group.cfg.n]=(report.bySize[group.cfg.n]||0)+rows.length;
   for(const key of Object.keys(stats))stats[key]+=built.stats[key];
  }
  catalog.total=serial-1;assert.equal(catalog.total,report.total);assert(validCatalog(catalog));Object.assign(report,stats);
  const reportName='stock-20261031-'+sha(JSON.stringify(inputMeta)).slice(0,12)+'.json',reportText=JSON.stringify(report,null,2)+'\n';reportPath=path.join(out,'imports',reportName);assert(!fs.existsSync(reportPath));
  catalog.imports=[...(base.imports||[]),{file:'imports/'+reportName,sha256:sha(reportText),added,total:catalog.total}];
  fs.writeFileSync(path.join(stage,'catalog.json'),JSON.stringify(catalog));
  fs.writeFileSync(auditFile,JSON.stringify({...report,aliases:aliases.map(({target,...a})=>({...a,siteId:target.id}))},null,2)+'\n',{flag:'wx'});
  assert.equal(sha(fs.readFileSync(path.join(out,'catalog.json'))),sha(baseBytes),'Catalog changed during import');
  for(const segment of report.segments){const dest=path.join(out,'data',segment.cid);fs.renameSync(path.join(stage,'data',segment.cid),dest);created.push(dest);}
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,reportText,{flag:'wx'});reportCreated=true;fs.renameSync(path.join(stage,'catalog.json'),path.join(out,'catalog.json'));committed=true;
  console.log(JSON.stringify({received,duplicates,added,total:catalog.total,newSegments:report.segments.length,packs:stats.packs,transportBytes:stats.transportBytes}));
 }finally{if(!committed){for(const dir of created)fs.rmSync(dir,{recursive:true,force:true});if(reportCreated)fs.rmSync(reportPath,{force:true});}fs.rmSync(stage,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={canonical};
