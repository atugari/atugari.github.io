// Exercise the shipped engine, worker sources, helper models, saves and print assets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const base=path.join(root,'nanpure/releases',version,'notebook'),html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const flower=require('./fixtures/multi-recorded-flower.json');
for(const name of ['app.js','common.js','batch.js','portable.js','memo-help.js','logical-hints.js','video-features.js','mixed-multi.js'])assert(!/["'(]\/(?:notebook|audio|themes)\//.test(fs.readFileSync(path.join(base,name),'utf8')),'origin-root asset path escaped the release: '+name);
const ctx=vm.createContext({console,Date,performance,TextDecoder,TextEncoder,Uint8Array,Uint16Array,ArrayBuffer,DataView,atob,btoa,setTimeout,clearTimeout});ctx.window=ctx;ctx.self=ctx;
for(const id of ['core-normal','core-rect','core-variants','core-multi','common-source','generator-source','core-mixed-multi']){
 const source=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))?.[1];assert(source,`worker source ${id}`);vm.runInContext(source,ctx,{filename:id});
}
for(const name of ['batch.js','logical-hints.js','memo-help.js','pako.min.js','compact.js','print-layout.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),ctx,{filename:name});
function verifyWitness(p, witness) {
 const {board,cell,digits}=witness,b=p.linked.boards[board],at=b.map.indexOf(cell);
 assert(at>=0&&p.linked.boards.filter(item=>item.map.includes(cell)).length>1);
 assert.equal(p.puzzle[cell],0);
 assert.equal(digits[0],p.solution[cell]);
 assert.notEqual(digits[0],digits[1]);
 const local={...b,x:0,y:0,map:Array.from({length:b.n*b.n},(_,i)=>i)};
 const linked={boards:[local],cells:local.map.map(i=>({x:i%b.n,y:Math.floor(i/b.n)}))};
 const givens=b.map.map(i=>p.puzzle[i]);givens[at]=digits[1];
 const result=ctx.NanpureMulti.exact({puzzle:givens,linked},1000);
 assert(!result.timeout&&result.count>0,'isolated board has a completion changing this shared blank');
 assert.equal(result.solution[at],digits[1]);
}
function verifyDependencies(p) {
 const witnesses=p.verification.sharedWitnesses;
 assert.deepEqual(Array.from(new Set(witnesses.map(w=>w.board))).sort((a,b)=>a-b),
   Array.from(p.linked.boards,(_,i)=>i),'every physical board, including the first, needs a shared blank');
 for(const w of witnesses)verifyWitness(p,w);
}
// For a one-cell 4x4 chain we can count solutions without calling either
// shipped solver. Tabulate all 288 local completions, then join on the shared
// value. The counts at a boundary include every compatible prefix, capped at 2.
function fourByFourCompletions(){
 const completions=[],grid=[];
 function fill(i){
  if(i===16){completions.push(grid.slice());return;}
  const row=Math.floor(i/4),col=i%4;
  for(let v=1;v<=4;v++){
   let ok=true;
   for(let j=0;j<i;j++){
    const r=Math.floor(j/4),c=j%4;
    if(grid[j]===v&&(row===r||col===c||(row>>1)===(r>>1)&&(col>>1)===(c>>1))){ok=false;break;}
   }
   if(ok){grid[i]=v;fill(i+1);}
  }
 }
 fill(0);assert.equal(completions.length,288);return completions;
}
const fours=fourByFourCompletions();
function verifyFourChain(p){
 const boards=p.linked.boards;
 assert.equal(p.puzzle.length,15*boards.length+1);
 let ways=[1,0,0,0,0];
 for(const [i,b] of boards.entries()){
  assert.equal(b.n,4);
  if(i)assert.equal(b.map[0],boards[i-1].map[15],'SE-to-NW one-cell chain');
  const clues=b.map.map(j=>p.puzzle[j]),remaining=fours.filter(g=>clues.every((v,j)=>!v||g[j]===v));
  assert(remaining.some(g=>(i>0&&g[0]!==p.solution[b.map[0]]) || (i<boards.length-1&&g[15]!==p.solution[b.map[15]])),
    'an alternate isolated completion changes a shared corner on board '+i);
  const next=[0,0,0,0,0];
  for(const g of remaining){
   const out=i===boards.length-1?0:g[15];
   next[out]=Math.min(2,next[out]+ways[i?g[0]:0]);
  }
  ways=next;
 }
 assert.equal(ways[0],1,'exact global count obtained by joining local completions');
}
function verifyRating(p) {
 assert.equal(p.rating.level,p.level);
 assert.equal(p.rating.noGuess,true);
 assert.equal(p.rating.unique,true);
 const clues=p.puzzle.filter(Boolean).length;
 assert.equal(p.rating.clues,clues);
 if(p.level<=2)assert.equal(clues,Math.round(p.puzzle.length*(p.level===1?.65:.42)));
 const cap=ctx.NanpureMulti.caps[p.level-1],proof=ctx.NanpureMulti.solve(p,cap);
 assert(proof.solved);assert.equal(proof.hardest,p.rating.hardest);
 assert.deepEqual(Array.from(proof.grid),Array.from(p.solution));
 if(p.level>=3)assert.equal(ctx.NanpureMulti.solve(p,cap-1).solved,false);
}
function verify(p){
 assert.equal(ctx.NP.validate(p),true);
 // Check each physical board directly, without using the engine's unit builder.
 for(const b of p.linked.boards){
  const n=b.n,expected=Array.from({length:n},(_,i)=>i+1).join(',');
  const check=ids=>assert.equal(ids.map(i=>p.solution[i]).sort((a,b)=>a-b).join(','),expected);
  for(let r=0;r<n;r++)check(Array.from({length:n},(_,c)=>b.map[r*n+c]));
  for(let c=0;c<n;c++)check(Array.from({length:n},(_,r)=>b.map[r*n+c]));
  for(let r=0;r<n;r+=b.blockRows)for(let c=0;c<n;c+=b.blockCols)check(Array.from({length:n},(_,i)=>b.map[(r+Math.floor(i/b.blockCols))*n+c+i%b.blockCols]));
 }
 const exact=ctx.NanpureMulti.exact(p,3000);assert.equal(exact.timeout,false);assert.equal(exact.count,1);assert.deepEqual(Array.from(exact.solution),Array.from(p.solution));
 verifyRating(p);
 assert(ctx.NanpureMulti.needsShared(p));assert(p.puzzle.some(v=>v===0));
 verifyDependencies(p);
 p.grid=p.puzzle.slice();p.notes={};p.uid='mixed-test-'+p.id;p.elapsed=0;p.completed=false;
 const model=ctx.NPLogicalHints.model(p);assert.equal(model.invalid,false);assert(model.units.every(u=>p.linked.boards.some(b=>u.ids.length===b.n)));
 const memo=ctx.NPMemo.candidates(p);
 for(let i=0;i<p.grid.length;i++)if(!p.grid[i]){assert(model.candidates[i].includes(p.solution[i]));assert(memo[i].includes(p.solution[i]));assert(model.candidates[i].every(v=>v<=ctx.NanpureMulti.cellMax(p,i)));}
 const restored=ctx.NPCompact.parse(ctx.NPCompact.stringify({format:'nanpure-chou-v3',puzzles:[p]})).puzzles[0];assert.equal(ctx.NP.validate(restored),true);assert.equal(JSON.stringify(restored),JSON.stringify(p));
 const printed=ctx.NPPrint.buildPrint([p],{paper:'A4',mode:'single',answers:'yes'});assert.equal(printed.pages.length,2);assert(printed.pages.every(page=>page.includes('data-multi-blocks')));assert(printed.pages[0].includes('A '));assert(!printed.pages[0].includes('各9×9で普通のルール'));assert(printed.pages[0].includes('各盤面の大きさに合わせたルール'));
 // A free layout may be taller than it is wide; the print viewport must contain
 // every physical cell, including the last board, for all packing modes.
 const extent=Math.max(p.linked.width,p.linked.height);
 assert.equal(ctx.NP.extent(p),extent,'print extent contains the full layout');
 const board=ctx.NPPrint.board(p,false,0,0,1);
 const view=board.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
 assert(view[0]+view[2]>=p.linked.width*40&&view[1]+view[3]>=p.linked.height*40,'print viewport contains every board');
 for(const mode of ['single','multi','compact','booklet','tile']){
  const settings={paper:'A4',mode,answers:'yes',cols:2,rows:2,tileCols:2,tileRows:2};
  const plan=ctx.NPPrint.plan([p],settings);
  assert(plan.metrics[0].cellMm*(extent+.08)<=((mode==='tile')?Infinity:plan.pages[0].g?.boardMm||plan.logicalPages[0].g.boardMm)+1e-5);
  if(mode==='tile'){
   const tiles=plan.pages.filter(page=>!page.sol);
   assert.equal(Math.max(...tiles.map(page=>page.c1)),extent);
   assert.equal(Math.max(...tiles.map(page=>page.r1)),extent);
  }
 }
 const markup=ctx.NP.svgBoard(p,false);assert(markup.includes(p.linked.width*40+4));assert(markup.includes('data-multi-blocks'));assert(markup.includes('A '));
}
let generated=0,finderPuzzle;
// Exercise both sides of the 20-board algorithm boundary and maximum size.
// Pass --all-counts to generate every allowed count and run the same oracle.
const chainCounts=process.argv.includes('--all-counts')?Array.from({length:299},(_,i)=>i+2):[2,20,21,299,300];
for(const count of chainCounts)for(const level of count===300?[1,2]:[1]){
 const sizes=Array(count).fill(4),id='FOUR-CHAIN-'+count+'-'+level;
 const p=ctx.NanpureMulti.generateMixed('custom',sizes,level,id,null,60000);
 assert.equal(p.id,id);assert.equal(p.level,level);assert.equal(p.linked.boards.length,count);
 assert.equal(ctx.NP.validate(p),true);verifyRating(p);verifyDependencies(p);verifyFourChain(p);
 generated++;
}
{
 const sizes=Array.from({length:300},(_,i)=>[4,6,9][i%3]);
 const links=sizes.slice(1).map((_,i)=>({parent:i,corner:'se'}));
 const p=ctx.NanpureMulti.generateMixed('custom',sizes,1,'MIXED-CLUE-QUOTA',null,60000,links);
 assert.equal(ctx.NP.validate(p),true);
 verifyRating(p);verifyDependencies(p);
 const result=ctx.NanpureMulti.exact(p,15000);
 assert.equal(result.timeout,false);assert.equal(result.count,1);
 generated++;
}
// 20 by 15 block-aligned grid: many cycles and cells owned by four boards.
{
 const sizes=Array(300).fill(9);
 const links=sizes.slice(1).map((_,i)=>({parent:0,dx:6*((i+1)%20),dy:6*Math.floor((i+1)/20)}));
 const p=ctx.NanpureMulti.generateMixed('custom',sizes,1,'GRID-300',null,60000,links);
 assert(ctx.NP.validate(p));verifyRating(p);verifyDependencies(p);
 const check=ctx.NanpureMulti.exact(p,15000);assert(!check.timeout);assert.equal(check.count,1);
 generated++;
}
for(const n of ctx.NanpureMulti.mixedSizes){const p=ctx.NanpureMulti.generateMixed('pair',[n,9],1,'SIZE-'+n,null,5000);verify(p);generated++;}
for(let level=2;level<=5;level++){const p=ctx.NanpureMulti.generateMixed('pair',[4,9],level,'LV-'+level,null,10000);verify(p);assert.equal(p.level,level);if(level>=3)assert.equal(ctx.NanpureMulti.solve(p,ctx.NanpureMulti.caps[level-1]-1).solved,false);generated++;}
for(const [shape,ns] of [['relay',[4,9,6]],['samurai',[9,4,6,8,9]]]){verify(ctx.NanpureMulti.generateMixed(shape,ns,1,'SHAPE-'+shape,null,5000));generated++;}
for(let count=2;count<=8;count++){
 const ns=Array.from({length:count},(_,i)=>[4,6,9][i%3]),links=ns.slice(1).map((_,i)=>({parent:i,corner:i%2?'sw':'se'}));
 const p=ctx.NanpureMulti.generateMixed('custom',ns,1,'FREE-'+count,null,5000,links);verify(p);generated++;
 const cfg={kind:'multi',n:Math.max(...ns),level:1,multiShape:'custom',multiSizes:ns,multiLinks:links,count:1};
 assert(ctx.NPGenerationMatches(p,cfg));assert(!ctx.NPGenerationMatches(p,{...cfg,multiSizes:ns.slice().reverse()} )||ns.join()===ns.slice().reverse().join());
 assert(ctx.NPBatch.valid(cfg));const saved={version:1,token:'test',jobs:[cfg],cursor:0,bulk:false,cfg};assert.equal(ctx.NPBatch.restore(JSON.stringify(saved),[],null).jobs[0].multiLinks.length,count-1);
 const invalid=JSON.parse(JSON.stringify(p));invalid.linked.boards[0].n=100;assert.throws(()=>ctx.NP.validate(invalid));
 const empty=p.grid.findIndex((v,i)=>!v&&ctx.NanpureMulti.cellMax(p,i)<p.n);if(empty>=0){p.grid[empty]=p.n;ctx.NP.sanitizeProgress(p);assert.equal(p.grid[empty],p.puzzle[empty]);}
}
for(const [ns,links,id] of [
 [[9,9],[{parent:0,dx:6,dy:6}],'BLOCK'],
 [[9,9],[{parent:0,dx:6,dy:0}],'WIDE'],
 [[9,9],[{parent:0,dx:0,dy:6}],'TALL'],
 [[9,9],[{parent:0,dx:5,dy:5}],'DRAG'],
 [[4,4],[{parent:0,dx:1,dy:1}],'LARGE-OVERLAP'],
 [[4,6],[{parent:0,dx:3,dy:2}],'MIXED-OFFSET'],
 [[9,9,9],[{parent:0,dx:6,dy:0},{parent:0,dx:3,dy:6}],'TRIPLE'],
 [[9,9,9,9],[{parent:0,dx:6,dy:0},{parent:0,dx:0,dy:6},{parent:1,dx:0,dy:6}],'FOUR-CYCLE'],
 // The recording's D board overlaps C and F, but not its coordinate reference A.
 [flower.sizes,flower.links,'RECORDED-FLOWER'],
 // A later board may bridge two earlier boards which do not overlap each other.
 [[9,9,9],[{parent:0,dx:12,dy:0},{parent:0,dx:6,dy:0}],'LATER-BRIDGE']
]){
 const p=ctx.NanpureMulti.generateMixed('custom',ns,1,id,null,15000,links);verify(p);generated++;
 if(id==='MIXED-OFFSET')finderPuzzle=p;
 const cfg={kind:'multi',n:Math.max(...ns),multiShape:'custom',multiSizes:ns,multiLinks:links,level:1,count:1};assert(ctx.NPGenerationMatches(p,cfg));assert(ctx.NPBatch.valid(cfg));const queue=ctx.NPBatch.restore(JSON.stringify({version:1,token:'offset',jobs:[cfg],cursor:0,bulk:false,cfg}),[],null);assert.equal(JSON.stringify(queue.jobs[0].multiLinks),JSON.stringify(links));
 const shared=p.linked.cells.map((_,i)=>p.linked.boards.filter(b=>b.map.includes(i)).length);
 if(id==='RECORDED-FLOWER'){
  assert.equal(JSON.stringify(p.linked.boards.map(b=>[b.x,b.y])),JSON.stringify(flower.coordinates));
  assert.equal(shared.filter(n=>n>1).length,flower.sharedCells);
  const reanchored=ctx.NanpureMulti.mixedLayout('custom',flower.sizes,flower.coordinates.slice(1).map(([x,y])=>({parent:0,dx:x-flower.coordinates[0][0],dy:y-flower.coordinates[0][1]})));
  assert.equal(JSON.stringify(reanchored.cells),JSON.stringify(p.linked.cells),'coordinate references do not change physical geometry');
 }
 assert(shared.filter(n=>n>1).length>1);if(id==='TRIPLE')assert(shared.includes(3));
 const at=shared.findIndex(n=>n>1);assert(ctx.NanpureMulti.cellDescription(p,at).startsWith('共有マス：'));
 assert(ctx.NanpureMulti.cellDescription(p,at).includes('行'));assert(ctx.NanpureMulti.cellDescription(p,at).includes('列'));
 const focused=ctx.NanpureMulti.art(p,p.puzzle,{},at,[],1);assert(focused.includes('data-multi-focus="1"'));assert.equal((focused.match(/data-multi-outline=/g)||[]).length,ns.length);
 for(let i=0;i<ns.length;i++){assert(ctx.NanpureMulti.boardLabel(p,i).includes(ns[i]+'×'+ns[i]));assert(ctx.NanpureMulti.miniMap(p,i).includes('multi-mini-map'));}
}
// Known structural conflicts must surface before a single search attempt.
for(const [sizes,links,reason] of [
 [[4,9],[{parent:0,dx:0,dy:0}],/数字が足りません/],
 [[4,4],[{parent:0,dx:0,dy:0}],/完全に一致/],
 [[4,4],[{parent:0,dx:4,dy:0}],/すべての盤面/]
]){
 let attempts=0;
 assert.throws(()=>ctx.NanpureMulti.generateMixed('custom',sizes,1,'PREFLIGHT',()=>attempts++,60000,links),reason);
 assert.equal(attempts,0);
}
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',[9,9],[{parent:0,dx:0,dy:0}]),/完全に一致/);
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',[9,9],[{parent:0,dx:9,dy:0}]),/1マス以上/);
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',[9,9,9,9],[{parent:0,dx:6,dy:6},{parent:0,dx:24,dy:0},{parent:2,dx:6,dy:6}]),/すべての盤面/,'two separate overlapping components are disconnected');
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',[9,9],[{parent:0,dx:1.5,dy:0}]),/整数/);
for(const shape of ['pair','custom'])for(const level of [1,2]){verify(ctx.NanpureMulti.generateMixed(shape,[4,4],level,'SMALL-'+shape+'-'+level,null,5000));generated++;}
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',[4,9,6],[{parent:0,corner:'se'},{parent:0,corner:'se'}]),/重なり/);
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',[4,9],[{parent:1,corner:'se'}]));
assert.throws(()=>ctx.NanpureMulti.generateMixed('custom',[4,4],5,'invalid',null,20));
assert.equal(ctx.NP.maxLevel('multi',4),2);
const old={kind:'multi',n:9,multiVersion:1,linked:ctx.NanpureMulti.layout('pair')};old.solution=ctx.NanpureMulti.completed(old.linked,ctx.NanpureVariants.rngFor('OLD'));old.puzzle=old.solution.slice();assert(ctx.NP.validate(old));assert(ctx.NanpureMulti.solve(old).solved);
// An in-progress v2 backup captured from .100 has just the child witness.
{
 const snapshot=fs.readFileSync(path.join(__dirname,'fixtures/multi-v100-save.json'),'utf8').trim();
 const saved=ctx.NPCompact.parse(snapshot),p=saved.puzzles[0];
 assert.equal(ctx.NP.validate(p),true);assert.equal(p.id,'A1b3D');
 assert.equal(p.verification.sharedWitnesses.length,1);
 assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify(p)).digest('hex'),
   'c04d70790e1c526c5093b4bcc3d81ab5e92af85d64a97650c7c14539db85f354');
 assert.equal(ctx.NPCompact.stringify(saved),snapshot,'old ID, progress and proof round-trip unchanged');
}
const maxBoards=ctx.NanpureMulti.maxBoards;
assert.equal(maxBoards,300);
const twenty=Array(20).fill(9),chain=twenty.slice(1).map((_,i)=>({parent:i,corner:'se'}));
const availableRules=Array.from(ctx.NanpureMulti.rulesForSize(9));
assert.deepEqual(availableRules,['normal','diagonal','hyper','antiknight','antiking','disjoint']);
const rotatingRules=twenty.map((_,i)=>availableRules[i%availableRules.length]);
const twentyRules=ctx.NanpureMulti.generateMixed('custom',twenty,1,'TWENTY-MIXED',null,15000,chain,rotatingRules);
verify(twentyRules);generated++;
assert.equal(twentyRules.linked.boards.length,20);
assert.deepEqual(Array.from(twentyRules.linked.boards,b=>b.rule||'normal'),rotatingRules);
const cfg20={kind:'multi',n:9,level:1,multiShape:'custom',multiSizes:twenty,multiLinks:chain,multiRules:rotatingRules,count:1};
assert(ctx.NPBatch.valid(cfg20));assert(ctx.NPGenerationMatches(twentyRules,cfg20));
assert(!ctx.NPGenerationMatches(twentyRules,{...cfg20,multiRules:twenty.map(()=> 'normal')}));
assert.notEqual(ctx.NPBatch.configKey(cfg20),ctx.NPBatch.configKey({...cfg20,multiRules:undefined}));
assert(!ctx.NPBatch.valid({...cfg20,multiSizes:[...twenty,9]}));
assert(!ctx.NPBatch.valid({...cfg20,multiRules:[...rotatingRules.slice(0,-1),'killer']}));
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',Array(maxBoards+1).fill(9)));
// Maximum supported puzzle exercises generation, compact save, rule identity and bounded drawing.
const largeSizes=Array(maxBoards).fill(9),largeRules=largeSizes.map((_,i)=>availableRules[i%availableRules.length]);
const large=ctx.NanpureMulti.generateMixed('custom',largeSizes,1,'THREE-HUNDRED',null,60000,undefined,largeRules);
assert.equal(large.linked.boards.length,maxBoards);
assert.equal(ctx.NP.validate(large),true);
verifyRating(large);verifyDependencies(large);
const largeExact=ctx.NanpureMulti.exact(large,15000);
assert(!largeExact.timeout);assert.equal(largeExact.count,1);
assert.deepEqual(Array.from(largeExact.solution),Array.from(large.solution));
const largeSaved=ctx.NPCompact.parse(ctx.NPCompact.stringify({format:'nanpure-chou-v3',puzzles:[large]})).puzzles[0];
assert.equal(JSON.stringify(largeSaved),JSON.stringify(large));
const largeArt=ctx.NanpureMulti.art(large,large.puzzle,{},-1,[],299);
assert(largeArt.includes('data-multi-label="299"'));assert(largeArt.includes('KN '));
assert((largeArt.match(/data-linked-cell=/g)||[]).length<1000,'play draws a bounded neighborhood');
assert.equal((ctx.NanpureMulti.art(large,large.puzzle).match(/data-multi-outline=/g)||[]).length,300);
assert.equal(ctx.NanpureMulti.boardCode(26),'AA');assert.equal(ctx.NanpureMulti.boardCode(299),'KN');
assert(ctx.NPBatch.valid({kind:'multi',n:9,level:1,multiShape:'custom',multiSizes:largeSizes,multiRules:largeRules,count:1}));
generated++;
const implicit={kind:'multi',n:9,level:1,multiShape:'pair',count:1};
const implicitPuzzle=ctx.NPGenerate(implicit);verify(implicitPuzzle);generated++;
assert.equal(implicitPuzzle.implicitMultiPreset,true);
assert(ctx.NPGenerationMatches(implicitPuzzle,implicit));
assert.equal(ctx.NPBatch.stockKey(implicitPuzzle),ctx.NPBatch.stockKey(implicit));

// Run the shipped finder renderer and predicate against a mixed save whose
// largest size differs from its smaller board; the smaller size must be selectable.
const app=fs.readFileSync(path.join(base,'app.js'),'utf8');
const selectStart=app.indexOf('function kt('),selectEnd=app.indexOf('function xt(',selectStart);
assert(selectStart>=0&&selectEnd>selectStart);
Object.assign(ctx,{x:[finderPuzzle,{uid:'normal',kind:'normal',n:9,level:1}],M:'all',L:{ids:[],selection:{}},S:{flow:'play'},r:ctx.NP.KIND,f:p=>String(p.level),u:ctx.NP.esc,Ue:()=>'',ue:()=>[],NPFinder:{extraMatch:()=>true}});
vm.runInContext(app.slice(selectStart,selectEnd),ctx);
const facetStart=app.indexOf('s+=function(e,t){'),facetEnd=app.indexOf('}(i,n)+(t?',facetStart);assert(facetStart>=0&&facetEnd>facetStart);
vm.runInContext('this.renderMixedFinder=('+app.slice(facetStart+3,facetEnd+1)+')',ctx);
let finder=ctx.renderMixedFinder(ctx.x,ctx.Nt());
const sizeSelect=finder.match(/<select id="select-size">([\s\S]*?)<\/select>/)[1];
for(const n of [4,6,9])assert(sizeSelect.includes('<option value="'+n+'"'));
assert(finder.includes('<option value="custom"'));
for(const n of [4,6]){ctx.L.selection={size:String(n),shape:'custom'};assert.equal(ctx.Nt().length,1);assert.equal(ctx.Nt()[0].id,finderPuzzle.id);}
ctx.L.selection={size:'9',shape:'all'};assert.equal(ctx.Nt()[0].uid,'normal');
// Exercise actual editor handlers: a pointer drag snaps to cells, cancellation
// preserves configuration, and the numeric controls share the same placement path.
const editorStart=app.indexOf('let mixedEditing='),editorEnd=app.indexOf('function ot(e)',editorStart),handlers={};
let redraws=0;const attributes={},status={textContent:''};
const svg={getScreenCTM:()=>({a:.8,d:.8,e:10,f:20}),querySelector:()=>({setAttribute:(k,v)=>attributes[k]=v})};
const editor={querySelector:()=>svg,setPointerCapture(){}};
const editorCtx=vm.createContext({E:{multiShape:'custom',multiSizes:[9,9],multiLinks:[{parent:0,dx:6,dy:6}]},NanpureMulti:ctx.NanpureMulti,NP:ctx.NP,r:ctx.NP.KIND,document:{addEventListener:(type,fn)=>handlers[type]=fn,querySelector:()=>status},fn:()=>redraws++,$e:()=>'',u:ctx.NP.esc,Ue:()=>'',h:-1});
vm.runInContext(app.slice(app.indexOf('function Ue('),app.indexOf('function We(')),editorCtx);
vm.runInContext(app.slice(editorStart,editorEnd),editorCtx);
const reviewCfg={kind:'multi',multiShape:'custom',multiSizes:[4,4],level:1,multiLinks:[{parent:0,corner:'se'}]};
for(const [cfg,message] of [
 [{...reviewCfg,level:3},/難易度1〜2/],
 [{...reviewCfg,multiLinks:[{parent:0,dx:4,dy:0}]},/1マス以上/]
]){
 const review=editorCtx.generationReviewButton(cfg);
 assert(review.includes('role="alert"'));assert.match(review,message);
 assert.match(review,/<button[^>]*data-action="generate"[^>]*disabled/);
}
const validReview=editorCtx.generationReviewButton(reviewCfg);
assert.match(validReview,/data-action="generate"/);assert(!validReview.includes('disabled'));assert(!validReview.includes('role="alert"'));
assert(editorCtx.mixedSettings().includes('data-multi-offset="1"'));
const pointer={target:{closest:()=>editor},pointerId:7,button:0,clientX:330,clientY:340,preventDefault(){}};
handlers.pointerdown(pointer);handlers.pointermove({...pointer,clientX:266,clientY:308});handlers.pointerup({...pointer,clientX:266,clientY:308});
assert.equal(JSON.stringify(editorCtx.E.multiLinks),JSON.stringify([{parent:0,dx:4,dy:5}]));assert(redraws>0);assert(attributes.transform.includes('-80 -40'));
const before=JSON.stringify(editorCtx.E);handlers.pointerdown(pointer);handlers.pointercancel(pointer);assert.equal(JSON.stringify(editorCtx.E),before);
const rootPointer={...pointer,clientX:42,clientY:52};handlers.pointerdown(rootPointer);handlers.pointerup({...rootPointer,clientX:74,clientY:84});assert.equal(JSON.stringify(editorCtx.E.multiLinks),JSON.stringify([{parent:0,dx:3,dy:4}]));
const overlapPointer={...pointer,clientX:170,clientY:180},beforeTap=JSON.stringify(editorCtx.E);handlers.pointerdown(overlapPointer);handlers.pointerup(overlapPointer);assert.equal(vm.runInContext('mixedEditing',editorCtx),1);assert.equal(JSON.stringify(editorCtx.E),beforeTap);
editorCtx.mixedPlace(1,-2,3);assert.equal(editorCtx.E.multiLinks[0].dx,-2);assert.equal(editorCtx.E.multiLinks[0].dy,3);
editorCtx.E={multiShape:'custom',multiSizes:flower.sizes,multiLinks:flower.links};
const flowerForm=editorCtx.mixedSettings();
assert(!flowerForm.includes('class="notice error"'),'recorded layout has no red validation error');
assert(!/<button[^>]*type="submit"[^>]*disabled/.test(flowerForm),'recorded layout can continue');
assert.equal((flowerForm.match(/min="-200" max="200"/g)||[]).length,14,'all position inputs accept the same bounds as dragging');
assert(flowerForm.includes('value="18" data-multi-offset="3"'),'D retains the recorded offset beyond its reference board');
const print=fs.readFileSync(path.join(base,'print.html'),'utf8');assert(print.includes('<script src="common.js"></script><script src="mixed-multi.js"></script>'));
assert(fs.readFileSync(path.join(base,'app.js'),'utf8').includes('"generator-source","core-mixed-multi"].map'));
assert(fs.readFileSync(path.join(base,'portable.js'),'utf8').includes('"generator-source","core-mixed-multi"].map'));
console.log('PASS mixed multi:',generated,'generated puzzles; 15 sizes, five levels, three presets, 2–300 free boards, six board rules, exact uniqueness, no-guess solving, shared dependency, candidates, backup/restore, queue identity, arbitrary/triple overlaps, color maps, membership, drag, finder, five print modes and v1 compatibility.');
