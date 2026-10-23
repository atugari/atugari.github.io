const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require(process.argv[2]||'linkedom');
const root=path.resolve(__dirname,'..');require(path.join(root,'web-source/clues.js'));require(path.join(root,'web-source/engine.js'));require(path.join(root,'web-source/paper.js'));require(path.join(root,'web-source/layout.js'));
const {window,document}=parseHTML(fs.readFileSync(path.join(root,'web/index.html'),'utf8'));
for(const select of document.querySelectorAll('select')){let value=select.querySelector('option[selected]')?.getAttribute('value')||select.querySelector('option')?.getAttribute('value')||select.querySelector('option')?.textContent||'';Object.defineProperty(select,'value',{get:()=>value,set:v=>value=String(v),configurable:true});Object.defineProperty(select,'options',{get:()=>[...select.querySelectorAll('option')]});}
for(const e of document.querySelectorAll('*')){e.focus=()=>{};e.scrollIntoView=()=>{};}
document.fonts={load:async()=>[{}]};
const engine=WadoPrint.create(JSON.parse(document.getElementById('dictionary').textContent),JSON.parse(document.getElementById('hint-bank').textContent));
const puzzles=[1,2,3].map(i=>({...engine.generate({level:3,count:4,seed:i}),id:'WA-TEST-0000'+i,created:1}));
const state={format:'wado-print',version:1,preferences:{...WadoLayout.defaults,hint:2,layout:6},puzzles},storage=new Map([['np-wado-print-v1',JSON.stringify(state)]]);
const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
window.scrollTo=()=>{};window.innerHeight=844;window.innerWidth=390;
const context=vm.createContext({window,document,CustomEvent:window.CustomEvent,localStorage,WadoClues,WadoPrint,WadoLayout,WadoPaper,location:{hostname:'example.test'},console,setTimeout,clearTimeout,requestAnimationFrame:()=>1,crypto:require('node:crypto').webcrypto,URL,Blob});
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
const click=e=>e.dispatchEvent(new window.Event('click',{bubbles:true}));
(async()=>{vm.runInContext(fs.readFileSync(path.join(root,'web-source/workspace.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'web-source/live.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'web-source/app.js'),'utf8'),context);await settle();
 assert.equal(document.querySelectorAll('.puzzle-card').length,3);assert.equal(document.querySelector('#error').hidden,true);assert.equal(document.querySelector('#generate').disabled,false);
 const option=document.querySelector('.hint-picker input[value]:not([value=""])'),value=option.value,id=option.dataset.hintPuzzle,text=option.closest('label').textContent;option.checked=true;option.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(JSON.parse(storage.get('np-wado-print-v1')).puzzles.find(p=>p.id===id).hintChoice,value);assert(document.querySelector('.card-hint').textContent.includes(text.slice(text.indexOf('の熟語')+3)));
 const change=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));};
 change('uiSize','largest');change('printText','largest');change('problemSize','large');change('showHeading','no');change('printWeight','bold');
 const saved=JSON.parse(storage.get('np-wado-print-v1'));assert.equal(saved.preferences.uiSize,'largest');assert.equal(saved.preferences.problemSize,'large');assert.equal(saved.preferences.showHeading,false);assert.equal(saved.preferences.printWeight,'bold');assert.equal(document.querySelector('#layout'),null);
 assert.equal(WadoLayout.preferences({level:2,count:4,batch:10,layout:2,hint:1}).problemSize,'medium','old book imports with automatic layout');
 click(document.querySelector('#workspace-tab-print'));assert.equal(document.querySelector('#workspace-create').hidden,true);assert.equal(document.querySelector('#workspace-print').hidden,false);assert.equal(document.querySelector('#workspace-tab-print').getAttribute('aria-selected'),'true');
 click(document.querySelector('[data-workspace-go=library]'));assert.equal(document.querySelector('#workspace-library').hidden,false);
 assert.equal(document.querySelector('#workspace-type-settings').hasAttribute('open'),false);assert.equal(document.querySelector('#workspace-paper-settings').hasAttribute('open'),false);
 console.log('PASS saved UI: hint choice, automatic layout settings, visibility flags, text size, weight and legacy preferences.');
})().catch(e=>{console.error(e);process.exit(1);});
