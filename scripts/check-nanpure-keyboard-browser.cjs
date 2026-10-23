// Real desktop Chromium keyboard journeys against the prepared Pages artifact.
// All network is fulfilled locally; no live sessions, records or messages change.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site');
const site='https://atugari.github.io',home=site+'/nanpure/?lang=ja';
const version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'),'utf8')).version;
const notebook=name=>site+'/nanpure/releases/'+version+'/notebook/'+name+'?lang=ja';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
function classic(n){
 const b=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>(Math.floor(i/n)*b+Math.floor(Math.floor(i/n)/b)+i%n)%n+1);
 const puzzle=solution.map((v,i)=>i<2*n||i>=n*n-n?0:v);
 return {uid:'ci-keyboard-'+n,id:'CI-KEYBOARD-'+n,kind:'normal',n,level:1,ratingVersion:2,blockRows:b,blockCols:b,created:1792627200000,completed:false,elapsed:0,notes:{},puzzle,solution,grid:puzzle.slice()};
}
const dailyPuzzle=classic(16),summary={day:'2026-10-23',level:1,n:16,kind:'normal',ruleName:'通常ナンプレ',title:'通常ナンプレ',rules:''};
const session={...summary,id:'ci-keyboard-daily',started:1792627200000,serverNow:1792627200000,finished:false,solved:false,elapsed:0,ranked:false,resumed:true,puzzle:dailyPuzzle.puzzle,solution:dailyPuzzle.solution,regions:Array.from({length:256},(_,i)=>Math.floor(Math.floor(i/16)/4)*4+Math.floor(i%16/4))};
const saved={session,grid:dailyPuzzle.grid,notes:{},elapsed:0,misses:0,hints:0,runId:session.id};
async function tick(target){await target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function key(page,value){await page.keyboard.press(value);await tick(page);}
async function tabTo(page,locator){
 await locator.waitFor({state:'visible',timeout:20000});
 assert(await locator.isEnabled(),'Keyboard target is enabled: '+locator);
 for(let i=0;i<240;i++){
  if(await locator.evaluate(el=>el.ownerDocument.activeElement===el))return;
  await key(page,'Tab');
 }
 const active=await Promise.all(page.frames().map(f=>f.evaluate(()=>({url:location.pathname,tag:document.activeElement?.outerHTML.slice(0,350)})).catch(()=>null)));
 throw Error('Unreachable by Tab: '+locator+'; active='+JSON.stringify(active));
}
async function activate(page,locator,value='Enter'){await tabTo(page,locator);await key(page,value);}
async function focused(target,selector){
 await target.waitForFunction(selector=>document.activeElement?.matches(selector),selector,{timeout:5000});
}
async function roving(target,selector){
 assert.equal(await target.locator(selector).evaluateAll(nodes=>nodes.filter(n=>!n.disabled&&n.tabIndex===0).length),1,'One Tab entry for '+selector);
}
async function setup(browser,{daily=false}={}){
 const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
 page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(({daily,saved})=>{
  Object.defineProperty(navigator,'doNotTrack',{get:()=> '1',configurable:true});
  localStorage.setItem('nanpure-auto-next-v1','false');
  localStorage.setItem('np-daily-settings-v1',JSON.stringify({numberFirst:true,cellSize:100,digitSize:100,noteSize:100,keypadSize:100,keypadLayout:'auto',remaining:true,autoComplete:false,autoNext:false,sound:false,vibration:false}));
  if(daily)localStorage.setItem('np-practice-resume-v1',JSON.stringify(saved));
 },{daily,saved});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===site&&url.pathname.startsWith('/nanpure/')){
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing prepared asset'});
   return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  }
  if(url.pathname.startsWith('/api/')){
   if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+url.pathname);
   const data=url.pathname==='/api/daily'?{day:summary.day,serverNow:session.serverNow,challenges:[summary],records:[]}:{items:[],records:[],rows:[],days:[],challenges:[],save:null,signedIn:true,unread:0};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }
  return route.fulfill({status:204,body:''});
 });
 return {context,page,errors,writes};
}
async function openNotebook(page,kind){
 await page.goto(home,{waitUntil:'domcontentloaded'});
 await activate(page,page.locator('.main-choice'),'Space');
 const frame=await (await page.locator('iframe.notebook').elementHandle()).contentFrame();
 assert(frame,'Notebook frame mounts after keyboard activation');
 await frame.waitForFunction(()=>!!window.NanpureAppTest&&window.NPI18n?.get()==='ja');
 const uid=await frame.evaluate(({kind,normal})=>{
  let p=normal;
  if(kind==='multi'){
   const linked=NanpureMulti.layout('pair'),solution=linked.cells.map(({x,y})=>(y*3+Math.floor(y/3)+x)%9+1);
   const puzzle=solution.map((v,i)=>i<3||[54,62,81].includes(i)?0:v);
   p={uid:'ci-keyboard-multi',id:'CI-KEYBOARD-MULTI',kind:'multi',n:9,level:1,multiVersion:1,linked,solution,puzzle,grid:puzzle.slice(),notes:{},elapsed:0,completed:false,created:1792627200000};
  }
  if(!NanpureAppTest.validate(p))throw Error('Invalid deterministic fixture');
  const lib=NanpureAppTest.getLibrary();lib.splice(0,lib.length,p);return p.uid;
 },{kind,normal:classic(kind===100?100:16)});
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="'+uid+'"]','[data-action="begin-play"][data-id="'+uid+'"]'])await activate(page,frame.locator(selector));
 await frame.locator('#board [data-cell="0"]').waitFor();
 // Notebook preferences are in NPStorage.meta (IndexedDB), not localStorage.
 // Exercise the real native select instead of depending on a storage shortcut.
 await activate(page,frame.locator('#np-play-settings-button'));
 await activate(page,frame.locator('#np-play-settings .np-settings-category[aria-controls="np-settings-page-input"]'));
 await tabTo(page,frame.locator('#play-input-mode'));await key(page,'ArrowDown');
 assert.equal(await frame.locator('#play-input-mode').inputValue(),'number','Number-first mode selected by keyboard');
 await key(page,'Escape');await frame.locator('#np-play-settings').waitFor({state:'hidden'});
 return frame;
}
const board='#board [data-action="cell"][data-cell]';
const cell=(target,i)=>target.locator('#board [data-action="cell"][data-cell="'+i+'"]');
const grid=target=>target.evaluate(()=>NanpureAppTest.getCurrent().grid.slice());
async function normalJourney({page}){
 const frame=await openNotebook(page,16);await roving(frame,board);await tabTo(page,cell(frame,0));
 const before=await grid(frame);
 await key(page,'3');await key(page,'ArrowRight');await focused(frame,'#board [data-cell="1"]');
 assert.deepEqual(await grid(frame),before,'Number-first digit selection and arrows never enter a value');
 await key(page,'Enter');assert.equal((await grid(frame))[1],3,'Enter applies the selected number');
 await key(page,'ArrowRight');await key(page,'Space');assert.equal((await grid(frame))[2],3,'Space applies the selected number');
 await key(page,'Delete');assert.equal((await grid(frame))[2],0,'Delete erases');
 await key(page,'Home');await focused(frame,'#board [data-cell="0"]');
 await key(page,'End');await key(page,'ArrowRight');await focused(frame,'#board [data-cell="15"]');
 const after=await grid(frame);await key(page,'Control+f');assert.deepEqual(await grid(frame),after,'Browser modifier shortcut does not enter a digit');
 await key(page,'Escape');
 await activate(page,frame.locator('#np-play-settings-button'));
 await activate(page,frame.locator('#np-play-settings .np-settings-category[aria-controls="np-settings-page-input"]'));
 const mode=frame.locator('#play-input-mode');await tabTo(page,mode);await key(page,'ArrowUp');
 assert.equal(await mode.inputValue(),'cell','Native select works with keyboard');
 await key(page,'Escape');await frame.locator('#np-play-settings').waitFor({state:'hidden'});
 await tabTo(page,cell(frame,15));await key(page,'Home');await key(page,'A');
 assert.equal((await grid(frame))[0],10,'A enters 10 in cell-first mode');await focused(frame,'#board [data-cell="0"]');
 await key(page,'Tab');const outside=await grid(frame);await key(page,'5');assert.deepEqual(await grid(frame),outside,'Digits outside the board do not change the grid');
}
async function hundredJourney({page}){
 const frame=await openNotebook(page,100);await roving(frame,board);await tabTo(page,cell(frame,0));
 const before=await grid(frame);await key(page,'3');
 for(let i=0;i<10;i++)await key(page,'ArrowRight');await focused(frame,'#board [data-cell="10"]');
 for(let i=0;i<10;i++)await key(page,'ArrowDown');await focused(frame,'#board [data-cell="1010"]');
 assert.deepEqual(await grid(frame),before,'100×100 block transitions only move focus');
 for(let i=0;i<10;i++)await key(page,'ArrowUp');await key(page,'Home');
 await activate(page,frame.locator('[data-action="number-range"][data-range="4"]'));
 await activate(page,frame.locator('[data-action="number"][data-number="100"]'));
 await tabTo(page,cell(frame,0));await key(page,'Enter');
 assert.equal((await grid(frame))[0],100,'Number range and 100 are selectable with Tab and Enter');
 await focused(frame,'#board [data-cell="0"]');await roving(frame,board);
}
async function linkedJourney({page}){
 const frame=await openNotebook(page,'multi');await roving(frame,board);await tabTo(page,cell(frame,0));const before=await grid(frame);
 await key(page,'3');for(let i=0;i<6;i++)await key(page,'ArrowDown');for(let i=0;i<8;i++)await key(page,'ArrowRight');
 await focused(frame,'#board [data-cell="62"]');await key(page,'ArrowRight');await focused(frame,'#board [data-cell="81"]');
 assert.deepEqual(await grid(frame),before,'Linked boards use visual adjacency without entering values');
 await key(page,'Space');assert.equal((await grid(frame))[81],3,'Linked board accepts selected number');await focused(frame,'#board [data-cell="81"]');
 await key(page,'ArrowLeft');await focused(frame,'#board [data-cell="62"]');await roving(frame,board);
}
async function dailyJourney({page}){
 await page.goto(home,{waitUntil:'domcontentloaded'});await activate(page,page.locator('.home-resume'));
 const selector='.board-viewport [data-cell]',dailyCell=i=>page.locator(selector+'[data-cell="'+i+'"]');
 const values=()=>page.locator(selector).evaluateAll(nodes=>nodes.map(n=>(n.querySelector('.cell-value')?.textContent||'').replace(/[^0-9]/g,'')));
 await dailyCell(0).waitFor();await roving(page,selector);await tabTo(page,dailyCell(0));const before=await values();
 await key(page,'4');await key(page,'ArrowRight');await focused(page,selector+'[data-cell="1"]');
 assert.deepEqual(await values(),before,'Daily number-first arrows do not enter a value');
 await key(page,'Enter');assert.equal((await values())[1],'4','Daily Enter applies selected number');
 await key(page,'ArrowRight');await key(page,'Space');assert.equal((await values())[2],'4','Daily Space applies selected number');
 await key(page,'Backspace');assert.equal((await values())[2],'','Daily Backspace erases');
 await activate(page,page.locator('.play-settings-button'));
 await activate(page,page.locator('.game-dialog .ps-category[aria-controls="daily-settings-input"]'));
 const mode=page.locator('#daily-settings-input input[type="checkbox"]').first();await tabTo(page,mode);await key(page,'Space');assert.equal(await mode.isChecked(),false,'Daily input mode switch works with Space');
 const whileOpen=await values();await key(page,'A');assert.deepEqual(await values(),whileOpen,'Settings keys never change the background daily board');
 await key(page,'Escape');await page.locator('.game-dialog').waitFor({state:'hidden'});
 await focused(page,'.play-settings-button');await tabTo(page,dailyCell(2));await key(page,'Home');await key(page,'A');
 assert.equal((await values())[0],'10','Daily A enters 10 in cell-first mode');await focused(page,selector+'[data-cell="0"]');
}
async function shirupureJourney({page}){
 await page.goto(notebook('shirupure.html'),{waitUntil:'domcontentloaded'});await activate(page,page.locator('[data-act="learn"]'));
 const selector='.board button[data-edge]:not([disabled])';await roving(page,selector);await tabTo(page,page.locator(selector+'[tabindex="0"]'));
 const first=await page.evaluate(()=>document.activeElement.dataset.edge);await key(page,'ArrowRight');await key(page,'ArrowRight');
 const edge=await page.evaluate(()=>document.activeElement.dataset.edge);assert.equal(edge,'1-2','Arrows reach the tutorial requested boundary');assert.notEqual(edge,first);
 const chosen=page.locator(selector+'[data-edge="'+edge+'"]'),before=await chosen.getAttribute('aria-pressed');await key(page,'Space');
 assert.notEqual(await chosen.getAttribute('aria-pressed'),before,'Space changes the chosen boundary');await focused(page,'[data-edge="'+edge+'"]');await roving(page,selector);
}
async function prototypeJourney({page}){
 await page.goto(notebook('index.html'),{waitUntil:'domcontentloaded'});
 for(const selector of ['[data-action="open-prototype"]','[data-proto="category"][data-page="paths"]','[data-proto="open"]'])await activate(page,page.locator(selector).first());
 const selector='.proto-board button[data-cell]';await roving(page,selector);await tabTo(page,page.locator(selector+'[tabindex="0"]'));
 const first=await page.evaluate(()=>document.activeElement.dataset.cell);await key(page,'ArrowRight');const next=await page.evaluate(()=>document.activeElement.dataset.cell);
 assert(next!==undefined&&next!==first,'Path board arrow moves to adjacent cell');await key(page,'Enter');await focused(page,selector+'[data-cell="'+next+'"]');await roving(page,selector);
}
async function tenbinJourney({page}){
 await page.goto(notebook('tenbin.html'),{waitUntil:'domcontentloaded'});await activate(page,page.locator('[data-action="new"]'));
 const selector='.choices button[data-choice]';await page.locator(selector).first().waitFor();await roving(page,selector);await tabTo(page,page.locator(selector+'[tabindex="0"]'));
 await key(page,'ArrowRight');const choice=await page.evaluate(()=>document.activeElement.dataset.choice);assert.equal(choice,'1');await key(page,'Space');
 assert.equal(await page.locator(selector+'[data-choice="1"]').getAttribute('aria-pressed'),'true','Tenbin Space chooses the focused candidate');await focused(page,selector+'[data-choice="1"]');
 await activate(page,page.locator('[data-action="check"]'));
 await page.waitForFunction(()=>NPTenbin.current().done||document.body.textContent.includes('その記号より重いものがあります。'));
}
async function crosswordJourney({page}){
 await page.goto(notebook('crossword.html'),{waitUntil:'domcontentloaded'});await activate(page,page.locator('[data-action="new"]'));
 const selector='#cw-play .board button[data-cell]';await page.locator(selector).first().waitFor({timeout:30000});await roving(page,selector);await tabTo(page,page.locator(selector+'[tabindex="0"]'));
 await key(page,'ArrowRight');const next=await page.evaluate(()=>document.activeElement.dataset.cell);assert(next!==undefined,'Crossword arrow remains on a white cell');await key(page,'Enter');await focused(page,'#answer');
 await page.keyboard.type('A?');assert.equal(await page.locator('#answer').inputValue(),'A?','Text input keeps ordinary characters and question marks');assert.equal(await page.locator('#np-keyboard-help[open]').count(),0,'Typing a question mark in an answer does not open help');
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});const failures=[];
 const cases=[['normal',normalJourney],['hundred',hundredJourney],['linked',linkedJourney],['daily',dailyJourney],['shirupure',shirupureJourney],['paths',prototypeJourney],['tenbin',tenbinJourney],['crossword',crosswordJourney]];
 try{for(const [name,run]of cases){
  if(process.env.NANPURE_KEYBOARD_CASE&&!process.env.NANPURE_KEYBOARD_CASE.split(',').includes(name))continue;
  const fixture=await setup(browser,{daily:name==='daily'});
  try{await run(fixture);assert.deepEqual(fixture.writes,[],'Journey never attempts an API write');assert.deepEqual(fixture.errors,[],'No browser errors');console.log('PASS keyboard journey:',name);}
  catch(error){failures.push(name+': '+error.message);console.error('FAIL keyboard journey:',name,error.stack);console.error('Browser errors:',fixture.errors);console.error('View:',await Promise.all(fixture.page.frames().map(f=>f.evaluate(()=>({url:location.pathname,text:document.body.innerText.slice(0,1800)})).catch(()=>null))));}
  finally{await fixture.context.close();}
 }}finally{await browser.close();}
 assert.deepEqual(failures,[],'Keyboard browser journeys');console.log('All keyboard journeys passed; network remained isolated.');
})().catch(error=>{console.error(error);process.exitCode=1;});
