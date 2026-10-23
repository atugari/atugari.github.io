const fs=require('node:fs'),assert=require('node:assert/strict');
require('./client-overrides/public/notebook/wado-engine.js');
const data=JSON.parse(fs.readFileSync('scripts/client-overrides/public/notebook/wado-data.json')),engine=NPWado.create(data),dictionary=new Set(data.checks.split(' ')),characters=new Set([...dictionary].join(''));
// Independent alternative search: try every kanji in the full extracted corpus,
// including words that were deliberately omitted from the generation vocabulary.
function alternatives(p){return[...characters].filter(char=>Object.entries(p.arms).every(([k,c])=>dictionary.has(['top','left'].includes(k)?c+char:char+c)));}
let total=0;
for(let level=1;level<=10;level++)for(const count of [2,3,4]){
 const seen=new Set(),answers=new Set();
 for(let seed=0;seed<40;seed++){
  const p=engine.generate({level,count,seed,seen:[...seen]});engine.validate(p);
  assert.equal(Object.keys(p.arms).length,count);assert.deepEqual(alternatives(p),[p.answer]);
  assert.equal(p.choices.length,[2,3,4,6,0,0,0,0,0,0][level-1]);
  assert.equal(engine.hints(p).length,Math.min(count,level<=5?4:level===6?1:0));
  assert.deepEqual(engine.generate({level,count,seed,seen:[...seen]}),p);
  seen.add(engine.fingerprint(p));answers.add(p.answer);total++;
 }
 assert.equal(seen.size,40,'new puzzles do not repeat');assert(answers.size>=10,'answer variety at every level and word count');
}
const p=engine.generate({level:1,count:4,seed:2026}),swap=structuredClone(p);[swap.arms.top,swap.arms.left]=[swap.arms.left,swap.arms.top];assert.equal(engine.fingerprint(p),engine.fingerprint(swap),'reordering the same incoming words is not a new problem');
const extra=Object.entries(p.arms).map(([k,c])=>['top','left'].includes(k)?c+'龘':'龘'+c);
const broad=NPWado.create({...data,checks:data.checks+' '+extra.join(' '),checkSources:data.checkSources+'2'.repeat(extra.length)});assert.equal(broad.candidates(p).length,2);assert.throws(()=>broad.validate(p),/一つ/,'reject a second answer outside the generation vocabulary');
assert.equal(engine.inspect(p.arms).answers.length,1);
for(const fixture of JSON.parse(fs.readFileSync('scripts/wado/alternative-fixtures.json'))){
 const report=engine.inspect(fixture.arms);assert.deepEqual(report.answers,fixture.answers);
 assert(report.answers.length>1,'new lexicons expose actual alternatives missed by JMdict alone');
 assert(report.answers.some(a=>a.words.some(w=>!w.sources.some(s=>s.id==='jmdict'))));
 assert.throws(()=>engine.validate({version:1,level:1,count:2,arms:fixture.arms,answer:fixture.oldAnswer,choices:[fixture.oldAnswer,'龘']}));
}
for(const arms of [{top:'学'},{top:'AB',right:'生'},{side:'学',right:'生'},{top:'𠀀',right:'生'},null])assert.throws(()=>engine.inspect(arms));
assert.equal(engine.inspect({top:'龘',right:'龘'}).answers.length,0);
assert.equal(engine.inspect({left:p.arms.top,bottom:p.arms.right}).answers.length,engine.candidates({arms:{top:p.arms.top,right:p.arms.right}}).length,'manual checker preserves direction for any pair of positions');
for(const change of [{checkSources:''},{checkSources:data.checkSources.replace(/^./,'0')},{sources:[]},{words:[{...data.words[0],readingSources:['jmdict']}]},{words:[{...data.words[0],reading:'<img>'}]}])assert.throws(()=>NPWado.create({...data,...change}));
for(const entry of data.words){assert(entry.readingSources.length>=2&&entry.readingSources.includes('jmdict'));if(entry.rank===1)assert(entry.zipf>=3.5);}
assert(engine.entry('汽水').rank>1,'low-frequency vocabulary does not enter easiest levels');
for(const change of [{answer:'<script>'},{count:5},{level:0},{level:11},{arms:{top:'<',right:'>'}},{choices:['<script>']},{created:'<img>'}])assert.throws(()=>engine.validate({...p,...change}));
assert.throws(()=>engine.generate({count:1}));assert.throws(()=>engine.generate({level:11}));
for(const text of ['入学','学校','時計','味方'])assert(engine.entry(text)?.reading,'familiar valid irregular spellings stay available');
for(const [text,reading] of Object.entries(JSON.parse(fs.readFileSync('scripts/wado/preferred-readings.json'))))assert.equal(engine.entry(text)?.reading,reading,'reviewed hints retain the intended reading');
assert(fs.readFileSync('scripts/client-overrides/lib/backup.ts','utf8').includes("'np-wado-v1'"));
console.log('PASS Wado:',total,'puzzles across all 10 levels × 3 word counts; independent full-corpus alternatives, difficulty aids, diversity, reproducibility, deduplication and malformed data.');
