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
  assert.equal(Object.keys(p.arms).length,count);assert(alternatives(p).includes(p.answer),'example answer is a valid dictionary answer');
  assert.equal(p.choices.length,[2,3,4,6,0,0,0,0,0,0][level-1]);
  assert.equal(engine.hints(p).length,Math.min(count,level<=5?4:level===6?1:0));
  assert.deepEqual(engine.generate({level,count,seed,seen:[...seen]}),p);
  seen.add(engine.fingerprint(p));answers.add(p.answer);total++;
 }
 assert.equal(seen.size,40,'new puzzles do not repeat');assert(answers.size>=10,'answer variety at every level and word count');
}
const p=engine.generate({level:1,count:4,seed:2026}),swap=structuredClone(p);[swap.arms.top,swap.arms.left]=[swap.arms.left,swap.arms.top];assert.equal(engine.fingerprint(p),engine.fingerprint(swap),'reordering the same incoming words is not a new problem');
const extra=Object.entries(p.arms).map(([k,c])=>['top','left'].includes(k)?c+'龘':'龘'+c);
const broad=NPWado.create({...data,checks:data.checks+' '+extra.join(' '),checkSources:data.checkSources+'2'.repeat(extra.length)});assert.equal(broad.candidates(p).length,2);assert.equal(broad.validate(p),p,'another valid answer does not invalidate a question');
assert(engine.inspect(p.arms).answers.some(candidate=>candidate.answer===p.answer));
for(const fixture of JSON.parse(fs.readFileSync('scripts/wado/alternative-fixtures.json'))){
 const report=engine.inspect(fixture.arms);assert.deepEqual(report.answers,fixture.answers);
 assert(report.answers.length>1,'new lexicons expose actual alternatives missed by JMdict alone');
 assert(report.answers.some(a=>a.words.some(w=>!w.sources.some(s=>s.id==='jmdict'))));
 const entries=Object.entries(fixture.arms).map(([k,c])=>engine.entry(['top','left'].includes(k)?c+fixture.oldAnswer:fixture.oldAnswer+c)),max=Math.max(...entries.map(e=>e.rank)),level=max===1?7:max===2?8:9;
 assert.doesNotThrow(()=>engine.validate({version:2,level,count:2,arms:fixture.arms,answer:fixture.oldAnswer,choices:[]}),'other valid answers do not invalidate the example answer');
}
for(const arms of [{top:'学'},{top:'AB',right:'生'},{side:'学',right:'生'},{top:'𠀀',right:'生'},null])assert.throws(()=>engine.inspect(arms));
assert.equal(engine.inspect({top:'龘',right:'龘'}).answers.length,0);
assert.equal(engine.inspect({left:p.arms.top,bottom:p.arms.right}).answers.length,engine.candidates({arms:{top:p.arms.top,right:p.arms.right}}).length,'manual checker preserves direction for any pair of positions');
for(const change of [{checkSources:''},{checkSources:data.checkSources.replace(/^./,'0')},{sources:[]},{words:[{...data.words[0],readingSources:['jmdict']}]},{words:[{...data.words[0],reading:'<img>'}]}])assert.throws(()=>NPWado.create({...data,...change}));
for(const entry of data.words){assert(entry.readingSources.length>=2);if(entry.rank===1)assert(entry.zipf>=3.5);}
assert(engine.entry('汽水').rank>1,'low-frequency vocabulary does not enter easiest levels');
for(const change of [{answer:'<script>'},{count:5},{level:0},{level:11},{arms:{top:'<',right:'>'}},{choices:['<script>']},{created:'<img>'}])assert.throws(()=>engine.validate({...p,...change}));
assert.throws(()=>engine.generate({count:1}));assert.throws(()=>engine.generate({level:11}));
for(const text of ['入学','学校','時計','味方'])assert(engine.entry(text)?.reading,'familiar valid irregular spellings stay available');
for(const [text,reading] of Object.entries(JSON.parse(fs.readFileSync('scripts/wado/preferred-readings.json'))))assert.equal(engine.entry(text)?.reading,reading,'reviewed hints retain the intended reading');
assert(fs.readFileSync('scripts/client-overrides/lib/backup.ts','utf8').includes("'np-wado-v1'"));
for(const text of ['掃除','洗濯','入浴','野菜','果物','豆腐','病院'])assert(engine.entry(text),'ordinary words are not restricted by the old hand list');
assert(data.words.length>40000);assert.equal(Object.values(data.stats.classification).reduce((a,b)=>a+b),dictionary.size);
const report=JSON.parse(fs.readFileSync('scripts/wado/dictionary-report.json'));
assert.equal(report.coverage.total,2575);assert.equal(report.coverage.rawTwoHanForms,2590);assert.equal(report.coverage.outsideScopeWithOkurigana.length,15);assert.equal(report.coverage.entries.length,2575);assert.equal(report.coverage.dictionaryMatches+report.coverage.unmatched.length,2575);
const rows=fs.readFileSync('scripts/client-overrides/public/notebook/wado-audit.tsv','utf8').trim().split('\n').slice(2).map(line=>line.split('\t'));
assert.equal(rows.length,dictionary.size);assert.equal(new Set(rows.map(r=>r[0])).size,dictionary.size);
const adoptedSet=new Set(data.words.map(w=>w.text));
for(const row of rows){assert(dictionary.has(row[0]));assert(['adopted','pending','excluded'].includes(row[1]));assert.equal(adoptedSet.has(row[0]),row[1]==='adopted');}
const current=NPWado,oldData=JSON.parse(fs.readFileSync('nanpure/releases/2026.10.23.44/notebook/wado-data.json'));
require('../nanpure/releases/2026.10.23.44/notebook/wado-engine.js');const oldEngine=NPWado.create(oldData);globalThis.NPWado=current;
for(let level=1;level<=10;level++)for(const count of [2,3,4]){const old=oldEngine.generate({level,count,seed:100+level}),before=JSON.stringify(old);engine.validate(old);assert.deepEqual(engine.hints(old),oldEngine.hints(old));for(const k of Object.keys(old.arms))assert.equal(engine.entry(engine.word(old,k),old).reading,oldEngine.entry(oldEngine.word(old,k)).reading);assert.equal(JSON.stringify(old),before);}
console.log('PASS Wado:',total,'puzzles across all 10 levels × 3 word counts; valid examples with accepted alternatives, complete decision audit, legacy question compatibility, difficulty aids, diversity, reproducibility, deduplication and malformed data.');
