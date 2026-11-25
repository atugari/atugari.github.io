// Preserve puzzle contents and preferences while changing shared reading settings.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[2]||'linkedom');
const catalog=require('./i18n/catalog.cjs'),names=require('./i18n/languages.json');
const runtime=fs.readFileSync('scripts/i18n/runtime.js','utf8'),furigana=fs.readFileSync('scripts/furigana.js','utf8');
const model=fs.readFileSync('scripts/client-overrides/public/notebook/board-comfort-model.js','utf8');
const labels=vm.runInNewContext('('+model.match(/const labels=({[\s\S]*?\n });/)[1]+')');
for(const key of Object.keys(labels))for(const locale of Object.keys(names).filter(l=>l!=='ja'))assert(catalog[key]?.[locale],locale+' missing '+key);
assert(!model.includes('languages.map(code=>[code,en])'),'No English copy assigned to every language');
function boot(locale){
 const {window:w}=parseHTML('<html lang="ja"><head><title>和同開珎</title></head><body><h1>和同開珎</h1><p>問題の難しさ</p><button data-np-furigana>ふりがな OFF</button><div class="welcome-board"><span class="sample">学</span></div><div id="play-board"><span class="cell">色</span></div><div class="cluelist"><button>まっすぐな道</button></div><textarea>家族用のメモ</textarea><div id="board"><button class="cell" data-cell="0">3</button></div></body></html>');
 const values=new Map(),frames=[];
 Object.assign(w,{window:w,parent:w,NodeFilter:{SHOW_TEXT:4},URLSearchParams,location:{search:'?lang='+locale,origin:'https://example.test'},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))},NPTranslations:structuredClone(catalog),requestAnimationFrame:fn=>{frames.push(fn);return frames.length},setTimeout:fn=>{frames.push(fn);return frames.length},console});
 const context=vm.createContext(w);vm.runInContext(runtime,context);vm.runInContext(furigana,context);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));return w;
}
let count=0;
for(const locale of Object.keys(names).filter(l=>l!=='ja')){
 const w=boot(locale),d=w.document,cell=d.querySelector('#board .cell'),input=d.querySelector('textarea');
 assert.equal(d.querySelector('h1').textContent,catalog['和同開珎'][locale]);assert(!/[ぁ-んァ-ヶ]/.test(w.NPI18n.t('3 秒')),locale+' second units');
 assert.equal(d.querySelector('#play-board .cell').textContent,'色');assert.equal(d.querySelector('.welcome-board .sample').textContent,'学');assert.equal(d.querySelector('.cluelist button').textContent,'まっすぐな道');assert.equal(input.value,'家族用のメモ');
 w.NPI18n.set('ja');w.NPFurigana.setEnabled(true);assert(d.querySelector('h1 ruby'));assert(!d.querySelector('#play-board ruby,.welcome-board ruby,.cluelist ruby,#board ruby'));assert.strictEqual(d.querySelector('#board .cell'),cell);assert.strictEqual(d.querySelector('textarea'),input);
 w.NPI18n.set(locale);assert.equal(d.querySelectorAll('ruby[data-np-ruby]').length,0);assert.equal(d.querySelector('h1').textContent,catalog['和同開珎'][locale]);count++;
}
for(const route of ['shirupure','wado','crossword','studio'])assert(fs.readFileSync('puzzles/'+route+'/index.html','utf8').includes('/nanpure/assets/reading-tools.js'));
console.log('PASS shared reading:',count,'foreign languages; original kanji/clues, memo, digits and DOM preserved; reversible ruby; shared language preferences; 4 public entry routes.');
