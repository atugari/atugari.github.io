// Exact-cover counts are checked against both the published solver and a separate engine.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function model(file){const c={Math,Date};c.globalThis=c;vm.runInNewContext(fs.readFileSync(file,'utf8'),c);return c.NPPatternModel;}
const current=model('scripts/client-overrides/public/notebook/pattern-model.js'),previous=model('nanpure/releases/2026.11.01.72/notebook/pattern-model.js'),{c}=require('./collection-100k/engines.cjs').load();
const base='872156934694328517351497628218739465467581392935264871583972146129645783746813259'.split('').map(Number),cases=[];
let seed=73;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
for(let t=0;t<120;t++){const ids=Array.from({length:81},(_,i)=>i);for(let i=80;i;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}const selected=new Set(ids.slice(0,[17,21,26,32,40][t%5]));cases.push(base.map((v,i)=>selected.has(i)?v:0));}
const seventeen='000000010400000000020000000000050407008000300001090000300400200050100000000806000'.split('').map(Number);assert.equal(current.solve(seventeen).count,1);cases.push(seventeen);
const report={cases:cases.length,previous:{milliseconds:0,nodes:0},exactCover:{milliseconds:0,nodes:0}};
for(const puzzle of cases){
 let start=performance.now();const a=previous.solve(puzzle,{maxNodes:2000000});report.previous.milliseconds+=performance.now()-start;report.previous.nodes+=a.nodes;
 start=performance.now();const b=current.solve(puzzle,{maxNodes:2000000});report.exactCover.milliseconds+=performance.now()-start;report.exactCover.nodes+=b.nodes;
 const independent=c.Nanpure.countSolutions(Array.from({length:9},(_,r)=>puzzle.slice(r*9,r*9+9)),2);
 assert(!a.aborted&&!b.aborted);assert.equal(b.count,a.count);assert.equal(b.count,independent);assert(b.solution.every((v,i)=>!puzzle[i]||puzzle[i]===v));
}
// Nonconflicting but unsatisfiable givens must be rejected as zero solutions.
let unsatisfiable=false;
for(let i=0;i<81&&!unsatisfiable;i++)if(seventeen[i])for(let v=1;v<=9;v++){if(v===seventeen[i])continue;const p=seventeen.slice();p[i]=v;const r=current.solve(p);if(r.invalid||r.count)continue;assert.equal(c.Nanpure.countSolutions(Array.from({length:9},(_,r)=>p.slice(r*9,r*9+9)),2),0);unsatisfiable=true;break;}
assert(unsatisfiable);assert(current.solve(seventeen,{maxNodes:0}).aborted);assert(current.solve(seventeen,{deadline:0}).aborted);assert(current.solve(Array(80).fill(0)).invalid);
for(const name of ['heart','diamond','dots','omit'])for(let operation=0;operation<8;operation++){
 const mask=current.transform(current.presets[name],operation),r=current.search(mask,name==='omit'?9:0,{milliseconds:5000,maxAttempts:30});assert.equal(r.state,'ready');assert(current.validate(r));assert.deepEqual(Array.from(r.puzzle,Boolean),Array.from(mask,Boolean));
 assert.equal(new Set(Array.from({length:81},(_,i)=>current.transformIndex(i,operation))).size,81);
}
let mask=Array.from(current.presets.heart);for(let t=0;t<4;t++)mask=current.transform(mask,1);assert.deepEqual(Array.from(mask),Array.from(current.presets.heart));
for(const operation of [4,6])assert.deepEqual(Array.from(current.transform(current.transform(current.presets.heart,operation),operation)),Array.from(current.presets.heart));
assert.deepEqual(Array.from(current.symmetricCells(0,'horizontal')),[0,8]);assert.deepEqual(Array.from(current.symmetricCells(0,'vertical')),[0,72]);assert.deepEqual(Array.from(current.symmetricCells(0,'point')),[0,80]);assert.equal(current.symmetricCells(40,'both').length,1);
assert.equal(current.analyze(Array.from({length:81},(_,i)=>i<16)).needed,1);
const rows=current.analyze(Array.from({length:81},(_,i)=>i>=18&&i<80));assert.deepEqual(Array.from(rows.indices),[0,1]);assert.equal(rows.cells.length,18);assert.equal(rows.needed,1);
const digit=current.analyze(current.presets.diamond,9);assert.equal(digit.unit,'row');assert.equal(digit.index,4);assert.equal(digit.cells.length,9);
assert.throws(()=>current.transform(mask,8));assert.throws(()=>current.symmetricCells(81,'none'));
for(const record of [report.previous,report.exactCover])record.milliseconds=Math.round(record.milliseconds);
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({...report,note:'One local run; timings depend on the machine. Counts agree with two independent implementations.'},null,2)+'\n');
console.log('PASS pattern mathematics: '+JSON.stringify(report)+'; 32 transformed presets; symmetry; diagnostic coordinates; zero/one/multiple solutions; deadline and node limits.');
