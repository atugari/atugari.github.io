// Same finite resolution18 search work; candidate changes only the exact9 counter.
// Run: node scripts/fixtures/nanpure-resolution-prefix.cjs baseline aBc12 20
// Then: node scripts/fixtures/nanpure-resolution-prefix.cjs candidate aBc12 20
const path=require('node:path'),root=path.resolve(__dirname,'../..');
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),html=fs.readFileSync(path.join(root,'nanpure/releases/2026.11.05.99/notebook/index.html'),'utf8'),mode=process.argv[2]||'candidate',seed=process.argv[3]||'aBc12',rounds=Number(process.argv[4])||20;
const c=vm.createContext({console,performance,Date,TextEncoder,TextDecoder,Uint8Array,Uint16Array,Uint32Array,Int32Array,Float64Array,ArrayBuffer,DataView,crypto:crypto.webcrypto,atob,btoa});c.window=c;c.self=c;c.global=c;
for(const m of html.matchAll(/<script id="(core-[^"]+|common-source|generator-source)">([\s\S]*?)<\/script>/g))vm.runInContext(m[2],c,{filename:m[1]+'.js'});
if(mode==='candidate')vm.runInContext(fs.readFileSync(path.join(root,'scripts/client-overrides/public/notebook/unique-solver.js'),'utf8'),c);
const probeHash=crypto.createHash('sha256'),solveHash=crypto.createHash('sha256');let probes=0,solves=0,progress=0,uniqueMs=0,solveMs=0;
const oldUnique=c.Nanpure.hasUniqueSolution,oldSolve=c.NanpureResolutionLogic.solve;
c.Nanpure.hasUniqueSolution=grid=>{const start=performance.now();const value=oldUnique(grid);uniqueMs+=performance.now()-start;probes++;probeHash.update(grid.flat().join('')+':'+value+'\n');return value;};
c.NanpureResolutionLogic.solve=(info,grid,level,trace)=>{const start=performance.now();const result=oldSolve(info,grid,level,trace);solveMs+=performance.now()-start;solves++;solveHash.update(grid.join('')+':'+level+':'+result.solved+':'+result.hardest+'\n');return result;};
const start=performance.now();let puzzle;
try{puzzle=c.NanpureResolution.generate(seed,()=>{if(++progress>rounds)throw Object.assign(Error('PREFIX_COMPLETE'),{code:'PREFIX_COMPLETE'});},{budgetMs:3600000});}catch(e){if(e.code!=='PREFIX_COMPLETE')throw e;}
console.log(JSON.stringify({mode,seed,rounds:Math.min(progress,rounds),status:puzzle?'generated':'prefix',ms:performance.now()-start,probes,solves,uniqueMs,solveMs,probeHash:probeHash.digest('hex'),solveHash:solveHash.digest('hex'),heapMB:process.memoryUsage().heapUsed/1048576,peakRSSKB:process.resourceUsage().maxRSS}));
if(puzzle)console.log(JSON.stringify({id:puzzle.id,puzzleSHA256:crypto.createHash('sha256').update(JSON.stringify(puzzle)).digest('hex')}));
