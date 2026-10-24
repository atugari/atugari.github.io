// DOM integration checks with fixture network responses; no live API or key.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require(process.argv[2]||'linkedom');
require('./client-overrides/public/notebook/wado-engine.js');require('./client-overrides/public/notebook/wado-clues.js');require('./client-overrides/public/notebook/wado-paper.js');
(async()=>{
 const web=await import('../nanpure-api/src/shared/wado-web.js'),data=JSON.parse(fs.readFileSync('scripts/client-overrides/public/notebook/wado-data.json')),engine=NPWado.create(data),bank=JSON.parse(fs.readFileSync('scripts/client-overrides/public/notebook/wado-hints.json')),clues=WadoClues.create(bank),key='np-wado-v1';let p;for(let seed=721;seed<1721;seed++){const candidate=engine.generate({level:1,count:4,seed});if(clues.rich(candidate)){p=candidate;break;}}assert(p,'fixture has semantic hints');
 const {window,document}=parseHTML(fs.readFileSync('scripts/client-overrides/public/notebook/wado.html','utf8'));
 for(const select of document.querySelectorAll('select')){
  select.add=option=>select.append(option);
  let value=select.querySelector('option[selected]')?.getAttribute('value')||select.querySelector('option')?.getAttribute('value')||'';
  Object.defineProperty(select,'value',{get:()=>value,set:v=>{value=String(v);},configurable:true});
 }
 Object.defineProperty(document.querySelector('#wado-form'),'elements',{value:Object.fromEntries(['level','wordCount','batch'].map(name=>[name,document.querySelector('[name='+name+']')]))});
 const storage=new Map([[key,JSON.stringify({version:1,items:[p],preferences:{level:1,wordCount:4,batch:1,layout:2}})]]),before=storage.get(key),requests=[];
 let mode='positive',enabled=true,pendingResolve;
 const fetch=async(url,options={})=>{
  if(url==='wado-data.json')return Response.json(data);if(url==='wado-hints.json')return Response.json(bank);
  if(options.method!=='POST')return Response.json({enabled});
  requests.push(JSON.parse(options.body));
  if(mode==='pending')return new Promise(resolve=>{pendingResolve=resolve;});
  if(mode==='error')return Response.json({error:'上限に達しました。'},{status:429});
  const entries=web.words(requests.at(-1),'龘').map(w=>({...w,sources:[{title:'Fixture source <img src=x>',url:mode==='unsafe'?'javascript:alert(1)':'https://example.test/source'}]}));
  return Response.json({version:1,provider:'Tavily',checkedAt:Date.now(),status:mode==='empty'?'no-candidates-found':'candidates-found',exhaustive:false,candidates:mode==='empty'?[]:[{answer:'龘',words:entries,allWordsFound:true}],queries:[],failedQueries:0,truncated:false});
 };
 window.scrollTo=()=>{};window.CustomEvent=class extends window.Event{constructor(type,opts){super(type);this.detail=opts?.detail;}};for(const node of document.querySelectorAll('*'))node.focus=()=>{};
 const context=vm.createContext({window,document,CustomEvent:window.CustomEvent,NPWado,WadoClues,WadoPaper,NPWadoWeb:web,fetch,navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{replace(){}},Option:function(text,value){const node=document.createElement('option');node.textContent=text;node.value=String(value);return node;},AbortController,AbortSignal,Worker:class{},Date,setTimeout,clearTimeout,console});
 const settle=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
 const click=node=>node.dispatchEvent(new window.Event('click',{bubbles:true}));
 vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/wado-workspace.js','utf8'),context);
 vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/wado-live.js','utf8'),context);
 vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/wado-ui.js','utf8'),context);await settle();
 assert.equal(document.querySelector('[data-wado-play]'),null,'screen play entry is removed');
 assert(document.querySelector('.wado-question'),'saved puzzle loads');assert.equal(document.querySelector('#wado-web-after').disabled,false);
 const panel=document.querySelector('.wado-web-panel'),auto=panel.querySelector('.wado-web-auto');assert.equal(auto.disabled,false);
 const href=panel.querySelector('a').getAttribute('href');assert.equal(new URL(href).origin,'https://www.google.com');assert(new URL(href).searchParams.get('q').includes('二字熟語'));
 panel.querySelector('input').value='受';panel.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));assert(panel.querySelector('.wado-web-candidate-links').textContent.includes('受'),'any candidate can generate network links');
 const checkbox=document.querySelector('.wado-question input');checkbox.checked=true;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));
 click(auto);await settle();assert.match(panel.querySelector('.wado-web-result').textContent,/別解候補が見つかりました/);assert.equal(document.querySelector('#wado-selected').textContent,'1問を選択中','finding another answer preserves print selection');assert.equal(panel.querySelector('.wado-web-result img'),null,'provider markup is escaped');assert.deepEqual(requests[0],{arms:p.arms,answer:p.answer});assert.equal(storage.get(key),before,'network results never overwrite saved puzzles');
 mode='empty';click(auto);await settle();assert.match(panel.querySelector('.wado-web-result').textContent,/唯一解の証明ではありません/);
 mode='error';click(auto);await settle();assert.match(panel.querySelector('.wado-web-result').textContent,/上限/);
 mode='unsafe';click(auto);await settle();assert.match(panel.querySelector('.wado-web-result').textContent,/リンクを確認/);assert.equal(panel.querySelector('a[href^="javascript:"]'),null);
 mode='pending';click(auto);await settle();click(document.querySelector('#wado-web-stop'));pendingResolve(Response.json({version:1}));await settle();assert.match(panel.querySelector('.wado-web-result').textContent,/リンクを確認/,'late aborted response cannot replace prior result');assert.equal(auto.disabled,false);
 const form=document.querySelector('#wado-check-form');form.querySelector('[name=top]').value='感';form.querySelector('[name=right]').value='配';click(document.querySelector('#wado-web-manual-open'));assert(document.querySelector('#wado-web-manual a'),'manual network search does not require dictionary inspection');
 assert.equal(storage.get(key),before);
 const candidate=[...document.querySelectorAll('[data-wado-hint]')].find(n=>n.value);assert(candidate,'different semantic hints offered');const value=candidate.value;candidate.checked=true;candidate.dispatchEvent(new window.Event('change',{bubbles:true}));await settle();assert.equal(JSON.parse(storage.get(key)).items[0].hintChoice,value,'one chosen hint is saved');
 const preserved={...JSON.parse(storage.get(key)).items[0]};delete preserved.hintChoice;assert.deepEqual(preserved,JSON.parse(JSON.stringify(p)),'hint choice keeps the original puzzle');
 for(const id of ['wado-ui-size','wado-print-text']){const n=document.getElementById(id);n.value='largest';n.dispatchEvent(new window.Event('change',{bubbles:true}));}await settle();const prefs=JSON.parse(storage.get(key)).preferences;assert.equal(prefs.uiSize,'largest');assert.equal(prefs.printText,'largest');assert.equal(document.getElementById('wado-layout'),null);
 click(document.querySelector('#workspace-tab-print'));assert.equal(document.querySelector('#workspace-create').hidden,true);assert.equal(document.querySelector('#workspace-print').hidden,false);assert.equal(document.querySelector('#workspace-tab-print').getAttribute('aria-selected'),'true');
 click(document.querySelector('[data-workspace-go=library]'));assert.equal(document.querySelector('#workspace-library').hidden,false);
 assert.equal(document.querySelector('#workspace-type-settings').hasAttribute('open'),false);assert.equal(document.querySelector('#workspace-paper-settings').hasAttribute('open'),false);
 console.log('PASS Wado network UI: external query links, arbitrary candidates, fixture automatic results, accepted alternatives and print selection, empty/error/unsafe/late responses, manual network search and storage isolation. Live provider connectivity is not tested.');
})().catch(error=>{console.error(error);process.exit(1);});
