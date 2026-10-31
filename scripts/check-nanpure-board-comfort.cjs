// Real preference and DOM behavior, with a deterministic clock and isolated saves.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[2]||'linkedom');
const root=path.resolve(__dirname,'..'),source=path.join(root,'scripts/client-overrides/public/notebook');
const {c}=require('./collection-100k/engines.cjs').load();let passed=0;
const modelCode=fs.readFileSync(path.join(source,'board-comfort-model.js'),'utf8'),runtime=fs.readFileSync(path.join(source,'board-comfort.js'),'utf8');
vm.runInContext(modelCode,c);const model=c.NPBoardComfortModel;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
function puzzle(n=9){return{uid:'comfort-'+n,kind:'normal',n,puzzle:Array(n*n).fill(0),solution:Array(n*n).fill(1),grid:Array(n*n).fill(0),notes:{1:[1,3]},elapsed:38};}
check('normal and rectangular blocks cover each cell exactly once',()=>{
 for(const n of [4,6,9,16,25]){const p=puzzle(n),g=model.groups(p);assert.equal(g.regions.length,n);assert(g.regions.every(r=>r.ids.length===n));assert(g.cellKeys.every(keys=>keys.length===1));assert.equal(new Set(g.regions.flatMap(r=>r.ids)).size,n*n);}
 const j={...puzzle(),kind:'jigsaw',regions:Array.from({length:81},(_,i)=>i%9)};assert.deepEqual(Array.from(model.groups(j).regions[0].ids),Array.from({length:9},(_,i)=>i*9));
});
check('mixed boards preserve multiple memberships and per-board block dimensions',()=>{
 const linked=c.NanpureMulti.mixedLayout('custom',[4,9],[{parent:0,dx:3,dy:2}]),p={kind:'multi',n:9,multiVersion:2,linked,puzzle:Array(linked.cells.length).fill(0)},g=model.groups(p);
 assert.equal(g.regions.length,13);assert.equal(g.cellKeys.filter(keys=>keys.length===2).length,2);assert(g.regions.slice(0,4).every(r=>r.ids.length===4));assert(g.regions.slice(4).every(r=>r.ids.length===9));
});
check('preference validation rejects CSS injection and caps stored region choices',()=>{
 const p=model.normalize({template:'unknown',selected:'red;url(x)',guide:'#ABCDEF',hide:'forever',delay:20,regions:{'grid-9-0':'#123456','url(x)':'#ffffff','grid-9-1':'expression(x)'}});
 assert.equal(p.template,'none');assert.equal(p.selected,model.defaults.selected);assert.equal(p.guide,'#abcdef');assert.equal(p.hide,'never');assert.equal(p.delay,3000);assert.equal(JSON.stringify(p.regions),JSON.stringify({'grid-9-0':'#123456'}));
 assert.equal(model.ink('#000000'),'#f9fbf7');assert.equal(model.ink('#ffffff'),'#24362d');
 for(const template of Object.values(model.templates))for(const color of template.regions)assert.equal(model.ink(color),'#24362d');
});
function environment(values=new Map(),blocked=false){
 const p=puzzle(),{window:w}=parseHTML('<html><body><main id="app"><section class="screen"><div class="play-head"></div><div class="np-workspace-tools"></div><div id="board" class="play-board">'+Array.from({length:81},(_,i)=>'<button class="cell '+(i===0?'selected':i<9?'guide':'')+'" data-cell="'+i+'" aria-pressed="'+(i===0)+'"><span>'+((i%9)+1)+'</span></button>').join('')+'</div><div id="number-controls"><button data-number="2">2</button></div><button id="outside">その他</button></section></main></body></html>');
 const frames=[],timers=new Map();let timerId=0;
 Object.defineProperty(w.HTMLOptionElement.prototype,'selected',{configurable:true,get(){return this.hasAttribute('selected');},set(v){if(v)this.setAttribute('selected','');else this.removeAttribute('selected');}});
 Object.defineProperty(w.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.selected)?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.selected=o.value===String(v);}});
 w.HTMLElement.prototype.showModal=function(){this.open=true;this.setAttribute('open','');};w.HTMLElement.prototype.close=function(){this.open=false;this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};w.HTMLElement.prototype.focus=function(){};
 Object.assign(w,{window:w,self:w,NP:c.NP,NanpureAppTest:{getCurrent:()=>p},localStorage:{getItem:k=>values.get(k)||null,setItem(k,v){if(blocked)throw Error('full');values.set(k,v);}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},MutationObserver:class{observe(){}},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
 const ctx=vm.createContext(w);vm.runInContext(modelCode,ctx);vm.runInContext(runtime,ctx);
 function flush(){for(let i=0;frames.length&&i<20;i++)frames.shift()();assert.equal(frames.length,0);}
 function pointer(selector){w.document.querySelector(selector).dispatchEvent(new w.Event('pointerdown',{bubbles:true}));flush();}
 const board=w.document.getElementById('board');flush();
 return{w,p,board,api:w.NPBoardComfort,values,flush,pointer,tick(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());flush();},change(selector,value){const input=w.document.querySelector(selector);input.value=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));flush();}};
}
check('templates, custom block colors and reset preserve every puzzle field',()=>{
 const e=environment(),before=JSON.stringify(e.p);e.api.show();e.change('[data-comfort=template]','sage');
 assert.equal(e.board.dataset.npRegionColors,'true');assert.equal(e.board.querySelector('[data-cell="0"]').style.getPropertyValue('--np-comfort-region'),'#f3f7ed');
 e.change('[data-comfort-region-color]','#abcdef');for(const i of [0,1,2,9,10,11,18,19,20])assert.equal(e.board.querySelector('[data-cell="'+i+'"]').style.getPropertyValue('--np-comfort-region'),'#abcdef');
 assert.notEqual(e.board.querySelector('[data-cell="3"]').style.getPropertyValue('--np-comfort-region'),'#abcdef');
 e.w.document.querySelector('[data-comfort-region-reset]').click();assert.equal(e.board.querySelector('[data-cell="0"]').style.getPropertyValue('--np-comfort-region'),'#f3f7ed');
 e.change('[data-comfort=selected]','#567890');e.change('[data-comfort=guide]','#112233');assert.equal(e.w.document.documentElement.style.getPropertyValue('--np-comfort-guide'),'#112233');assert.equal(JSON.stringify(e.p),before);
 assert.equal(e.w.document.querySelectorAll('.np-workspace-tools [data-board-comfort]').length,1);assert.equal(e.w.document.querySelectorAll('.play-head [data-board-comfort]').length,0);
 const reloaded=environment(e.values);assert.equal(reloaded.api.read().selected,'#567890');assert.equal(reloaded.api.read().template,'sage');
});
check('timer, outside press and keyboard restoration only affect visual highlighting',()=>{
 const e=environment(),before=JSON.stringify(e.p);e.api.save({...e.api.read(),hide:'both',delay:1000});e.pointer('[data-cell="0"]');assert.equal(e.board.dataset.npHighlightHidden,'false');e.tick();assert.equal(e.board.dataset.npHighlightHidden,'true');assert.equal(e.board.querySelector('[data-cell="0"]').getAttribute('aria-pressed'),'true');
 e.pointer('[data-cell="0"]');assert.equal(e.board.dataset.npHighlightHidden,'false');e.pointer('#outside');assert.equal(e.board.dataset.npHighlightHidden,'true');
 e.pointer('[data-number="2"]');assert.equal(e.board.dataset.npHighlightHidden,'false');
 e.board.querySelector('[data-cell="0"]').dispatchEvent(new e.w.Event('keydown',{bubbles:true}));assert.equal(e.board.dataset.npHighlightHidden,'false');
 e.api.save({...e.api.read(),hide:'never'});e.pointer('#outside');e.tick();assert.equal(e.board.dataset.npHighlightHidden,'false');assert.equal(JSON.stringify(e.p),before);
});
check('save failures preserve the active colors and report the error in the dialog',()=>{
 const e=environment(new Map(),true);e.api.show();e.change('[data-comfort=template]','paper');assert.equal(e.api.read().template,'none');assert(e.w.document.querySelector('.np-comfort-status').textContent.includes('保存できません'));assert.equal(e.w.document.documentElement.dataset.npComfortColors,'false');
});
check('a second player receives shared preferences without changing its saved grid',()=>{
 const a=environment(),b=environment(a.values),before=JSON.stringify(b.p);a.api.save({...a.api.read(),template:'blue',selected:'#234567',colorsEnabled:true});const event=new b.w.Event('storage');Object.assign(event,{key:model.key});b.w.dispatchEvent(event);b.flush();assert.equal(b.w.document.documentElement.style.getPropertyValue('--np-comfort-selected'),'#234567');assert.equal(b.board.dataset.npRegionColors,'true');assert.equal(JSON.stringify(b.p),before);
});
console.log(passed+' board-comfort regression groups passed');
