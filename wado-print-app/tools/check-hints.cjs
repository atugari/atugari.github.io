// Verify semantic clues, automatic variety, saved choices and all generator settings.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
require(path.join(root,'web-source/clues.js'));require(path.join(root,'web-source/engine.js'));
const dictionary=[path.join(root,'../scripts/client-overrides/public/notebook/wado-data.json'),path.join(root,'../source/wado-data.json')].find(fs.existsSync);
const bank=JSON.parse(fs.readFileSync(path.join(root,'web-source/hints.json'))),engine=WadoPrint.create(JSON.parse(fs.readFileSync(dictionary)),bank),system=engine.hintSystem;
assert.equal(system.richWordCount,235);const puzzles=[],seen=[];
for(let level=1;level<=10;level++)for(const count of [2,3,4])for(let i=0;i<40;i++){
 const p=engine.generate({level,count,seed:level*100000+count*1000+i,seen});seen.push(WadoPrint.fingerprint(p));puzzles.push(p);
 assert(system.rich(p,p.hintPosition));const candidates=system.suggestions(p);assert(candidates.length>=3);assert(new Set(candidates.map(c=>c.view)).size>=2);
 assert(candidates.every(c=>c.preferred),'dedicated clues replace generic fallbacks');
 for(const h of system.all(p))assert(!h.text.includes(p.answer),'clue must not contain the central answer');
 assert.deepEqual(engine.validatePuzzle(p),p);const selected=candidates.at(-1);p.hintChoice=selected.id;assert.equal(engine.validatePuzzle(p).hintChoice,selected.id);delete p.hintChoice;
}
const variety={};
for(const grade of [1,2,3]){
 const planned=system.plan(puzzles,grade),hints=puzzles.map(p=>planned.get(WadoClues.key(p)));
 assert(hints.every(h=>h&&h.grade===grade));const counts={};for(const h of hints)counts[h.view]=(counts[h.view]||0)+1;
 assert(Object.keys(counts).length>=3,'use different perspectives automatically');variety[grade]=counts;
 const p=puzzles[0],manual=system.all(p).find(h=>h.grade!==grade);p.hintChoice=manual.id;
 assert.equal(system.plan([p],grade).get(WadoClues.key(p)).id,manual.id,'one chosen hint takes priority');
 assert.equal(system.plan([p],grade,{respectSelection:false}).get(WadoClues.key(p)).grade,grade,'difficulty sheets keep their stated grade');delete p.hintChoice;
}
for(let level=1;level<=10;level++){const recent=[];for(let i=0;i<12;i++){const p=engine.generate({level,count:4,seed:99000+level*100+i,recentHintWords:recent});const word=WadoPrint.word(p,p.hintPosition);assert(!recent.includes(word),'avoid recently used clue words');recent.push(word);if(recent.length>8)recent.shift();}}
for(const grade of [1,2,3]){const batch=[];let last=null;for(let i=0;i<15;i++){const p=engine.generate({level:2,count:4,seed:8800+i,recentHintWords:batch.slice(-8).map(p=>WadoPrint.word(p,p.hintPosition)),hintGrade:grade,lastHintView:last});batch.push(p);const actual=system.plan(batch,grade).get(WadoClues.key(p));assert.notEqual(actual.view,last,'actively change automatic perspectives');last=actual.view;}}
assert([...system.plan(puzzles,0).values()].every(x=>x===null),'no-hint print contains no clues');
console.log(JSON.stringify({passed:puzzles.length,richWords:system.richWordCount,variety}));
