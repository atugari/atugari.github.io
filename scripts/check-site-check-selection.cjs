const test=require('node:test'),assert=require('node:assert/strict'),{planChecks,normalize}=require('./select-site-checks.cjs');
function plan(paths,{old={},next={},forceFull=false}={}){
  const files={base:{'nanpure/version.json':'{"version":"2026.11.03.88"}',...old},head:{'nanpure/version.json':'{"version":"2026.11.04.89"}',...next}};
  return planChecks({paths,forceFull,readAt:(ref,p)=>files[ref][p]===undefined?null:Buffer.from(files[ref][p])});
}
test('generation-only changes and the selector configuration keep unrelated heavy checks off',()=>{
  const p=plan(['scripts/client-overrides/public/notebook/generation-assist.js','scripts/check-generation-assist.cjs','.github/workflows/deploy-site.yml']);
  for(const key of ['notebook','wado','corpus','learning','full'])assert.equal(p[key],false);
});
test('copied release files and release feed updates are not gameplay changes',()=>{
  const name='nanpure/releases/2026.11.04.89/shell/main.js';
  const p=plan([name],{old:{'nanpure/releases/2026.11.03.88/shell/main.js':'var ka="2026.11.03.88",wS=[{"items":["old"]}];function play(){return 1}'},next:{[name]:'var ka="2026.11.04.89",wS=[{"items":["new; [news]"]}];function play(){return 1}'}});
  assert.deepEqual(p.semantic,[]);assert.equal(p.notebook,false);
});
test('actual generated shell changes are checked even when no original source file was changed',()=>{
  const name='nanpure/releases/2026.11.04.89/shell/main.js';
  const p=plan([name],{old:{'nanpure/releases/2026.11.03.88/shell/main.js':'var ka="2026.11.03.88",wS=[];function play(){return 1}'},next:{[name]:'var ka="2026.11.04.89",wS=[];function play(){return 2}'}});
  assert.equal(p.notebook,true);assert.equal(p.corpus,false);
});
test('a generated-only assistance change still selects the mandatory assistance checks',()=>{
  const name='nanpure/releases/2026.11.04.89/notebook/generation-assist.js';
  const p=plan([name],{old:{'nanpure/releases/2026.11.03.88/notebook/generation-assist.js':'old'},next:{[name]:'new'}});
  assert.deepEqual(p.semantic,['scripts/client-overrides/public/notebook/generation-assist.js']);assert.equal(p.full,false);
});
test('real loader changes are not mistaken for a version-number update',()=>{
  const p=plan(['nanpure/index.html'],{old:{'nanpure/index.html':'<script src="/nanpure/releases/2026.11.03.88/main.js"></script>'},next:{'nanpure/index.html':'<script src="/nanpure/releases/2026.11.04.89/main.js"></script><script src="changed.js"></script>'}});
  assert.equal(p.notebook,true);
});
test('the Sudoku search page builder selects the notebook search checks',()=>{
  const p=plan(['scripts/seo/build-seo.mjs']);
  assert.equal(p.notebook,true);
  for(const key of ['wado','corpus','learning','full'])assert.equal(p[key],false);
});
test('corpus changes run independent uniqueness checks, while display-only changes avoid unrelated dictionaries',()=>{
  const p=plan(['nanpure/collection/packs/normal.b64']);assert.equal(p.corpus,true);assert.equal(p.wado,false);
  const ui=plan(['scripts/client-overrides/public/notebook/board-comfort.js']);assert.equal(ui.notebook,true);assert.equal(ui.corpus,false);assert.equal(ui.wado,false);
});
test('changed Wado data in a generated release cannot hide behind versioned copies',()=>{
  const name='nanpure/releases/2026.11.04.89/notebook/wado-data.json';
  const p=plan([name],{old:{'nanpure/releases/2026.11.03.88/notebook/wado-data.json':'{"word":"before"}'},next:{[name]:'{"word":"after"}'}});
  assert.equal(p.wado,true);assert.equal(p.corpus,false);
});
test('dictionary text and reviewed test data still select Wado verification',()=>{
  for(const p of ['scripts/wado/word-list.txt','docs/wado-verification-20261027/hint-matrix.json'])assert.equal(plan([p]).wado,true);
  assert.equal(plan(['unknown-runtime-config.txt']).full,true);
});
test('shared language and theme changes also test the affected standalone puzzles',()=>{
  const p=plan(['scripts/client-overrides/public/site-theme.js']);assert.equal(p.notebook,true);assert.equal(p.wado,true);assert.equal(p.learning,true);assert.equal(p.corpus,false);
});
test('learning changes select learning data validation',()=>assert.equal(plan(['nanpure/learn/routes.json']).learning,true));
test('unknown paths and a manual full check fall back to the complete suite',()=>{
  for(const p of [plan(['unknown-runtime.js']),plan([],{forceFull:true})])for(const key of ['notebook','wado','corpus','learning','full'])assert.equal(p[key],true);
});
test('functional metadata changes cannot be ignored as release bookkeeping',()=>{
  const p=plan(['nanpure/version.json'],{old:{'nanpure/version.json':'{"version":"2026.11.03.88","cloudRetiresAt":1}'},next:{'nanpure/version.json':'{"version":"2026.11.04.89","cloudRetiresAt":2}'}});assert.equal(p.full,true);
});
test('binary content and incomplete release feeds are never normalized into a false match',()=>{
  const b=Buffer.from([255,0,128]);assert(Buffer.isBuffer(normalize(b)));assert(normalize(b).equals(b));
  assert.throws(()=>normalize(Buffer.from('var ka="v",wS=[{'),'shell/main.js'));
});
