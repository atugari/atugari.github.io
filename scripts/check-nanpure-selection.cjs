// Actual settings/event code and board renderer: shared selection designs must
// survive reloads without editing a puzzle or resetting its selection/zoom.
// node scripts/check-nanpure-selection.cjs [path-to-linkedom]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {parseHTML}=require(process.argv[2]||'linkedom');
const root=path.join(__dirname,'client-overrides'),key='np-selection-design-v1',passed=[];
function check(name,fn){fn();passed.push(name)}
const storage=(values,blocked=false)=>({getItem(k){if(blocked)throw Error('storage unavailable');return values.get(k)??null},setItem(k,v){if(blocked)throw Error('storage unavailable');values.set(k,String(v))}});
const helper=fs.readFileSync(path.join(root,'app/selection-design.ts'),'utf8');
const settingsSource=fs.readFileSync(path.join(root,'app/play-settings.tsx'),'utf8');
const settings=settingsSource.slice(settingsSource.indexOf('export const defaultSettings='),settingsSource.indexOf('export default function PlaySettings('));
const nativeCode=stripTypeScriptTypes(helper+'\n'+settings).replace(/^export /gm,'')+'\nthis.api={readSelectionDesign,saveSelectionDesign,watchSelectionDesign,readSettings};';
function native(values=new Map(),blocked=false){
 const window=new EventTarget(),ctx=vm.createContext({window,localStorage:storage(values,blocked),CustomEvent});
 vm.runInContext(nativeCode,ctx);return{window,api:ctx.api};
}
function storageEvent(target,EventType,k=key,value=null){const event=new EventType('storage');Object.assign(event,{key:k,newValue:value});target.dispatchEvent(event)}
function notebook(values=new Map(),blocked=false){
 const {window:w}=parseHTML('<html><head></head><body><main id="app"><section class="screen"><div class="play-head"></div><div id="board-scroll"><div id="board" class="play-board"><button class="cell selected" data-cell="10" aria-pressed="true">5</button></div></div><div class="play-dock"></div><details><summary>遊び方の設定</summary><select id="display-mode"><option value="light">白</option></select></details><details><summary>ルール</summary></details></section></main></body></html>');
 const frames=[],board=w.document.getElementById('board'),cell=board.firstElementChild;
 const puzzle={grid:[0,5,0],notes:{2:[1,3]},elapsed:18};const before=JSON.stringify(puzzle);
 Object.assign(w,{window:w,self:w,localStorage:storage(values,blocked),requestAnimationFrame:fn=>{frames.push(fn);return frames.length},MutationObserver:class{observe(){}disconnect(){}},NanpureAppTest:{getCurrent:()=>puzzle}});
 // Linkedom clears every sibling when option.selected=false. Native browsers
 // only clear that option, so model the platform property for this DOM test.
 Object.defineProperty(w.HTMLOptionElement.prototype,'selected',{configurable:true,get(){return this.hasAttribute('selected')},set(v){if(v)this.setAttribute('selected','');else this.removeAttribute('selected')}});
 Object.defineProperty(w.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.selected)?.value||this.options[0]?.value||''},set(v){for(const o of this.options)o.selected=o.value===v}});
 w.HTMLElement.prototype.showModal=function(){this.open=true};w.HTMLElement.prototype.close=function(){this.open=false};
 const ctx=vm.createContext(w);vm.runInContext(fs.readFileSync(path.join(root,'public/notebook/play-options.js'),'utf8'),ctx);
 const flush=()=>{for(let i=0;frames.length&&i<20;i++)frames.shift()();assert.equal(frames.length,0,'settings settle')};flush();
 const select=w.document.getElementById('np-selection-design');assert(select,'selection setting is present');
 return{w,select,board,cell,flush,design:()=>w.document.documentElement.dataset.npSelectionDesign,choose(value){select.value=value;select.dispatchEvent(new w.Event('change',{bubbles:true}));flush()},unchanged(){assert.equal(JSON.stringify(puzzle),before);assert.equal(board.firstElementChild,cell);assert.equal(cell.getAttribute('aria-pressed'),'true')}};
}
check('new and invalid preferences use guide; legacy native settings keep their other values',()=>{
 for(const v of [null,'not-a-style','{"selectionDesign":"solid"}']){
  const values=new Map(v===null?[]:[[key,v]]);assert.equal(native(values).api.readSelectionDesign(),'guide');assert.equal(notebook(values).design(),'guide');
 }
 const prefs=native().api.readSettings({palette:'rose',digitSize:120,area:false});assert.equal(prefs.selectionDesign,'guide');assert.equal(prefs.palette,'rose');assert.equal(prefs.digitSize,120);assert.equal(prefs.area,false);
 assert.equal(native().api.readSettings({selectionDesign:'bad'}).selectionDesign,'guide');
});
check('native saves broadcast in-document once and watchers unsubscribe',()=>{
 const values=new Map(),n=native(values),events=[],off=n.api.watchSelectionDesign(v=>events.push(v));
 n.api.saveSelectionDesign('outline');assert.equal(values.get(key),'outline');assert.deepEqual(events,['outline']);
 storageEvent(n.window,Event,'unrelated','solid');assert.deepEqual(events,['outline']);off();n.api.saveSelectionDesign('solid');assert.deepEqual(events,['outline']);
});
check('all three notebook choices stay inside settings and persist on reload',()=>{
 const values=new Map(),b=notebook(values);assert(b.select.closest('#np-play-settings'));assert.equal(b.w.document.querySelectorAll('#np-selection-design').length,1);
 assert.deepEqual([...b.select.options].map(o=>o.value),['guide','outline','solid']);
 for(const style of ['outline','solid','guide']){b.choose(style);assert.equal(b.design(),style);assert.equal(values.get(key),style);assert.equal(native(values).api.readSelectionDesign(),style);assert.equal(notebook(values).design(),style);b.unchanged()}
});
check('native and notebook receive shared preference changes in both directions',()=>{
 const values=new Map(),n=native(values),b=notebook(values),events=[];const off=n.api.watchSelectionDesign(v=>events.push(v));
 n.api.saveSelectionDesign('outline');storageEvent(b.w,b.w.Event,key,values.get(key));assert.equal(b.design(),'outline');assert.equal(b.select.value,'outline');
 b.choose('solid');storageEvent(n.window,Event,key,values.get(key));assert.equal(events.at(-1),'solid');assert.equal(n.api.readSelectionDesign(),'solid');
 values.delete(key);storageEvent(b.w,b.w.Event,null);storageEvent(n.window,Event,null);assert.equal(b.design(),'guide');assert.equal(b.select.value,'guide');assert.equal(events.at(-1),'guide');
 b.unchanged();off();
});
check('blocked storage keeps controls usable for the current session',()=>{
 const n=native(new Map(),true),events=[];n.api.watchSelectionDesign(v=>events.push(v));assert.equal(n.api.readSelectionDesign(),'guide');n.api.saveSelectionDesign('solid');assert.deepEqual(events,['solid']);
 const b=notebook(new Map(),true);b.choose('outline');assert.equal(b.design(),'outline');b.unchanged();
});
check('backup validation preserves all designs and accepts legacy backups without one',()=>{
 const ctx=vm.createContext({});const source=fs.readFileSync(path.join(root,'lib/backup.ts'),'utf8');
 vm.runInContext(stripTypeScriptTypes(source).replace(/^export /gm,'')+'\nthis.api={backupKeys,validateBackup,readBackupFile};',ctx);
 const api=ctx.api,legacy={format:'nanpure-website-backup-v1',created:1792627200000,data:{'np-daily-settings-v1':'{"palette":"cream","digitSize":120}'}};
 assert(api.backupKeys.includes(key),'selection preference is exported');assert.equal(api.validateBackup(legacy),legacy);
 for(const design of ['guide','outline','solid']){const input={...legacy,data:{...legacy.data,[key]:design}};assert.equal(api.validateBackup(input).data[key],design);assert.equal(api.readBackupFile(input).data[key],design)}
 for(const invalid of ['unknown','"solid"','',12,null])assert.throws(()=>api.validateBackup({...legacy,data:{...legacy.data,[key]:invalid}}));
});

const appSource=fs.readFileSync(path.join(root,'public/notebook/app.js'),'utf8');
function section(start,end){const a=appSource.indexOf(start),b=appSource.indexOf(end,a+start.length);assert(a>=0&&b>a,'renderer section exists: '+start);return appSource.slice(a,b)}
const renderer=section('const boardRenderCache=','function Tt(){')+section('function Tt(){','document.addEventListener("scroll"');
function renderBoard(n=9){
 const {window:w}=parseHTML('<html><body><main id="app"><section class="screen"><div id="board-scroll"><div id="board" class="play-board"></div></div></section></main></body></html>');
 const current={uid:'selection-'+n,kind:'normal',n,puzzle:Array(n*n).fill(0),grid:Array(n*n).fill(0),notes:{},completed:false};
 const board=w.document.getElementById('board'),viewport=w.document.getElementById('board-scroll');
 Object.defineProperties(viewport,{clientWidth:{get:()=>396},clientHeight:{get:()=>396}});
 Object.defineProperties(board,{clientWidth:{get:()=>parseFloat(board.style.width)||396},clientHeight:{get:()=>parseFloat(board.style.height)||396}});
 w.HTMLElement.prototype.getBoundingClientRect=function(){const span=board.clientWidth,size=span/n,index=Number(this.dataset.cell)||0;if(this===board)return{left:0,top:0,right:span,bottom:span,width:span,height:span};const left=index%n*size,top=Math.floor(index/n)*size;return{left,top,right:left+size,bottom:top+size,width:size,height:size}};
 const ctx={window:w,document:w.document,console,WeakMap,Number,Math,Set,Array,A:n+1,R:n>9,X:true,G:true,D:[],h:-1,Ce:()=>current,Ot:()=>current.grid[ctx.A]||0,jt:()=>'',Jt(){},Bt(){},Ft(){},S:{flow:'play',step:'game'},
  NP:{regions:p=>Array.from({length:p.n*p.n},(_,i)=>Math.floor(i/p.n/Math.sqrt(p.n))*Math.sqrt(p.n)+Math.floor(i%p.n/Math.sqrt(p.n))),gridPaths:()=>({thin:'M0 0H10',thick:'M0 0V10'}),neighborMarks:()=>'',stepMarks:()=>'',crossMarks:()=>''},
  NPLogicalHints:{signature:()=>''},NanpureVariants:{kinds:[],marks:()=>''},NPMemoFocus:{paint(){}},NPNoteConflicts:{paint(){}},NPVideo:{refresh(){}}};
 vm.createContext(ctx);vm.runInContext(renderer,ctx);return{ctx,w,board,current,draw:()=>ctx.Tt(),cell:i=>board.querySelector('[data-cell="'+i+'"]')};
}
check('9/16/25 board guides follow row and column, excluding box-only peers',()=>{
 for(const n of [9,16,25]){const e=renderBoard(n);e.draw();assert.equal(e.cell(n+1).getAttribute('aria-pressed'),'true');assert(e.cell(n+3).classList.contains('guide'));assert(e.cell(3*n+1).classList.contains('guide'));assert(e.cell(0).classList.contains('peer'));assert(!e.cell(0).classList.contains('guide'));assert(!e.cell(4*n+4).classList.contains('guide'));
  e.ctx.X=false;e.draw();assert.equal(e.board.querySelectorAll('.guide').length,0,'existing highlights-off preference is respected');}
});
check('changing selection retains cell DOM, values, memo and conflict state',()=>{
 const e=renderBoard();e.current.grid[10]=5;e.current.grid[13]=5;e.current.puzzle[13]=5;e.current.notes[19]=[1,3,7];e.ctx.D=[10];e.draw();
 const cell=e.cell(10),memo=e.cell(19),before=JSON.stringify(e.current);assert(e.cell(13).classList.contains('same'));assert(cell.classList.contains('wrong'));
 e.ctx.A=19;e.draw();assert.equal(e.cell(10),cell);assert.equal(e.cell(19),memo);assert.equal(memo.getAttribute('aria-pressed'),'true');assert.deepEqual([...memo.querySelectorAll('.notes span')].map(x=>x.textContent),['1','3','7']);assert(cell.classList.contains('wrong'));assert.equal(JSON.stringify(e.current),before);
});
console.log(JSON.stringify({passed:passed.length,checks:passed},null,2));
