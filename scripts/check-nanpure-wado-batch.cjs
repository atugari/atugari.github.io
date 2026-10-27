// Exercise the real bulk-edit handlers and preservation of the shared save object.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require(process.argv[2]||'linkedom');
const base='scripts/client-overrides/public/notebook/';
for(const name of ['wado-engine','wado-clues','wado-paper','wado-hint-batch'])require('./client-overrides/public/notebook/'+name+'.js');
const bank=JSON.parse(fs.readFileSync(base+'wado-hints.json')),dictionary=JSON.parse(fs.readFileSync(base+'wado-data.json')),engine=NPWado.create(dictionary),clues=WadoClues.create(bank),fingerprint=p=>engine.fingerprint(p),key='np-wado-v1';
const items=[];for(let level=1;level<=3;level++)for(let n=0;n<4;n++){let p;for(let seed=level*100+n*10;!p;seed++){const q=engine.generate({level,count:4,seed});if(clues.rich(q)&&!items.some(p=>fingerprint(p)===fingerprint(q)))p=q;}items.push({...p,created:items.length+1});}
items[0].hintChoice=clues.suggestions(items[0]).find(h=>h.grade===2).id;
const selected=items.slice(0,8).map(fingerprint),page=items.slice(-4).map(fingerprint),standard={target:'selected',selected,page,mode:'uniform',stage:'3',from:'',to:'',limit:'',level:'0',order:'oldest'};
assert.equal(WadoHintBatch.plan(items,standard,fingerprint).matched,8);
assert.equal(WadoHintBatch.plan(items,{...standard,target:'page'},fingerprint).matched,4);
assert.equal(WadoHintBatch.plan(items,{...standard,target:'all',level:'2',from:'6',to:'8',limit:'2'},fingerprint).assignments.map(x=>x.number).join(','),'6,7');
assert.equal(WadoHintBatch.plan(items,{...standard,target:'all',order:'newest',limit:'2'},fingerprint).assignments.map(x=>x.number).join(','),'12,11');
assert.throws(()=>WadoHintBatch.plan(items,{...standard,mode:'mix',counts:{1:9}},fingerprint),/超え/);
for(const extra of [{limit:'-1'},{limit:'1.2'},{from:'5',to:'2'},{mode:'mix',counts:{2:'1.5'}}])assert.throws(()=>WadoHintBatch.plan(items,{...standard,...extra},fingerprint));
const flush=async()=>{for(let n=0;n<8;n++)await new Promise(setImmediate);};
(async()=>{
 const {window,document}=parseHTML(fs.readFileSync(base+'wado.html','utf8'));
 for(const s of document.querySelectorAll('select')){s.add=o=>s.append(o);let value=s.querySelector('option[selected]')?.getAttribute('value')||s.querySelector('option')?.getAttribute('value')||'';Object.defineProperty(s,'value',{get:()=>value,set:v=>value=String(v),configurable:true});}
 Object.defineProperty(document.querySelector('#wado-form'),'elements',{value:Object.fromEntries(['level','wordCount','batch'].map(n=>[n,document.querySelector('[name='+n+']')]))});
 window.scrollTo=()=>{};for(const n of document.querySelectorAll('*'))n.focus=()=>{};
 const initial={version:1,items,preferences:{level:1,wordCount:4,batch:1,printText:'large'},play:{active:fingerprint(items[0]),states:{[fingerprint(items[0])]:{revealed:true,hint:true,grade:2}}}},storage=new Map([[key,JSON.stringify(initial)]]);let quota=false;
 const context=vm.createContext({window,document,CustomEvent:window.CustomEvent,NPWado,WadoClues,WadoPaper,navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(quota)throw Error('保存容量不足');storage.set(k,v);}},fetch:async url=>Response.json(url==='wado-data.json'?dictionary:bank),location:{search:'',replace(){}},URLSearchParams,Option:function(t,v){const n=document.createElement('option');n.textContent=t;n.value=String(v);return n;},Worker:class{},setTimeout,clearTimeout,console});
 for(const name of ['wado-workspace.js','wado-live.js','wado-hint-batch.js','wado-ui.js'])vm.runInContext(fs.readFileSync(base+name,'utf8'),context);await flush();
 const $=id=>document.getElementById(id),click=id=>$(id).dispatchEvent(new window.Event('click',{bubbles:true})),set=(name,value)=>{$('wado-batch-'+name).value=String(value);$('wado-batch-'+name).dispatchEvent(new window.Event('input',{bubbles:true}));},read=()=>JSON.parse(storage.get(key));
 click('wado-select-all');set('mode','mix');for(const [n,value]of [[1,3],[2,2],[3,4],[0,1]])set('count-'+n,value);
 assert.match($('wado-batch-preview').textContent,/残り2問/);assert.match($('wado-batch-preview').textContent,/第1・2・3問/);
 click('wado-batch-apply');await flush();assert.deepEqual(read().items.slice(0,10).map(p=>p.printHintStage),[1,1,1,2,2,3,3,3,3,0]);assert.equal(read().items[0].hintChoice,undefined);assert.deepEqual(read().play,initial.play);assert.deepEqual(read().preferences,initial.preferences);
 click('wado-batch-undo');await flush();assert.deepEqual(read(),initial);
 set('mode','uniform');set('stage','3');set('level','2');set('limit','2');click('wado-batch-apply');await flush();assert.deepEqual(read().items.filter(p=>p.printHintStage===3).map(p=>p.created),[5,6]);click('wado-batch-undo');await flush();assert.deepEqual(read(),initial);
 set('level','0');set('limit','');set('target','page');click('wado-batch-apply');await flush();assert.equal(read().items.filter(p=>p.printHintStage===3).length,4);click('wado-batch-undo');await flush();
 set('target','all');set('mode','mix');set('count-1','99');const unchanged=storage.get(key);assert($('wado-batch-apply').disabled);click('wado-batch-apply');await flush();assert.equal(storage.get(key),unchanged);
 set('mode','uniform');set('stage','2');quota=true;click('wado-batch-apply');await flush();assert.equal(storage.get(key),unchanged);assert.match($('wado-batch-status').textContent,/変更できません/);quota=false;
 // A change in another tab after the preview must be reviewed before writing.
 const changed=read();changed.items[0].printHintStage=0;storage.set(key,JSON.stringify(changed));click('wado-batch-apply');await flush();assert.equal(read().items[0].printHintStage,0);assert.match($('wado-batch-status').textContent,/もう一度確認/);
 click('wado-batch-apply');await flush();assert.equal(read().items[0].printHintStage,2);
 const later=read();later.items[0].printHintStage=3;storage.set(key,JSON.stringify(later));click('wado-batch-undo');await flush();assert.equal(read().items[0].printHintStage,3);assert.match($('wado-batch-status').textContent,/後から変更/);
 // Manual candidate choice also records its real detail level.
 const radio=[...document.querySelectorAll('[data-wado-hint]')].find(n=>n.value);radio.checked=true;radio.dispatchEvent(new window.Event('change',{bubbles:true}));await flush();const p=read().items.find(p=>fingerprint(p)===radio.dataset.wadoHint);assert.equal(p.printHintStage,clues.all(p).find(h=>h.id===radio.value).grade);assert.deepEqual(read().play,initial.play);
 console.log('PASS Wado batch: scoped/count/mixed plans, real saved fields and preview, undo, stale edit protection, quota failure and untouched play/preferences.');
})().catch(e=>{console.error(e);process.exit(1);});
