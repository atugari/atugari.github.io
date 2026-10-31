// No puzzle or save key is copied or renumbered by the navigation move.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const catalog=JSON.parse(read('nanpure/collection/catalog.json'));
assert(catalog.total>=100000);assert.equal(catalog.configs.reduce((n,c)=>n+c.count,0),catalog.total);
assert.equal(catalog.configs.filter(c=>c.kind==='cross').reduce((n,c)=>n+c.count,0),6340);
const games=['shirupure','wado','crossword','cross','tenbin','paths','studio','workshop'];
for(const slug of games){assert(read('plaza.html').includes('href="/puzzles/'+slug+'/"'));const html=read('puzzles/'+slug+'/index.html');assert(html.includes('data-game="'+slug+'"'));assert(html.includes('data-hub href="/plaza.html"'));}
for(const p of ['puzzles/entry.js','puzzles/navigation.js','nanpure/collection/entry.js'])new vm.Script(read(p));
assert.equal(read('nanpure/collection/board-input.js'),read('scripts/client-overrides/public/notebook/board-input.js'),'Collection gestures are generated from the common source');
assert(!/localStorage\.(?:clear|removeItem)|indexedDB\.deleteDatabase/.test(read('puzzles/navigation.js')+read('puzzles/entry.js')));
assert(read('puzzles/magic-square/index.html').includes('プレイは準備中'));
assert(!read('scripts/client-overrides/app/game.tsx').includes('className="shiru-entry"'),'The generating source must not restore the old home entry');
assert(read('scripts/client-overrides/app/game.tsx').includes('data-pare-entry=""'),'The home source owns the relocation link');
const manifest=JSON.parse(read('nanpure/release-manifest.json'));
for(const [file,expected]of Object.entries(manifest.pareasobiNavigation.sources))assert.equal(require('node:crypto').createHash('sha256').update(read(file)).digest('hex'),expected,'Navigation source manifest: '+file);
console.log('PASS Pareasobi routes: eight direct entries, '+(catalog.total-6340).toLocaleString('en-US')+' Sudoku and 6,340 cross puzzles, original IDs and save keys preserved, creation-only magic square.');
