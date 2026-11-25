// No puzzle or save key is copied or renumbered by the navigation move.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const games=['shirupure','wado','crossword'];
for(const slug of games){assert(read('index.html').includes('href="/puzzles/'+slug+'/"'));const html=read('puzzles/'+slug+'/index.html');assert(html.includes('data-game="'+slug+'"'));assert(html.includes('data-hub href="/plaza.html"'));}
for(const p of ['puzzles/entry.js','puzzles/navigation.js','nanpure/collection/entry.js'])new vm.Script(read(p));
assert(!/localStorage\.(?:clear|removeItem)|indexedDB\.deleteDatabase/.test(read('puzzles/navigation.js')+read('puzzles/entry.js')));
assert(!read('scripts/client-overrides/app/game.tsx').includes('className="shiru-entry"'),'The generating source must not restore the old home entry');
assert(read('scripts/client-overrides/app/game.tsx').includes('<GroupedHome '),'The shell renders the grouped home');
assert(!read('scripts/client-overrides/app/grouped-home.tsx').includes('data-pare-entry'),'The Sudoku home has no Pareasobi entry');
const manifest=JSON.parse(read('nanpure/release-manifest.json'));
for(const [file,expected]of Object.entries(manifest.pareasobiNavigation.sources))assert.equal(require('node:crypto').createHash('sha256').update(read(file)).digest('hex'),expected,'Navigation source manifest: '+file);
console.log('PASS Pareasobi routes: three direct entries, original IDs and save keys preserved.');
