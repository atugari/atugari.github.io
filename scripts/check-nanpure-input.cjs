// Regression checks for the real notebook input functions and stable cell DOM.
// node scripts/check-nanpure-input.cjs /path/to/app.js /path/to/linkedom
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),{stripTypeScriptTypes}=require('node:module');
const appPath=process.argv[2];
if(!appPath)throw Error('Pass the unobfuscated notebook app.js path.');
const {parseHTML}=require(process.argv[3]||'linkedom');
const source=fs.readFileSync(appPath,'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a,`Missing source section ${start}`);return source.slice(a,b)}
const helpers=section('const boardRenderCache=','function Tt(){');
const renderer=section('function Tt(){','document.addEventListener("scroll"');
const input=section('async function Kt(','function Ut(');
const undoBody=section('else if("undo"===d){','}else if("zoom"===d)').slice('else if("undo"===d){'.length);
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
function puzzle(n=9){return{uid:'input-'+n,kind:'normal',n,level:1,puzzle:Array(n*n).fill(0),grid:Array(n*n).fill(0),notes:{},solution:Array.from({length:n*n},(_,i)=>i%n+1),elapsed:0,completed:false}}
function inputEnvironment(){
  let current=puzzle(),saveCalls=[],draws=[],statuses=[],quietStates=[],dialogs=[],autoComplete=0;
  const ctx={console,Date,WeakMap,document:{},window:{},S:{flow:'play',step:'game'},A:0,T:false,O:null,q:[],D:[],ee:false,Z:3,se:false,oe:'cell',re:null,y:0,_:false,e:true,n:Promise.resolve(true),
    Ce:()=>current,Mt:()=>false,Lt:()=>0,f:()=>'',Oe:x=>String(x),He(){},
    Bt(){},Tt(){draws.push(structuredClone(current))},Ft:(text,quiet=false)=>{statuses.push(text);quietStates.push(quiet)},Re:(...args)=>dialogs.push(args),
    NPVideo:{paused:()=>false,move(){},settle(){},refresh(){},autoFinish(){autoComplete++}},NPFeedback:{play(){}},NPMemo:{prune:()=>({}),nextDigit:()=>null},
    setTimeout:fn=>{fn();return 1},
    De(record){let resolve;ctx.n=new Promise(r=>resolve=r);saveCalls.push({snapshot:structuredClone(record),resolve});return true}
  };
  vm.createContext(ctx);vm.runInContext(helpers+input+'\nasync function undoForTest(){'+undoBody+'}',ctx);
  return {ctx,saveCalls,draws,statuses,quietStates,dialogs,get current(){return current},set current(value){current=value},get autoComplete(){return autoComplete}};
}
function renderEnvironment(n=25){
  const {window:w}=parseHTML('<html><body><main id="app"><section class="screen"><div id="mistake-status"></div><div id="board-scroll"><div id="board"></div></div></section></main></body></html>');
  let current=puzzle(n),width=420,layoutWidth=null,measurements=0,layouts=0;
  const board=w.document.getElementById('board'),viewport=w.document.getElementById('board-scroll');
  Object.defineProperties(viewport,{clientWidth:{get:()=>width},clientHeight:{get:()=>width}});
  Object.defineProperties(board,{clientWidth:{get:()=>parseFloat(board.style.width)||width},clientHeight:{get:()=>parseFloat(board.style.height)||width}});
  w.HTMLElement.prototype.getBoundingClientRect=function(){
    measurements++;const span=board.clientWidth,size=span/current.n,index=Number(this.dataset.cell)||0;
    if(this===board)return{left:0,top:0,right:span,bottom:span,width:span,height:span};
    const left=index%current.n*size,top=Math.floor(index/current.n)*size;return{left,top,right:left+size,bottom:top+size,width:size,height:size};
  };
  const ctx={window:w,document:w.document,console,WeakMap,Number,Math,Set,Array,A:-1,R:n>9,X:true,G:true,D:[],h:-1,
    Ce:()=>current,Ot:()=>current.grid[ctx.A]||0,jt:()=>'',Jt(){},Bt(){},Ft(){},S:{flow:'play',step:'game'},
    NP:{regions:p=>Array.from({length:p.n*p.n},(_,i)=>Math.floor(i/p.n/Math.sqrt(p.n))*Math.sqrt(p.n)+Math.floor(i%p.n/Math.sqrt(p.n))),gridPaths:()=>({thin:'M0 0H10',thick:'M0 0V10'}),neighborMarks:()=>'',stepMarks:()=>'',crossMarks:()=>''},
    NPLogicalHints:{signature:()=>''},NanpureVariants:{kinds:['kropki'],marks:()=>'<circle data-test-mark="true" cx="1" cy="1" r="1"/>'},NPMemoFocus:{paint(){}},NPNoteConflicts:{paint(){}},NPVideo:{refresh(){}}
  };
  w.NPCompactPlay={layout(){layouts++;if(layoutWidth!==null)width=layoutWidth}};
  vm.createContext(ctx);vm.runInContext(helpers+renderer,ctx);
  return {ctx,w,board,viewport,get current(){return current},set current(value){current=value},get width(){return width},set width(value){width=value},set layoutWidth(value){layoutWidth=value},get measurements(){return measurements},get layouts(){return layouts}};
}
function keyboardEnvironment(n=9){
  const env=renderEnvironment(n),{ctx,w,board}=env,document=w.document,entries=[];
  let active=document.body;
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>active});
  w.HTMLElement.prototype.focus=function(){active=this;};
  Object.assign(ctx,{C:null,oe:'cell',re:null,O:null,Mt:()=>false,zt:()=>'',Kt(value){entries.push({index:ctx.A,value});}});
  ctx.NPVideo.paused=()=>false;ctx.Tt();
  function cell(index){return board.querySelector('[data-action="cell"][data-cell="'+index+'"]');}
  function key(value,options={}){
    const event={key:value,target:document.activeElement,prevented:false,preventDefault(){this.prevented=true;},...options};
    ctx.handlePlayKey(event);return event;
  }
  function focus(index){ctx.A=index;ctx.Tt();cell(index).focus();}
  return {env,ctx,w,board,document,entries,cell,key,focus};
}
(async()=>{
  await check('routine save confirmation can collapse while pending saves, failures and operation feedback become visible',()=>{
    const {document}=parseHTML('<p id="play-status" role="status"></p>'),ctx={document};vm.createContext(ctx);vm.runInContext(section('function Ft(e,','async function Kt('),ctx);
    const status=document.getElementById('play-status');ctx.Ft('入力しました。途中の状態は保存されています。',true);assert.equal(status.hidden,true);
    for(const text of ['保存しています…','入力は未保存です。画面の案内を確認してください。','入力の設定を保存できませんでした。','メモ入力中です。候補の数字を小さく残せます。','1手戻しました。']){
      ctx.Ft(text);assert.equal(status.hidden,false);assert.equal(status.textContent,text);ctx.Ft('saved',true);
    }
  });
  await check('number keys show one digit label without remaining counts, including saved count preferences and large ranges',()=>{
    const ctx={ne:true,oe:'number',re:25,y:0,Mt:()=>false};vm.createContext(ctx);
    vm.runInContext(section('function Ue(','function We(')+section('function Ct(e){','function At(e){'),ctx);
    for(const n of [9,25,100]){
      ctx.y=n===100?4:0;const {document}=parseHTML(ctx.Ct({n,completed:false}));
      const keys=[...document.querySelectorAll('[data-action=number]')],first=n===100?81:1;
      assert.equal(keys.length,n===100?20:n);assert.equal(document.querySelectorAll('small,.remaining-count,.play-caption').length,0);
      keys.forEach((key,i)=>{assert.equal(key.textContent,String(first+i));assert.equal(key.children.length,1);assert.equal(key.getAttribute('data-number'),String(first+i));});
      if(n===25)assert.equal(keys[24].getAttribute('aria-pressed'),'true');
    }
    const {document}=parseHTML(ctx.Ct({n:9,completed:true}));assert([...document.querySelectorAll('[data-action=number]')].every(key=>key.hasAttribute('disabled')));
    assert.equal(source.includes('id="show-remaining"'),false,'removed count preference is not rendered');
  });
  await check('input is drawn before an unfinished storage transaction',async()=>{
    const e=inputEnvironment(),promise=e.ctx.Kt(1);
    assert.equal(e.current.grid[0],1);assert.equal(e.draws.at(-1).grid[0],1);
    assert.equal(e.saveCalls.length,1);assert.equal(e.saveCalls[0].snapshot.grid[0],1);
    assert.equal(e.statuses.at(-1),'保存しています…');
    assert.equal(e.quietStates.at(-1),false);e.saveCalls[0].resolve(true);await promise;assert(e.statuses.at(-1).includes('保存されています'));assert.equal(e.quietStates.at(-1),true);
  });
  await check('rapid edits keep distinct ordered snapshots and ignore an older completion',async()=>{
    const e=inputEnvironment(),first=e.ctx.Kt(1);e.ctx.A=1;const second=e.ctx.Kt(2);
    assert.deepEqual(e.saveCalls.map(x=>x.snapshot.grid.slice(0,2)),[[1,0],[1,2]]);
    e.saveCalls[1].resolve(true);await second;const count=e.statuses.length;
    e.saveCalls[0].resolve(true);await first;
    assert.equal(e.statuses.length,count);assert.deepEqual(e.current.grid.slice(0,2),[1,2]);assert.equal(e.autoComplete,1);
  });
  await check('failed latest save keeps input visible and reports it unsaved',async()=>{
    const e=inputEnvironment(),promise=e.ctx.Kt(3);e.saveCalls[0].resolve(false);await promise;
    assert.equal(e.current.grid[0],3);assert.equal(e.draws.at(-1).grid[0],3);assert(e.statuses.at(-1).includes('未保存'));assert.equal(e.quietStates.at(-1),false);
  });
  await check('Undo paints immediately and an earlier input cannot replace its result',async()=>{
    const e=inputEnvironment(),first=e.ctx.Kt(1),undo=e.ctx.undoForTest();
    assert.equal(e.current.grid[0],0);assert.equal(e.draws.at(-1).grid[0],0);assert.equal(e.ctx.q.length,0);
    assert.deepEqual(e.saveCalls.map(x=>x.snapshot.grid[0]),[1,0]);
    e.saveCalls[1].resolve(true);await undo;const count=e.statuses.length;
    e.saveCalls[0].resolve(true);await first;
    assert.equal(e.statuses.length,count);assert.equal(e.statuses.at(-1),'1手戻しました。');
  });
  await check('note input preserves candidates and Undo restores the previous cell',async()=>{
    const e=inputEnvironment();e.ctx.T=true;let operation=e.ctx.Kt(4);
    assert.deepEqual(Array.from(e.current.notes[0]),[4]);assert.equal(e.current.grid[0],0);
    e.saveCalls[0].resolve(true);await operation;assert.equal(e.quietStates.at(-1),false);
    operation=e.ctx.undoForTest();assert.deepEqual(Array.from(e.current.notes[0]),[]);
    e.saveCalls[1].resolve(true);await operation;
  });
  await check('leaving a puzzle suppresses delayed UI feedback without losing its save',async()=>{
    const e=inputEnvironment(),promise=e.ctx.Kt(1),count=e.statuses.length;e.ctx.S={flow:'home',step:0};
    e.saveCalls[0].resolve(true);await promise;assert.equal(e.statuses.length,count);assert.equal(e.saveCalls[0].snapshot.grid[0],1);assert.equal(e.dialogs.length,0);
  });
  await check('completion appears immediately but its success dialog waits for durable save',async()=>{
    const e=inputEnvironment();e.current.grid=[...e.current.solution];e.current.grid[0]=0;
    const promise=e.ctx.Kt(1);assert.equal(e.current.completed,true);assert.equal(e.draws.at(-1).completed,true);assert.equal(e.dialogs.length,0);
    e.saveCalls[0].resolve(false);await promise;assert.equal(e.dialogs.length,1);assert(e.dialogs[0][1].includes('未保存'));
  });
  await check('25 × 25 input, notes and selection retain all 625 cell elements',()=>{
    const e=renderEnvironment();e.current.grid[10]=9;e.current.puzzle[10]=9;e.ctx.Tt();
    const cells=[...e.board.querySelectorAll('.cell')],given=cells[10].firstChild,lines=e.board.querySelector('.board-lines'),measured=e.measurements;
    assert.equal(cells.length,625);e.ctx.A=0;e.current.grid[0]=1;e.ctx.Tt();
    assert([...e.board.querySelectorAll('.cell')].every((cell,i)=>cell===cells[i]));
    assert.equal(cells[0].textContent,'1');assert.equal(cells[0].getAttribute('aria-pressed'),'true');assert(cells[0].getAttribute('aria-label').includes('数字1'));
    assert.equal(cells[10].firstChild,given);assert.equal(e.board.querySelector('.board-lines'),lines);assert.equal(e.measurements,measured);
    e.current.grid[0]=0;e.current.notes[0]=[2,9,25];e.ctx.A=1;e.ctx.Tt();
    assert.deepEqual([...cells[0].querySelectorAll('.notes>span')].map(x=>x.textContent),['2','9','25']);assert.equal(cells[1].getAttribute('aria-pressed'),'true');assert.equal(cells[0].getAttribute('aria-pressed'),'false');
    assert([...e.board.querySelectorAll('.cell')].every((cell,i)=>cell===cells[i]));
  });
  await check('first 9 × 9 render uses synchronous compact layout and resize keeps cell nodes',()=>{
    const e=renderEnvironment(9);e.width=800;e.layoutWidth=310;e.ctx.Tt();
    assert.equal(e.board.style.width,'310px');assert.equal(e.layouts,1);
    const cell=e.board.querySelector('.cell'),lines=e.board.querySelector('.board-lines');e.layoutWidth=390;e.ctx.Tt();
    assert.equal(e.board.style.width,'390px');assert.equal(e.board.querySelector('.cell'),cell);assert.notEqual(e.board.querySelector('.board-lines'),lines);
    assert(e.board.querySelector('.board-lines').getAttribute('viewBox').includes('390'));
  });
  await check('cage sums and variant overlays survive incremental rendering',()=>{
    const e=renderEnvironment(4);e.current.kind='killer';e.current.cages=Array.from({length:8},(_,i)=>({sum:3,cells:[i*2,i*2+1]}));e.ctx.Tt();
    const cell=e.board.querySelector('.cell');assert.equal(cell.querySelector('.cage-label').textContent,'3');assert(cell.querySelector('.cage-border'));
    e.current.grid[0]=1;e.ctx.A=0;e.ctx.Tt();assert.equal(e.board.querySelector('.cell'),cell);assert.equal(cell.querySelector('.cage-label').textContent,'3');assert(cell.classList.contains('killer'));
    e.current=puzzle(4);e.current.kind='kropki';e.ctx.Tt();assert(e.board.querySelector('.board-lines [data-test-mark]'));
  });
  await check('keyboard arrows move a single tab stop without entering a locked number',()=>{
    const e=keyboardEnvironment();e.ctx.oe='number';e.ctx.re=4;e.focus(10);
    assert.equal(e.key('ArrowRight').prevented,true);assert.equal(e.ctx.A,11);
    assert.equal(e.document.activeElement,e.cell(11));assert.equal(e.entries.length,0);assert.equal(e.ctx.re,4);
    assert.deepEqual([...e.board.querySelectorAll('[data-action="cell"]')].filter(cell=>cell.getAttribute('tabindex')==='0').map(cell=>Number(cell.dataset.cell)),[11]);
    assert.equal(e.key('Tab').prevented,false);assert.equal(e.key('Tab',{shiftKey:true}).prevented,false);
    e.focus(8);e.key('ArrowRight');assert.equal(e.ctx.A,8,'right arrow cannot wrap to the next row');
    e.key('Home');assert.equal(e.ctx.A,0);e.key('End');assert.equal(e.ctx.A,8);
  });
  await check('keyboard input follows number-first mode and keeps large alphabet digits available',()=>{
    const e=keyboardEnvironment(36);e.focus(1);e.key('A');e.key('z');
    assert.deepEqual(e.entries,[{index:1,value:10},{index:1,value:35}]);
    e.ctx.oe='number';e.key('M');assert.equal(e.ctx.re,22);assert.equal(e.entries.length,2);
    e.key('ArrowDown');assert.equal(e.ctx.A,37);assert.equal(e.entries.length,2);
    e.key('Delete');assert.deepEqual(e.entries.at(-1),{index:37,value:0});
  });
  await check('modifiers, composition, toolbar focus and open dialogs cannot edit the notebook board',()=>{
    const e=keyboardEnvironment();e.focus(0);
    for(const extra of [{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{keyCode:229},{defaultPrevented:true}]){
      assert.equal(e.key('3',extra).prevented,false);assert.equal(e.key('ArrowRight',extra).prevented,false);
    }
    const toolbar=e.document.createElement('button');e.document.body.append(toolbar);toolbar.focus();assert.equal(e.key('3').prevented,false);
    e.focus(0);const dialog=e.document.createElement('dialog');dialog.setAttribute('open','');e.document.body.append(dialog);
    assert.equal(e.key('3').prevented,false);assert.equal(e.key('Delete').prevented,false);dialog.remove();
    assert.equal(e.entries.length,0);assert.equal(e.ctx.A,0);
    e.key('3');assert.deepEqual(e.entries,[{index:0,value:3}]);
  });
  await check('100 by 100 arrows cross rendered blocks and retain the active cell after redraw',()=>{
    const e=keyboardEnvironment(100);e.focus(9);const before=e.document.activeElement;
    assert.equal(e.cell(10),null);e.key('ArrowRight');assert.equal(e.ctx.A,10);
    assert(e.cell(10));assert.equal(e.document.activeElement,e.cell(10));assert.notEqual(e.document.activeElement,before);
    e.focus(910);e.key('ArrowDown');assert.equal(e.ctx.A,1010);assert.equal(e.document.activeElement,e.cell(1010));
    e.ctx.Tt();assert.equal(e.document.activeElement,e.cell(1010));
    assert.equal([...e.board.querySelectorAll('[data-action="cell"]')].filter(cell=>cell.getAttribute('tabindex')==='0').length,1);
  });
  await check('linked cells navigate their visible coordinates and retain focus when their SVG is rebuilt',()=>{
    const e=keyboardEnvironment(6),cells=[{x:0,y:0},{x:1,y:0},{x:3,y:0},{x:3,y:1}];
    Object.assign(e.env.current,{linked:{width:4,height:2,cells},grid:[0,0,0,0],puzzle:[0,0,0,0]});
    e.ctx.NP.linkedArt=()=>cells.map(()=>'<rect/>').join('');e.ctx.NPMemo={groups:()=>[[0,1,2],[2,3]]};
    e.focus(1);e.key('ArrowRight');assert.equal(e.ctx.A,2);assert.equal(e.document.activeElement,e.cell(2));
    e.key('ArrowDown');assert.equal(e.ctx.A,3);assert.equal(e.document.activeElement,e.cell(3));
    e.ctx.Tt();assert.equal(e.document.activeElement,e.cell(3));assert.equal(e.entries.length,0);
  });
  await check('number and range buttons keep focus when the keypad markup changes',()=>{
    const e=keyboardEnvironment(100),controls=e.document.createElement('div');e.document.body.append(controls);
    const markup=pressed=>'<button data-action="number-range" data-range="4">81–100</button><button data-action="number" data-number="100" aria-pressed="'+pressed+'">100</button>';
    e.ctx.updateNumberControls(controls,markup(false));controls.querySelector('[data-number]').focus();
    e.ctx.updateNumberControls(controls,markup(true));assert.equal(e.document.activeElement.dataset.number,'100');assert(e.document.activeElement.isConnected);
    controls.querySelector('[data-range]').focus();e.ctx.updateNumberControls(controls,markup(false));assert.equal(e.document.activeElement.dataset.range,'4');assert(e.document.activeElement.isConnected);
  });
  await check('native daily keys use focused cells and leave modifiers, composition and external controls alone',()=>{
    const e=keyboardEnvironment(16),game=fs.readFileSync(path.join(__dirname,'client-overrides/app/game.tsx'),'utf8');
    e.env.viewport.classList.add('board-viewport');
    const start=game.indexOf('const handler=(e:KeyboardEvent)=>{',game.indexOf("if(tab!=='daily'||panel||!session)return"));
    const end=game.indexOf(';window.addEventListener',start);assert(start>=0&&end>start);
    const selected=[],entries=[],numbers=[],ctx={n:16,done:false,busy:false,settings:{numberFirst:false},C:value=>selected.push(value),enter:(value,index)=>entries.push({value,index}),number:value=>numbers.push(value)};
    vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(game.slice(start,end))+';this.handle=handler;',ctx);
    e.focus(15);const key=(key,extra={})=>{const event={key,target:e.document.activeElement,prevented:false,preventDefault(){this.prevented=true;},...extra};ctx.handle(event);return event;};
    key('ArrowRight');assert.equal(selected.at(-1),15);key('ArrowDown');assert.equal(selected.at(-1),31);
    key('G');assert.deepEqual(entries,[{value:16,index:15}]);
    ctx.settings.numberFirst=true;key('A');assert.deepEqual(numbers,[10]);assert.equal(entries.length,1);
    for(const extra of [{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{keyCode:229},{defaultPrevented:true}])assert.equal(key('3',extra).prevented,false);
    const button=e.document.createElement('button');e.document.body.append(button);button.focus();assert.equal(key('Delete').prevented,false);assert.equal(key('ArrowLeft').prevented,false);
    assert.equal(key('Tab').prevented,false);assert.equal(key('Tab',{shiftKey:true}).prevented,false);
  });
  console.log(JSON.stringify({passed,failed:0}));
})().catch(error=>{console.error(error);process.exitCode=1});
