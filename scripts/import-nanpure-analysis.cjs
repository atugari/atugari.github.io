'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function refreshManifest(){
 const file=path.join(root,'nanpure/release-manifest.json');if(!fs.existsSync(file))return;
 const manifest=JSON.parse(fs.readFileSync(file,'utf8')),paths=['nanpure/collection/entry.js','nanpure/collection/entry.css','nanpure/collection/index.html'];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(entry.isFile())paths.push(path.relative(root,p).split(path.sep).join('/'));}}
 walk(path.join(root,'nanpure/learn'));for(const name of paths)manifest.files[name]=hash(fs.readFileSync(path.join(root,name)));
 fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
}
function runtime(){
 const context={console,Math,Date,performance};context.window=context;context.self=context;context.globalThis=context;vm.createContext(context);
 for(const file of ['nanpure/releases/2026.11.03.85/notebook/logical-hints.js','nanpure/learn/analyzer.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 return context.NPLabAnalyzer;
}
function validateData(data,A=runtime()){
 if(data.format!=='nanpure-analysis-v1'||data.engineVersion!==A.version||!Array.isArray(data.records)||!data.records.length||data.records.length>10000)throw Error('解析ファイルの形式・版を確認できません。');
 const seen=new Set(),ids=new Set(),records=[],sources=new Map(),codec=require('../nanpure/collection/compact-codec.js'),report={records:0,routes:0,solvedPuzzles:0,partialPuzzles:0,steps:0,techniques:{},levels:{}};
 for(const row of data.records){
  const p=row.puzzle;if(!A.supported(p))throw Error('普通の9×9以外の問題が含まれています。');
  const id='N-'+hash(JSON.stringify({kind:p.kind,n:p.n,puzzle:p.puzzle})).slice(0,20);
  if(row.id!==id||seen.has(id)||ids.has(row.sourceId)||!/^P-\d{6,}$/.test(row.sourceId))throw Error('問題の識別子が不一致、または重複しています。');
  if(!Array.isArray(row.routes)||row.routes.length!==2||new Set(row.routes.map(r=>r.strategy)).size!==2)throw Error('2通りの手順が必要です。');
  const certificate=A.exact(p);if(certificate.limited||certificate.count!==1)throw Error(row.sourceId+' の唯一解を確認できません。');
  if(!/^data\/C\d{3,8}\/\d{4,8}\.gz\.b64$/.test(row.source?.pack||'')||!/^[a-f0-9]{64}$/.test(row.source?.packHash||''))throw Error('元の問題パックの参照が不正です。');
  if(!sources.has(row.source.pack)){
   const original=Buffer.from(fs.readFileSync(path.join(root,'nanpure/collection',row.source.pack),'utf8'),'base64');
   if(hash(original)!==row.source.packHash)throw Error('元の問題パックのハッシュが一致しません。');
   const payload=JSON.parse(zlib.gunzipSync(original)),originalRows=payload.format==='np-compact-v1'?payload.records.map(codec.restoreRecord):payload;
   if(!Array.isArray(originalRows))throw Error('元の問題パックを復元できません。');sources.set(row.source.pack,{hash:hash(original),rows:new Map(originalRows.map(r=>[r.id,r]))});
  }
  const pack=sources.get(row.source.pack),original=pack.rows.get(row.sourceId)?.puzzle;
  if(pack.hash!==row.source.packHash||!original||original.kind!==p.kind||original.n!==p.n||original.level!==p.level||JSON.stringify(original.puzzle)!==JSON.stringify(p.puzzle)||(original.solution&&JSON.stringify(original.solution)!==JSON.stringify(certificate.solution)))throw Error('元の問題番号・盤面・難度・解答の対応が一致しません。');
  const routes=row.routes.map(r=>A.verify(p,r,certificate)).sort(A.rank);
  records.push({id,sourceId:row.sourceId,source:{pack:row.source.pack,packHash:row.source.packHash,catalogHash:String(row.source.catalogHash||'').slice(0,64),release:String(row.source.release||'').slice(0,80)},puzzle:{kind:'normal',n:9,level:p.level??null,puzzle:p.puzzle.slice()},routes});seen.add(id);ids.add(row.sourceId);
  report.records++;report.routes+=routes.length;report[routes.some(r=>r.status==='solved')?'solvedPuzzles':'partialPuzzles']++;report.levels[p.level]=(report.levels[p.level]||0)+1;
  for(const route of routes){report.steps+=route.steps.length;for(const [kind,count]of Object.entries(route.stats.used))report.techniques[kind]=(report.techniques[kind]||0)+count;}
 }
 return {records,report};
}
function writeDistribution(inputFile){
 const bytes=fs.readFileSync(inputFile),input=JSON.parse(bytes),A=runtime(),{records,report}=validateData(input,A);
 const out=path.join(root,'nanpure/learn/data');fs.mkdirSync(out,{recursive:true});
 const index={format:'nanpure-learning-index-v1',version:'2026.11.03.1',engineVersion:A.version,sourceSha256:hash(bytes),sourceCreatedAt:input.createdAt,counts:report,packs:[],records:[]};
 for(let offset=0;offset<records.length;offset+=32){
  const group=records.slice(offset,offset+32),payload=Buffer.from(JSON.stringify({format:'nanpure-learning-pack-v1',engineVersion:A.version,records:group}));
  const zipped=zlib.gzipSync(payload,{level:9}),sha=hash(zipped),file=String(offset/32).padStart(4,'0')+'-'+sha.slice(0,12)+'.gz.b64';
  fs.writeFileSync(path.join(out,file),zipped.toString('base64')+'\n');index.packs.push({file,bytes:zipped.length,sha256:sha,ids:group.map(r=>r.sourceId)});
  for(const row of group){const used={};for(const r of row.routes)for(const [type,n]of Object.entries(r.stats.used))used[type]=(used[type]||0)+n;
   index.records.push({id:row.sourceId,recordId:row.id,level:row.puzzle.level,clues:row.puzzle.puzzle.filter(Boolean).length,solved:row.routes.some(r=>r.status==='solved'),used,steps:row.routes.map(r=>r.steps.length),pack:file});
  }
 }
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index));
 fs.mkdirSync(path.join(root,'docs'),{recursive:true});fs.writeFileSync(path.join(root,'docs/nanpure-learning-import-20261103.json'),JSON.stringify({sourceSha256:index.sourceSha256,engineVersion:A.version,...report,compressedBytes:index.packs.reduce((n,p)=>n+p.bytes,0),packs:index.packs.length},null,2)+'\n');
 refreshManifest();
 return index;
}
if(require.main===module){if(!process.argv[2])throw Error('解析JSONのパスを指定してください。');const index=writeDistribution(path.resolve(process.argv[2]));console.log(JSON.stringify({counts:index.counts,packs:index.packs.length,compressedBytes:index.packs.reduce((n,p)=>n+p.bytes,0)}));}
module.exports={runtime,validateData,writeDistribution,refreshManifest};
