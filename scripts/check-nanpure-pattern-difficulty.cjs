// Real difficulty evaluation and independent uniqueness counts for exact masks.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {c}=require('./collection-100k/engines.cjs').load();
vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/pattern-model.js','utf8'),c);
const model=c.NPPatternModel,grid=p=>Array.from({length:9},(_,r)=>Array.from(p.slice(r*9,r*9+9)));
for(const [name,level] of [['heart',1],['diamond',10],['dots',1]]){
 const r=model.search(model.presets[name],0,{targetLevel:level,rate:c.Nanpure.ratePuzzle,milliseconds:6000,maxAttempts:60});
 assert.equal(r.state,'ready',name+' reaches requested level');assert(model.validate(r));
 assert.equal(c.Nanpure.countSolutions(grid(r.puzzle),2),1);
 const independent=c.Nanpure.ratePuzzle(grid(r.puzzle));assert(independent.humanSolvable);assert.equal(independent.level,level);
 assert.deepEqual(Array.from(r.puzzle,Boolean),Array.from(model.presets[name],Boolean));
}
// Keep a rejected unique puzzle out of the result, even when the search budget ends.
let rated=0;
const mismatch=model.search(model.presets.heart,0,{targetLevel:18,rate:p=>{rated++;return c.Nanpure.ratePuzzle(p);},maxAttempts:5,milliseconds:5000});
assert.equal(mismatch.state,'unknown');assert.equal(mismatch.attempts,5);assert(rated>0);assert.equal(mismatch.puzzle,undefined);
const next=model.search(model.presets.heart,0,{targetLevel:18,offset:mismatch.attempts,rate:()=>({humanSolvable:true,level:1}),maxAttempts:5,milliseconds:5000});
assert.equal(next.state,'unknown');assert.equal(next.attempts,5);
assert.equal(model.search(model.presets.heart,0,{targetLevel:1,rate:()=>({level:1,humanSolvable:false}),maxAttempts:3,milliseconds:5000}).state,'unknown');
for(const options of [{targetLevel:19},{targetLevel:-1},{targetLevel:1},{offset:-1},{offset:1.5}])assert.throws(()=>model.search(model.presets.heart,0,options));
// Explicit fallback preserves the measured level; technique requirements never relax with it.
const easier=model.search(model.presets.heart,0,{targetLevel:10,levelPolicy:'easier',rate:c.Nanpure.ratePuzzle,milliseconds:5000,maxAttempts:10});
assert.equal(easier.state,'ready');assert.equal(easier.rating.level,1);assert.equal(c.Nanpure.ratePuzzle(grid(easier.puzzle)).level,1);
const technique=model.search(model.presets.diamond,0,{targetLevel:10,required:['x-wing','xy-wing'],excluded:['swordfish'],rate:c.Nanpure.ratePuzzle,milliseconds:6000,maxAttempts:30});
assert.equal(technique.state,'ready');const used=c.Nanpure.ratePuzzle(grid(technique.puzzle)).techniques.map(t=>t.id);assert(used.includes('x-wing'));assert(used.includes('xy-wing'));assert(!used.includes('swordfish'));
for(const options of [{required:['x-wing']},{excluded:['hidden-single-box']},{required:['xy-chain'],levelPolicy:'easier',targetLevel:18}])assert.equal(model.search(model.presets.heart,0,{...options,rate:c.Nanpure.ratePuzzle,maxAttempts:3,milliseconds:5000}).state,'unknown');
for(const options of [{levelPolicy:'automatic'},{required:['unknown']},{required:['x-wing'],excluded:['x-wing']}])assert.throws(()=>model.search(model.presets.heart,0,{...options,rate:c.Nanpure.ratePuzzle}));
console.log('PASS pattern difficulty: selected levels independently rated, exact unique masks, no downgrade or unrated substitutes, continuation and invalid options');
