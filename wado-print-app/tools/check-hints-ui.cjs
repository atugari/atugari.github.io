const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require(process.argv[2]||'linkedom');
const root=path.resolve(__dirname,'..');require(path.join(root,'web-source/clues.js'));require(path.join(root,'web-source/engine.js'));require(path.join(root,'web-source/layout.js'));
const {window,document}=parseHTML(fs.readFileSync(path.join(root,'web/index.html'),'utf8'));
for(const select of document.querySelectorAll('select')){let value=select.querySelector('option[selected]')?.getAttribute('value')||select.querySelector('option')?.getAttribute('value')||select.querySelector('option')?.textContent||'';Object.defineProperty(select,'value',{get:()=>value,set:v=>value=String(v),configurable:true});Object.defineProperty(select,'options',{get:()=>[...select.querySelectorAll('option')]});}
for(const e of document.querySelectorAll('*')){e.focus=()=>{};e.scrollIntoView=()=>{};}
document.fonts={load:async()=>[{}]};
const engine=WadoPrint.create(JSON.parse(document.getElementById('dictionary').textContent),JSON.parse(document.getElementById('hint-bank').textContent));
const puzzles=[1,2,3].map(i=>({...engine.generate({level:3,count:4,seed:i}),id:'WA-TEST-0000'+i,created:1}));
const state={format:'wado-print',version:1,preferences:{...WadoLayout.defaults,hint:2,layout:6},puzzles},storage=new Map([['np-wado-print-v1',JSON.stringify(state)]]);
const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
window.scrollTo=()=>{};window.innerHeight=844;window.innerWidth=390;
const context=vm.createContext({window,document,localStorage,WadoClues,WadoPrint,WadoLayout,location:{hostname:'example.test'},console,setTimeout,clearTimeout,requestAnimationFrame:()=>1,crypto:require('node:crypto').webcrypto,URL,Blob});
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
const click=e=>e.dispatchEvent(new window.Event('click',{bubbles:true}));
(async()=>{vm.runInContext(fs.readFileSync(path.join(root,'web-source/app.js'),'utf8'),context);await settle();
 assert.equal(document.querySelectorAll('.puzzle-card').length,3);assert.equal(document.querySelector('#error').hidden,true);assert.equal(document.querySelector('#generate').disabled,false);
 const option=document.querySelector('.hint-picker input[value]:not([value=""])'),value=option.value,id=option.dataset.hintPuzzle,text=option.closest('label').textContent;option.checked=true;option.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(JSON.parse(storage.get('np-wado-print-v1')).puzzles.find(p=>p.id===id).hintChoice,value);assert(document.querySelector('.card-hint').textContent.includes(text.slice(text.indexOf('の熟語')+3)));
 click(document.querySelector('#preview-questions'));assert.equal(document.querySelectorAll('#paper .hint-picker').length,0);assert.equal(document.querySelectorAll('#paper input').length,0);assert.equal(document.querySelectorAll('#paper .center-box').length,3);assert.equal(document.querySelectorAll('#paper .sheet-hint').length,3);click(document.querySelector('#close-preview'));
 click(document.querySelector('#preview-hints'));assert.equal(document.querySelectorAll('.hint-sheet').length,3);for(const [i,sheet]of [...document.querySelectorAll('.hint-sheet')].entries()){assert(sheet.querySelector('h1').textContent.includes(WadoClues.grades[i].label));assert([...sheet.querySelectorAll('.sheet-hint b')].every(b=>b.textContent.startsWith(WadoClues.grades[i].label)));}
 click(document.querySelector('#close-preview'));const hint=document.querySelector('#hint');hint.value='0';hint.dispatchEvent(new window.Event('change',{bubbles:true}));click(document.querySelector('#preview-questions'));assert.equal(document.querySelectorAll('#paper .sheet-hint').length,0);
 const change=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));};
 click(document.querySelector('#close-preview'));change('uiSize','largest');change('printText','largest');change('hint','2');change('layout','6');
 const saved=JSON.parse(storage.get('np-wado-print-v1'));assert.equal(saved.preferences.uiSize,'largest');assert.equal(saved.preferences.printText,'largest');assert.equal(document.documentElement.style.getPropertyValue('--ui-scale'),'2');
 click(document.querySelector('#preview-questions'));assert.equal(document.querySelectorAll('.sheet').length,2);assert(document.querySelector('.sheet').classList.contains('layout-2'));assert([...document.querySelectorAll('.diagram text')].every(n=>parseFloat(n.style.strokeWidth)<=.554));
 assert.equal(WadoLayout.preferences({level:2,count:4,batch:10,layout:2,hint:1}).uiSize,'normal','old book keeps working');
 console.log('PASS hint UI: one choice, automatic default, persisted choice, labels, blank question centres, no controls on paper, three difficulty sheets, no-hint printing.');
})().catch(e=>{console.error(e);process.exit(1);});
