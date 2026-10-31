// Exercise the shipped engine, worker sources, helper models, saves and print assets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const base=path.join(root,'nanpure/releases',version,'notebook'),html=fs.readFileSync(path.join(base,'index.html'),'utf8');
for(const name of ['app.js','common.js','batch.js','portable.js','memo-help.js','logical-hints.js','video-features.js','mixed-multi.js'])assert(!/["'(]\/(?:notebook|audio|themes)\//.test(fs.readFileSync(path.join(base,name),'utf8')),'origin-root asset path escaped the release: '+name);
const ctx=vm.createContext({console,Date,performance,TextDecoder,TextEncoder,Uint8Array,Uint16Array,ArrayBuffer,DataView,atob,btoa,setTimeout,clearTimeout});ctx.window=ctx;ctx.self=ctx;
for(const id of ['core-normal','core-rect','core-variants','core-multi','common-source','generator-source','core-mixed-multi']){
 const source=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))?.[1];assert(source,`worker source ${id}`);vm.runInContext(source,ctx,{filename:id});
}
for(const name of ['batch.js','logical-hints.js','memo-help.js','pako.min.js','compact.js','print-layout.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),ctx,{filename:name});
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
 const logic=ctx.NanpureMulti.solve(p,p.rating.hardest);assert.equal(logic.solved,true);assert.deepEqual(Array.from(logic.grid),Array.from(p.solution));
 assert(ctx.NanpureMulti.needsShared(p));assert(p.puzzle.some(v=>v===0));
 p.grid=p.puzzle.slice();p.notes={};p.uid='mixed-test-'+p.id;p.elapsed=0;p.completed=false;
 const model=ctx.NPLogicalHints.model(p);assert.equal(model.invalid,false);assert(model.units.every(u=>p.linked.boards.some(b=>u.ids.length===b.n)));
 const memo=ctx.NPMemo.candidates(p);
 for(let i=0;i<p.grid.length;i++)if(!p.grid[i]){assert(model.candidates[i].includes(p.solution[i]));assert(memo[i].includes(p.solution[i]));assert(model.candidates[i].every(v=>v<=ctx.NanpureMulti.cellMax(p,i)));}
 const restored=ctx.NPCompact.parse(ctx.NPCompact.stringify({format:'nanpure-chou-v3',puzzles:[p]})).puzzles[0];assert.equal(ctx.NP.validate(restored),true);assert.equal(JSON.stringify(restored),JSON.stringify(p));
 const printed=ctx.NPPrint.buildPrint([p],{paper:'A4',mode:'single',answers:'yes'});assert.equal(printed.pages.length,2);assert(printed.pages.every(page=>page.includes('data-multi-blocks')));assert(printed.pages[0].includes('A '));
 const markup=ctx.NP.svgBoard(p,false);assert(markup.includes(p.linked.width*40+4));assert(markup.includes('data-multi-blocks'));assert(markup.includes('A '));
}
let generated=0;
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
for(const shape of ['pair','custom'])for(const level of [1,2]){verify(ctx.NanpureMulti.generateMixed(shape,[4,4],level,'SMALL-'+shape+'-'+level,null,5000));generated++;}
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',[4,9,6],[{parent:0,corner:'se'},{parent:0,corner:'se'}]),/重なり/);
assert.throws(()=>ctx.NanpureMulti.mixedLayout('custom',[4,9],[{parent:1,corner:'se'}]));
assert.throws(()=>ctx.NanpureMulti.generateMixed('custom',[4,4],5,'invalid',null,20));
assert.equal(ctx.NP.maxLevel('multi',4),2);
const old={kind:'multi',n:9,multiVersion:1,linked:ctx.NanpureMulti.layout('pair')};old.solution=ctx.NanpureMulti.completed(old.linked,ctx.NanpureVariants.rngFor('OLD'));old.puzzle=old.solution.slice();assert(ctx.NP.validate(old));assert(ctx.NanpureMulti.solve(old).solved);
const print=fs.readFileSync(path.join(base,'print.html'),'utf8');assert(print.includes('<script src="common.js"></script><script src="mixed-multi.js"></script>'));
assert(fs.readFileSync(path.join(base,'app.js'),'utf8').includes('"generator-source","core-mixed-multi"].map'));
assert(fs.readFileSync(path.join(base,'portable.js'),'utf8').includes('"generator-source","core-mixed-multi"].map'));
console.log('PASS mixed multi:',generated,'generated puzzles; 15 sizes, five levels, three presets, 2–8 free boards, exact uniqueness, no-guess solving, shared dependency, candidates, backup/restore, queue identity and v1 compatibility.');
