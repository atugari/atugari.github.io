// Mask geometry and actual editor actions: fills, symmetry, shape preview, undo and persistence.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('scripts/client-overrides/public/notebook/pattern-model.js','utf8'),pure={};vm.runInNewContext(code,pure);const model=pure.NPPatternModel;
const blank=()=>Array(81).fill(false),flat=a=>Array.from(a),count=a=>a.filter(Boolean).length;
assert.equal(count(model.draw(blank(),0,80,{tool:'line'})),9);
assert.deepEqual(flat(model.draw(blank(),0,80,{tool:'line'})).flatMap((v,i)=>v?[i]:[]),Array.from({length:9},(_,i)=>i*10));
const frame=model.draw(blank(),10,30,{tool:'rectangle'});assert.equal(count(frame),8);assert(!frame[20]);assert.equal(count(model.draw(blank(),30,10,{tool:'solid'})),9);
assert.equal(count(model.draw(frame,20,20,{tool:'fill'})),9);const outside=model.draw(frame,0,0,{tool:'fill'});assert.equal(count(outside),80);assert(!outside[20]);
const islands=blank();islands[0]=islands[10]=true;const erased=model.draw(islands,0,0,{tool:'fill',value:false});assert(!erased[0]);assert(erased[10],'Diagonal cells are not flood-connected');assert(islands[0],'Inputs are not mutated');
for(const symmetry of ['horizontal','vertical','point','both'])for(const tool of ['pen','line','rectangle','solid','fill']){
 const next=model.draw(blank(),10,29,{tool,symmetry});next.forEach((v,i)=>{for(const at of model.symmetricCells(i,symmetry))assert.equal(next[at],v);});
}
const edge=blank();edge[0]=edge[80]=true;assert.equal(count(model.shift(edge,-1,0)),1);assert(model.shift(edge,-1,0)[79]);assert(!model.shift(edge,-1,0)[8],'Movement does not wrap');
const corner=blank();corner[0]=corner[1]=true;const centered=model.center(corner);assert.deepEqual(flat(centered).flatMap((v,i)=>v?[i]:[]),[39,40]);assert.equal(count(model.center(blank())),0);
for(const options of [{tool:'unknown'},{value:1},{symmetry:'unknown'}])assert.throws(()=>model.draw(blank(),0,1,options));assert.throws(()=>model.draw(blank(),-1,81));assert.throws(()=>model.shift(blank(),9,0));
const {parseHTML}=require(process.argv[2]||'linkedom'),{window:w}=parseHTML('<html><body><main id="app"></main></body></html>'),values=new Map();
const stored=JSON.stringify({mask:blank(),symmetry:'none',difficulty:0,omit:0}),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};values.set('nanpure-pattern-draft-v1',stored);
let activeJob=null;const queue={list:()=>activeJob?[activeJob]:[],get:id=>activeJob?.id===id?activeJob:null,subscribe(){},persist(){},hasStorageError:()=>false,add:input=>activeJob={...JSON.parse(JSON.stringify(input)),id:'job',number:1,state:'checking',started:Date.now(),attempts:0,result:null,options:input.options}};
Object.assign(w,{NPPatternQueue:queue,innerHeight:844,localStorage:storage});Object.defineProperty(w.document.documentElement,'clientWidth',{value:390});
w.HTMLElement.prototype.showModal=function(){this.open=true;};w.HTMLElement.prototype.close=function(){this.open=false;};
Object.defineProperty(w.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.selected)?.value||this.options[0]?.value||'';},set(value){for(const option of this.options)option.selected=option.value===value;}});
const sandbox={window:w,document:w.document,localStorage:storage,NP:{levelText:n=>'Lv.'+n},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,Date,console};vm.createContext(sandbox);vm.runInContext(code,sandbox);vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/pattern-ui.js','utf8'),sandbox);
const mount=()=>w.NPPattern.mount(w.document.getElementById('app'),{save:async()=>{},saved(){},back(){}});mount();
const find=s=>w.document.querySelector(s),click=el=>{if(typeof el==='string')el=find(el);const event=new w.Event('click',{bubbles:true,cancelable:true});event.detail=0;el.dispatchEvent(event);},change=(s,value)=>{const el=find(s);el.checked=true;if(value!==undefined)el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));},mask=()=>Array.from(w.document.querySelectorAll('[data-pixel]'),el=>el.getAttribute('aria-pressed')==='true'),open=()=>click('[data-pattern-quick="draw"]');
open();assert(!find('[data-pattern-draw-panel="drawing"]').hidden);assert(find('[data-pattern-draw-panel="conditions"]').hidden);
click('[data-pattern-fill="black"]');assert.equal(count(mask()),81);click('[data-pattern-undo]');assert.equal(count(mask()),0);click('[data-pattern-redo]');assert.equal(count(mask()),81);
open();click('[data-pattern-fill="white"]');assert.equal(count(mask()),0);click('[data-pattern-undo]');assert.equal(count(mask()),81);open();click('[data-pattern-fill="invert"]');assert.equal(count(mask()),0);
open();change('[data-pattern-symmetry][value="horizontal"]');click('[data-pattern-tools-close]');click('[data-pixel="0"]');assert.deepEqual(mask().flatMap((v,i)=>v?[i]:[]),[0,8]);click('[data-pattern-undo]');assert.equal(count(mask()),0);
open();change('[data-pattern-symmetry][value="none"]');change('[data-pattern-draw-tool][value="line"]');click('[data-pattern-tools-close]');click('[data-pixel="0"]');assert.equal(count(mask()),0);assert(find('[data-pixel="0"]').classList.contains('draw-start'));click('[data-pixel="80"]');assert.equal(count(mask()),9);click('[data-pattern-undo]');assert.equal(count(mask()),0);
open();change('[data-pattern-draw-tool][value="rectangle"]');click('[data-pattern-tools-close]');click('[data-pixel="10"]');click('[data-pixel="30"]');assert.equal(count(mask()),8);
open();change('[data-pattern-draw-tool][value="fill"]');click('[data-pattern-tools-close]');click('[data-pixel="20"]');assert.equal(count(mask()),9);click('[data-pattern-undo]');assert.equal(count(mask()),8);
const before=mask();open();click('[data-pattern-shift="right"]');assert.equal(count(mask()),8);click('[data-pattern-undo]');assert.deepEqual(mask(),before);
const key=new w.Event('keydown',{bubbles:true,cancelable:true});Object.assign(key,{key:'z',ctrlKey:true});find('[data-pixel="10"]').dispatchEvent(key);assert.equal(count(mask()),0);click('[data-pattern-redo]');assert.equal(count(mask()),8);
// New pointer positions replace the previous shape preview, rather than leaving trails.
open();click('[data-pattern-fill="white"]');open();change('[data-pattern-draw-tool][value="line"]');click('[data-pattern-tools-close]');
const grid=find('.pattern-grid');let captured=false;grid.setPointerCapture=()=>captured=true;grid.hasPointerCapture=()=>captured;grid.releasePointerCapture=()=>captured=false;w.document.elementFromPoint=(x,y)=>find('[data-pixel="'+(y*9+x)+'"]');
const pointer=(type,target,x,y)=>{const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{button:0,pointerId:1,clientX:x,clientY:y});target.dispatchEvent(e);};
pointer('pointerdown',find('[data-pixel="0"]'),0,0);pointer('pointermove',grid,8,0);assert.equal(count(mask()),9);pointer('pointermove',grid,0,8);assert.equal(count(mask()),9);assert(!mask()[8]);assert(mask()[72]);pointer('pointerup',grid,0,8);click('[data-pattern-undo]');assert.equal(count(mask()),0);click('[data-pattern-redo]');assert.equal(count(mask()),9);
open();change('[data-pattern-brush][value="erase"]');change('[data-pattern-symmetry][value="point"]');change('[data-pattern-draw-tool][value="solid"]');click('[data-pattern-tools-close]');const saved=mask();w.NPPattern.close();mount();assert.deepEqual(mask(),saved);assert(find('[data-pattern-brush][value="erase"]').checked);assert(find('[data-pattern-symmetry][value="point"]').checked);assert(find('[data-pattern-draw-tool][value="solid"]').checked);
// The editor changes never mutate an already submitted pattern job.
open();click('[data-pattern-tools-close]');click('[data-pattern-quick="presets"]');click('[data-pattern-preset="heart"]');click('[data-pattern-view="preview"]');const submitted=activeJob.mask.slice();click('[data-pattern-view="paint"]');open();click('[data-pattern-fill="black"]');assert.deepEqual(activeJob.mask,submitted);assert.equal(activeJob.state,'checking');w.NPPattern.close();
console.log('PASS drawing: lines/rectangles/flood boundaries, five symmetries, non-wrapping moves, single-step undo/redo, replaceable pointer preview, keyboard, saved tools and immutable generation jobs');
