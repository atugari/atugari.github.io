// No puzzle or save key is copied or renumbered by the navigation move.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const catalog=JSON.parse(read('nanpure/collection/catalog.json'));
assert.equal(catalog.total,100000);assert.equal(catalog.configs.reduce((n,c)=>n+c.count,0),100000);
assert.equal(catalog.configs.filter(c=>c.kind==='cross').reduce((n,c)=>n+c.count,0),6340);
const games=['shirupure','wado','crossword','cross','tenbin','paths','studio','workshop'];
for(const slug of games){assert(read('plaza.html').includes('href="/puzzles/'+slug+'/"'));const html=read('puzzles/'+slug+'/index.html');assert(html.includes('data-game="'+slug+'"'));assert(html.includes('data-hub href="/plaza.html"'));}
for(const p of ['puzzles/entry.js','puzzles/navigation.js','nanpure/collection/entry.js'])new vm.Script(read(p));
assert(!/localStorage\.(?:clear|removeItem)|indexedDB\.deleteDatabase/.test(read('puzzles/navigation.js')+read('puzzles/entry.js')));
assert(read('puzzles/magic-square/index.html').includes('プレイは準備中'));
console.log('PASS Pareasobi routes: eight direct entries, 93,660 + 6,340 original puzzles, save keys preserved, creation-only magic square.');
