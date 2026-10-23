// Exercise real special-game render/update handlers with keyboard focus preserved.
// Usage: node scripts/check-nanpure-special-keyboard.cjs /path/to/linkedom
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[2]||'linkedom');
const repo=path.resolve(__dirname,'..'),overrides=path.join(repo,'scripts/client-overrides/public/notebook');
const assets=path.join(repo,require('../nanpure/release-manifest.json').base,'notebook');
function environment(html='<html><head></head><body><main id="app"></main><dialog id="dialog"></dialog><div id="paper"></div><p id="status"></p></body></html>'){
 const {window:w}=parseHTML(html),values=new Map();let active=w.document.body;
 Object.assign(w,{window:w,self:w,console,URL,URLSearchParams,TextEncoder,TextDecoder,structuredClone,queueMicrotask,setTimeout,clearTimeout,
  localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)},
  location:{origin:'https://atugari.github.io',protocol:'https:',pathname:'/nanpure/notebook/',replace(){}},
  requestAnimationFrame:()=>0,cancelAnimationFrame(){},setInterval:()=>0,clearInterval(){},scrollTo(){},print(){},
  matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})
 });
 w.parent=w;
 Object.defineProperty(w.document,'activeElement',{get:()=>active?.isConnected?active:w.document.body,configurable:true});
 w.HTMLElement.prototype.focus=function(){active=this;this.dispatchEvent(new w.Event('focusin',{bubbles:true}))};
 w.HTMLElement.prototype.blur=function(){if(active===this)active=w.document.body};
 w.HTMLElement.prototype.showModal=function(){this.open=true;this.setAttribute('open','')};
 w.HTMLElement.prototype.close=function(){this.open=false;this.removeAttribute('open')};
 const context=vm.createContext(w);
 const run=(code,file='fixture')=>vm.runInContext(code,context,{filename:file});
 const load=(file,custom=false)=>run(fs.readFileSync(path.join(custom?overrides:assets,file),'utf8'),file);
 const get=selector=>{const element=w.document.querySelector(selector);assert(element,'Missing '+selector);return element};
 const activate=selector=>{const element=typeof selector==='string'?get(selector):selector;element.focus();element.click();return element};
 const key=(name,extra={},target=w.document.activeElement)=>{const event=new w.Event('keydown',{bubbles:true,cancelable:true});Object.assign(event,{key:name,...extra});target.dispatchEvent(event);return event};
 const event=(node,name)=>node.dispatchEvent(new w.Event(name,{bubbles:true,cancelable:true}));
 // Linkedom's tabIndex getter treats 0 as its fallback; inspect the rendered attribute.
 const stops=selector=>Array.from(w.document.querySelectorAll(selector)).filter(node=>!node.disabled&&node.getAttribute('tabindex')==='0');
 return{w,values,run,load,get,activate,key,event,stops};
}
function guardedMovement(env,selector){
 const first=env.get(selector);first.focus();
 for(const flags of [{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{isComposing:true},{keyCode:229}]){
  env.key('ArrowRight',flags);assert.equal(env.w.document.activeElement,first,'Modified/composing keys must not move a board cursor');
 }
 const dialog=env.get('#dialog');dialog.showModal();
 assert(env.key('ArrowRight').defaultPrevented,'A dialog must block the background board');
 assert.equal(env.w.document.activeElement,first);dialog.close();
}

// Course tutorial: activate actual lesson boundaries, retaining the focused replacement.
const shiruHTML=fs.readFileSync(path.join(overrides,'shirupure.html'),'utf8');
const shiru=environment(shiruHTML);
for(const match of shiruHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())shiru.run(match[1],'shirupure inline');
shiru.activate('[data-act="learn"]');
assert.equal(shiru.stops('.board button').length,1);
guardedMovement(shiru,'.board button[data-edge]');
// Every boundary is reachable from the first one using directional navigation.
const firstEdge=shiru.get('.board button[data-edge]').dataset.edge,seen=new Set([firstEdge]),pending=[firstEdge];
while(pending.length){const edge=pending.shift();for(const name of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){
 shiru.get('[data-edge="'+edge+'"]').focus();shiru.key(name);
 const reached=shiru.w.document.activeElement.dataset.edge;if(!seen.has(reached)){seen.add(reached);pending.push(reached)}
}}
assert.equal(seen.size,shiru.w.document.querySelectorAll('.board button[data-edge]').length,'All boundary orientations must remain reachable');
for(const edge of ['1-2','5-6','9-10']){
 shiru.activate('[data-edge="'+edge+'"]');
 assert.equal(shiru.w.document.activeElement.dataset.edge,edge,'Tutorial redraw retains the activated boundary');
 assert.equal(shiru.stops('.board button').length,1);
}
assert(shiru.get('[data-act="lesson-next"]'));
shiru.activate('[data-act="lesson-next"]');
for(const edge of ['8-9','9-10'])shiru.activate('[data-edge="'+edge+'"]');
shiru.activate('[data-act="lesson-next"]');
shiru.activate('[data-act="mode"][data-mode="color"]');
assert.equal(shiru.w.document.activeElement.dataset.mode,'color');
assert.equal(shiru.stops('.board button').length,1);
shiru.get('[data-cell="0"]').focus();shiru.key('ArrowRight');assert.equal(shiru.w.document.activeElement.dataset.cell,'1');
shiru.activate(shiru.w.document.activeElement);assert.equal(shiru.w.document.activeElement.dataset.cell,'1');
assert(shiru.get('[data-cell="1"]').classList.contains('color-1'));
shiru.key('End');assert.equal(shiru.w.document.activeElement.dataset.cell,'11');

// Prototype room/path samples use real render and persistence handlers, without generation.
const prototype=environment();
prototype.w.NP={esc:value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))};
prototype.w.NP_ROOM_SAMPLES=[structuredClone(shiru.w.PUZZLES[0])];
prototype.load('path-samples.js');prototype.load('prototype.js',true);
prototype.w.NPPrototype.mount(prototype.get('#app'),()=>{});
prototype.activate('[data-proto="category"][data-page="paths"]');prototype.activate('[data-proto="open"]');
assert.equal(prototype.stops('.proto-board button').length,1);
guardedMovement(prototype,'.path-cell');
prototype.activate('[data-cell="0"]');
prototype.key('ArrowRight');assert.equal(prototype.w.document.activeElement.dataset.cell,'1');
assert.equal(prototype.w.NPPrototype.exportData().states[prototype.w.NPPrototype.getRoute().id].walls.length,0,'Moving alone must not draw a path');
prototype.activate(prototype.w.document.activeElement);
assert.equal(prototype.w.document.activeElement.dataset.cell,'1');
assert(prototype.w.NPPrototype.exportData().states[prototype.w.NPPrototype.getRoute().id].walls.includes('0-1'));
prototype.key('ArrowRight');prototype.activate(prototype.w.document.activeElement);
prototype.activate('[data-proto="undo"]');assert.equal(prototype.w.document.activeElement.dataset.proto,'undo');
prototype.activate('[data-proto="undo"]');
assert(prototype.w.document.activeElement.matches('.path-cell'),'An exhausted, disabled undo returns focus to the board');
assert.equal(prototype.w.NPPrototype.exportData().states[prototype.w.NPPrototype.getRoute().id].walls.length,0);
prototype.w.NPPrototype.mount(prototype.get('#app'),()=>{});
prototype.activate('[data-proto="category"][data-page="rooms"]');
prototype.activate('[data-proto="category"][data-page="original"]');prototype.activate('[data-proto="open"]');
prototype.activate('.proto-edge');assert(prototype.w.document.activeElement.matches('.proto-edge'));
assert.equal(prototype.stops('.proto-board button').length,1);

// Crossword: arrows skip a black square, Enter reaches the existing word form,
// and form submissions continue to respect active IME composition.
const crossword=environment();
for(const file of ['crossword-words.js','crossword-clues.js','crossword-layouts.js','crossword-layout.js','crossword-engine.js'])crossword.load(file);
const puzzle={id:'keyboard-crossword',n:3,grid:['カ','キ','ク','サ',null,'シ','タ','チ','ツ'],input:Array(9).fill(''),done:false,hints:0,options:crossword.w.Crossword.options({}),entries:[
 {r:0,c:0,d:0,num:1,answer:'カキク',clue:'最初の横'},
 {r:0,c:0,d:1,num:1,answer:'カサタ',clue:'左の縦'},
 {r:0,c:2,d:1,num:2,answer:'クシツ',clue:'右の縦'},
 {r:2,c:0,d:0,num:3,answer:'タチツ',clue:'最後の横'}
]};
crossword.w.CrosswordStore={load:()=>({size:0,options:crossword.w.Crossword.options({}),list:[puzzle],current:puzzle.id}),save:()=>true};
crossword.load('crossword-ui.js',true);crossword.activate('[data-action="resume"]');
assert.equal(crossword.stops('#cw-play .board button').length,1);
guardedMovement(crossword,'#cw-play .board button');
crossword.get('[data-cell="3"]').focus();crossword.key('ArrowRight');assert.equal(crossword.w.document.activeElement.dataset.cell,'5','Skip the black square');
crossword.key('Enter');assert.equal(crossword.w.document.activeElement.id,'answer');
const answer=crossword.get('#answer');
crossword.key('ArrowLeft',{},answer);assert.equal(crossword.w.document.activeElement,answer,'Text editing arrows stay in the input');
answer.value='くしつ';crossword.event(answer,'compositionstart');crossword.event(crossword.get('#entry-form'),'submit');
assert.equal(puzzle.input[2],'','IME composition must not submit a word');
crossword.event(answer,'compositionend');crossword.event(crossword.get('#entry-form'),'submit');
assert.equal(puzzle.input[2],'ク');assert.equal(puzzle.input[5],'シ');assert.equal(puzzle.input[8],'ツ');
assert.equal(crossword.w.document.activeElement,answer);
crossword.activate('[data-action="next"]');assert.equal(crossword.w.document.activeElement.dataset.action,'next');

// Scale choices retain focus through redraw so Tab can reach the answer action.
const tenbin=environment();tenbin.load('tenbin-engine.js');
const scale=tenbin.w.Tenbin.generate(0);
tenbin.values.set('nanpure-symbol-tenbin-v1',JSON.stringify({level:0,list:[scale],current:scale.id}));
tenbin.load('tenbin-ui.js',true);tenbin.activate('[data-action="resume"]');
assert.equal(tenbin.stops('.choices button').length,1);
guardedMovement(tenbin,'.choices button');
tenbin.key('ArrowRight');assert.equal(tenbin.w.document.activeElement.dataset.choice,'1');
tenbin.activate(tenbin.w.document.activeElement);
assert.equal(tenbin.w.document.activeElement.dataset.choice,'1');
assert(!tenbin.get('[data-action="check"]').disabled);
assert.equal(tenbin.stops('.choices button').length,1);
const current=tenbin.w.NPTenbin.current();tenbin.activate('[data-choice="'+tenbin.w.Tenbin.winner(current)+'"]');
tenbin.activate('[data-action="check"]');assert(tenbin.w.NPTenbin.current().done);
assert.equal(tenbin.w.document.activeElement.dataset.action,'next','Completion focuses the available next puzzle action');

console.log('PASS special-game keyboard: course lessons and colors, all boundary orientations reachable, prototype rooms/paths and undo, crossword black-square navigation and IME word entry, scale choices, focus across redraw, single tab stops, modifier/dialog guards');
