// Compare optimized logical solving with the immutable .99 release.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(project+'/nanpure/version.json')).version;
const html=fs.readFileSync(project+'/nanpure/releases/'+version+'/notebook/index.html','utf8');
function context(file){const ctx=vm.createContext({console,Date,performance,setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,Uint16Array,Uint32Array,Int32Array,ArrayBuffer,DataView,atob,btoa});ctx.self=ctx;ctx.window=ctx;for(const id of ['core-normal','core-rect','core-variants','core-multi','common-source','generator-source'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1],ctx);vm.runInContext(fs.readFileSync(file,'utf8').replace('multi.maxBoards = maxBoards;','multi.completedMixed = completed; multi.maxBoards = maxBoards;'),ctx);return ctx;}
const before=context(project+'/nanpure/releases/2026.11.05.99/notebook/mixed-multi.js'),after=context(project+'/nanpure/releases/'+version+'/notebook/mixed-multi.js');
let seed=324681;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const scenarios=Array.from(before.NanpureMulti.mixedSizes,n=>[[n,9],[{parent:0,corner:'se'}]]);
for(const rule of ['normal','diagonal','hyper','antiknight','antiking','disjoint'])scenarios.push([[9,9],[{parent:0,dx:6,dy:6}],['normal',rule]]);
scenarios.push([[4,4],[{parent:0,dx:1,dy:1}]],[[9,9,9,9],[{parent:0,dx:6,dy:0},{parent:0,dx:0,dy:6},{parent:1,dx:0,dy:6}]]);
let count=0;const differences=[];
for(const [sizes,links,rules] of scenarios){
 const linked=before.NanpureMulti.mixedLayout('custom',sizes,links,rules),solution=before.NanpureMulti.completedMixed(linked,random,Date.now()+10000);assert(solution);
 for(let sample=0;sample<10;sample++){
  const density=sample===0?1:random()*.8+.1,puzzle=Array.from(solution,v=>random()<density?v:0);
  if(sample%3===1){const b=linked.boards[0];puzzle[b.map[0]]=solution[b.map[0]];puzzle[b.map[1]]=solution[b.map[0]];}
  if(sample===8)puzzle[linked.boards[0].map[0]]=sizes[0]+1;
  const p={linked,puzzle},clone=JSON.stringify(p);
  for(let cap=1;cap<=4;cap++){
   const a=before.NanpureMulti.solve(p,cap),b=after.NanpureMulti.solve(p,cap),snapshot=JSON.stringify(b);
   after.NanpureMulti.solve({...p,puzzle:Array.from(solution)},cap);assert.equal(JSON.stringify(b),snapshot,'returnedresultbufferaliased');assert.equal(JSON.stringify(p),clone,'solvechangedinput');
   const normal=x=>Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)));
   if(JSON.stringify(normal(a))!==JSON.stringify(normal(b))){differences.push({sizes,rules,links,sample,cap,before:a,after:b,puzzle});if(differences.length<=3)console.error('Solver result changed',JSON.stringify({sizes,rules,sample,cap}));}
   count++;
  }
 }
}
console.log(JSON.stringify({count,differences:differences.length}));if(differences.length)process.exitCode=1;
