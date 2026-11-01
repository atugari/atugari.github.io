const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {c}=require('./collection-100k/engines.cjs').load();
vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/pattern-model.js','utf8'),c);
const model=c.NPPatternModel,flat=v=>Array.from(v),grid=a=>Array.from({length:9},(_,r)=>flat(a.slice(r*9,r*9+9)));
let generated=0;
for(const name of ['heart','diamond','dots'])for(let run=0;run<8;run++){
 const mask=model.presets[name],r=model.search(mask,0,{milliseconds:5000,maxAttempts:3});assert.equal(r.state,'ready',name);assert(model.validate(r));
 assert.deepEqual(flat(r.puzzle).map(Boolean),flat(mask));assert.equal(c.Nanpure.countSolutions(grid(r.puzzle),2),1);generated++;
}
for(let omit=1;omit<=9;omit++){
 const r=model.search(model.presets.omit,omit,{milliseconds:5000});assert.equal(r.state,'ready');assert(!r.puzzle.includes(omit));assert.equal(r.puzzle.filter(Boolean).length,72);assert.equal(c.Nanpure.countSolutions(grid(r.puzzle),2),1);assert(model.validate(r));
 const bad=JSON.parse(JSON.stringify(r));bad.puzzle[bad.mask.indexOf(0)]=omit;assert.throws(()=>model.validate(bad));generated++;
}
assert.equal(model.analyze(Array(81).fill(false)).reason,'few');
assert.equal(model.analyze(Array.from({length:81},(_,i)=>i<16)).reason,'few');
assert.equal(model.analyze(Array(81).fill(true)).reason,'full');
assert.equal(model.analyze(Array.from({length:81},(_,i)=>i>=18&&i<80)).reason,'rows');
assert.equal(model.analyze(Array.from({length:81},(_,i)=>i%9>=2&&i!==80)).reason,'cols');
assert.equal(model.analyze(model.presets.dots,9).reason,'digit','A parity obstruction is proven without misclassifying search exhaustion');
assert.equal(model.search(model.presets.dots,0,{maxAttempts:0}).state,'unknown');
assert.equal(model.search(model.presets.dots,0,{milliseconds:0}).state,'unknown');
assert.throws(()=>model.analyze(Array(80).fill(true)));assert.throws(()=>model.analyze(model.presets.heart,10));
const unique=model.search(model.presets.heart);unique.solution[0]=0;assert.throws(()=>model.validate(unique));
const version=JSON.parse(fs.readFileSync('nanpure/version.json')).version,html=fs.readFileSync('nanpure/releases/'+version+'/notebook/index.html','utf8');
for(const name of ['pattern.css','pattern-model.js','pattern-ui.js'])assert(html.includes(name),'Published entry includes '+name);
console.log('PASS pattern Sudoku:',generated,'independently checked unique puzzles; exact masks; all nine omitted digits; proof vs timeout; malformed and mismatched candidates rejected.');
