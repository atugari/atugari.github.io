// User journeys for custom keys. All sessions and storage are disposable, and
// every network request is intercepted so tests cannot change public records.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),site='https://atugari.github.io';
const version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const key='np-key-bindings-v1',types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp'};
const tick=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function press(page,value){await page.keyboard.press(value);await tick(page);}
function classic(n){const b=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>(Math.floor(i/n)*b+Math.floor(Math.floor(i/n)/b)+i%n)%n+1),puzzle=solution.map((v,i)=>i<2*n?0:v);return{uid:'ci-keys-'+n,id:'CI-KEYS-'+n,kind:'normal',n,level:1,ratingVersion:2,blockRows:b,blockCols:b,created:1792627200000,completed:false,elapsed:0,notes:{},puzzle,solution,grid:puzzle.slice()};}
async function setup(browser,{daily=false,viewport={width:1280,height:900},locale='ja'}={}){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
 const p=classic(16),summary={day:'2026-10-23',level:1,n:16,kind:'normal',ruleName:'通常ナンプレ',title:'通常ナンプレ',rules:''},session={...summary,id:'ci-keybindings-native',started:1792627200000,serverNow:1792627200000,finished:false,solved:false,elapsed:0,ranked:false,resumed:true,puzzle:p.puzzle,solution:p.solution,regions:Array.from({length:256},(_,i)=>Math.floor(Math.floor(i/16)/4)*4+Math.floor(i%16/4))};
 await context.addInitScript(({daily,session,p})=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('nanpure-auto-next-v1','false');localStorage.setItem('np-daily-settings-v1',JSON.stringify({numberFirst:false,autoNext:false,autoComplete:false,sound:false}));if(daily)localStorage.setItem('np-practice-resume-v1',JSON.stringify({session,grid:p.grid,notes:{},elapsed:0,misses:0,hints:0,runId:session.id}));},{daily,session,p});
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(u.origin===site&&u.pathname.startsWith('/nanpure/')){const f=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:'Missing asset'});return route.fulfill({status:200,contentType:types[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});}if(u.pathname.startsWith('/api/')){if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+u.pathname);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,signedIn:true,unread:0})});}return route.fulfill({status:204,body:''});});
 await page.goto(site+'/nanpure/?lang='+locale);await page.locator('.main-choice').waitFor();return{context,page,errors,writes};
}
async function openNotebook(page,n=9){
 await page.locator('.main-choice').click();await page.waitForFunction(()=>{const f=document.querySelector('iframe.notebook');return f&&getComputedStyle(f).visibility==='visible';});
 const frame=await(await page.locator('iframe.notebook').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.NPKeyBindings&&!!window.NanpureAppTest);
 await frame.evaluate(p=>{NanpureAppTest.validate(p);const lib=NanpureAppTest.getLibrary();lib.splice(0,lib.length,p);},classic(n));
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="ci-keys-'+n+'"]','[data-action="begin-play"][data-id="ci-keys-'+n+'"]'])await frame.locator(selector).click();
 await frame.locator('#np-play-settings-button').click();await frame.locator('[aria-controls="np-settings-page-input"]').click();await frame.locator('#play-input-mode').selectOption('cell');await frame.locator('#play-input-mode:not([disabled])').waitFor();await frame.locator('#np-play-settings').evaluate(d=>d.close());await tick(page);return frame;
}
async function editor(target){await target.evaluate(()=>NPKeyBindings.show());await target.locator('#np-key-bindings[open]').waitFor();}
async function assign(page,target,id,value){const row=target.locator('[data-binding-action="'+id+'"]');await row.locator('button').first().click();await press(page,value);await target.waitForFunction(id=>!document.querySelector('[data-binding-action="'+id+'"][data-recording]'),id);}
async function save(target){await target.locator('#np-key-bindings .np-binding-save').click();await target.locator('#np-key-bindings').waitFor({state:'hidden'});await tick(target);}
const cell=(frame,index)=>frame.locator('#board [data-cell="'+index+'"]');
const grid=frame=>frame.evaluate(()=>NanpureAppTest.getCurrent().grid.slice());
async function normalJourney(browser){
 const f=await setup(browser),{page}=f,frame=await openNotebook(page);
 await frame.locator('#np-play-settings-button').click();await frame.locator('[aria-controls="np-settings-page-input"]').click();await frame.locator('[data-settings-panel="input"] [data-np-key-bindings]').click();
 const digits=frame.locator('#np-key-bindings details').last();await digits.locator('summary').click();
 for(const [id,value]of [['digit-1','q'],['right','d'],['erase','x'],['undo','Control+z'],['memo','m'],['activate','j'],['settings','F2'],['help','Shift+F2']])await assign(page,frame,id,value);
 await save(frame);await press(page,'Escape');await frame.locator('#np-play-settings').waitFor({state:'hidden'});
 await cell(frame,0).focus();await press(page,'1');assert.equal((await grid(frame))[0],0,'Replaced digit key is released');
 await press(page,'q');assert.equal((await grid(frame))[0],1,'Custom digit enters once');
 await press(page,'d');assert.equal(await frame.locator('#board [aria-pressed="true"]').getAttribute('data-cell'),'1');
 await press(page,'ArrowRight');assert.equal(await frame.locator('#board [aria-pressed="true"]').getAttribute('data-cell'),'1','Old arrow key is released');
 await press(page,'q');await press(page,'Control+z');assert.equal((await grid(frame))[1],0,'Custom modified Undo restores the previous cell');
 await press(page,'m');await press(page,'q');assert.deepEqual(await frame.evaluate(()=>NanpureAppTest.getCurrent().notes[1]),[1]);
 await press(page,'x');assert(!await frame.evaluate(()=>NanpureAppTest.getCurrent().notes[1]?.length),'Custom erase removes notes');
 await press(page,'Control+z');assert.deepEqual(await frame.evaluate(()=>NanpureAppTest.getCurrent().notes[1]),[1]);await press(page,'m');
 // Number-first movement remains separate from explicit activation.
 await press(page,'F2');await frame.locator('#np-play-settings[open]').waitFor();await frame.locator('[aria-controls="np-settings-page-input"]').click();await frame.locator('#play-input-mode').selectOption('number');await frame.locator('#play-input-mode:not([disabled])').waitFor();await press(page,'Escape');
 const before=await grid(frame);await cell(frame,0).focus();await press(page,'q');await press(page,'d');assert.deepEqual(await grid(frame),before);await press(page,'j');assert.equal((await grid(frame))[1],1);
 const after=await grid(frame);await press(page,'Enter');await press(page,'Space');assert.deepEqual(await grid(frame),after,'Replaced native activation keys cannot ghost-click');
 // The same storage is visible in the shell, and editing keys never edits a puzzle.
 await page.evaluate(()=>NPKeyboard.showHelp());await page.locator('#np-keyboard-help [data-np-key-bindings]').click();await page.locator('#np-key-bindings details').last().locator('summary').click();assert((await page.locator('[data-binding-action="digit-1"] kbd').innerText()).includes('Q'));
 await assign(page,page,'digit-2','q');assert((await page.locator('#np-key-bindings [role="status"]').innerText()).includes('重複'));await save(page);await press(page,'Escape');
 await cell(frame,2).focus();await press(page,'q');await press(page,'j');assert.equal((await grid(frame))[2],2,'A duplicate key has exactly one new assignment across frames');
 assert.deepEqual(await frame.evaluate(()=>JSON.parse(localStorage.getItem('np-key-bindings-v1')).bindings['digit-1']),[]);
 await page.reload();await page.locator('.main-choice').waitFor();await editor(page);await page.locator('#np-key-bindings details').last().locator('summary').click();assert((await page.locator('[data-binding-action="digit-2"] kbd').innerText()).includes('Q'),'Assignments survive reload');
 await page.locator('#np-key-bindings button').filter({hasText:'初期値に戻す'}).click();await save(page);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('np-key-bindings-v1')).bindings),{});
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();console.log('PASS custom keys: input order, movement, Ctrl+Undo, notes, erase, activation, released defaults, conflicts, cross-frame sharing, persistence and reset');
}
async function dailyJourney(browser){
 const f=await setup(browser,{daily:true}),{page}=f;await page.locator('.home-resume').click();await page.locator('.board-viewport [data-cell="0"]').waitFor();await page.locator('.header .play-settings-button').click();await page.locator('[aria-controls="daily-settings-input"]').click();await page.locator('#daily-settings-input [data-np-key-bindings]').click();await page.locator('#np-key-bindings details').last().locator('summary').click();
 for(const [id,value]of [['digit-1','q'],['memo','m'],['erase','x'],['undo','z'],['right','d']])await assign(page,page,id,value);await save(page);await press(page,'Escape');
 await page.locator('.board-viewport [data-cell="0"]').focus();await press(page,'q');assert.equal(await page.locator('.board-viewport [data-cell="0"] .cell-value').innerText(),'1');await press(page,'d');await press(page,'m');await press(page,'q');assert((await page.locator('.board-viewport [data-cell="1"]').innerText()).includes('1'));await press(page,'z');assert.equal((await page.locator('.board-viewport [data-cell="1"]').innerText()).trim(),'');
 const before=await page.locator('.board-viewport').innerText();await page.locator('.header .play-settings-button').click();await press(page,'q');assert.equal(await page.locator('.board-viewport').innerText(),before,'Open settings block custom gameplay keys');
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();console.log('PASS native daily: settings entry, custom digits, moves, notes, Undo and dialog guard');
}
async function hugeJourney(browser){
 const f=await setup(browser),{page}=f,frame=await openNotebook(page,100);await editor(frame);await frame.locator('#np-key-bindings details').last().locator('summary').click();await assign(page,frame,'digit-100','q');await save(frame);await cell(frame,0).focus();await press(page,'q');assert.equal((await grid(frame))[0],100,'Custom 100 selects its number range and enters through the keypad');assert.equal(await cell(frame,0).innerText(),'100');assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();console.log('PASS 100×100: custom key selects a hidden number range and enters 100');
}
async function guardsJourney(browser){
 const f=await setup(browser),{page}=f,frame=await openNotebook(page);await editor(frame);
 const up=frame.locator('[data-binding-action="up"]');await up.locator('button').first().click();await press(page,'Escape');assert(await frame.locator('#np-key-bindings').isVisible(),'Esc cancels recording before closing the dialog');assert.equal(await up.locator('kbd').innerText(),'↑');
 await up.locator('button').first().click();await press(page,'Tab');assert((await frame.locator('#np-key-bindings [role="status"]').innerText()).includes('割り当てられません'));assert.equal(await up.locator('kbd').innerText(),'↑');
 await assign(page,frame,'up','Shift+w');await frame.evaluate(()=>{window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='np-key-bindings-v1')throw Error('Full');return __storageSet.call(this,k,v);};});await frame.locator('.np-binding-save').click();assert(await frame.locator('#np-key-bindings').isVisible());assert((await frame.locator('#np-key-bindings [role="status"]').innerText()).includes('保存できません'));
 await frame.evaluate(()=>{Storage.prototype.setItem=__storageSet;});await save(frame);
 const start=await grid(frame);await frame.evaluate(()=>{const input=document.createElement('input');input.id='ci-typing';document.body.append(input);input.focus();});await page.keyboard.type('qwasd?');assert.equal(await frame.locator('#ci-typing').inputValue(),'qwasd?');assert.deepEqual(await grid(frame),start,'Text input and question marks remain ordinary typing');
 await cell(frame,9).focus();await press(page,'Shift+w');assert.equal(await frame.locator('#board [aria-pressed="true"]').getAttribute('data-cell'),'0');await press(page,'Control+f');assert.deepEqual(await grid(frame),start,'Browser shortcuts do not input digits');
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();console.log('PASS key capture: cancel, reserved Tab, Shift chord, save failure, typing and browser shortcuts');
}
async function specialJourney(browser){
 const f=await setup(browser),{page}=f;await editor(page);await assign(page,page,'right','d');await assign(page,page,'activate','j');await save(page);
 await page.goto(site+'/nanpure/releases/'+version+'/notebook/shirupure.html?lang=ja');await page.locator('[data-act="learn"]').click();await page.locator('.board button[data-edge]').first().focus();const old=await page.evaluate(()=>document.activeElement.dataset.edge);await press(page,'d');assert.notEqual(await page.evaluate(()=>document.activeElement.dataset.edge),old);await page.evaluate(()=>{window.__clicks=0;document.addEventListener('click',e=>{if(e.target.closest('.board button'))__clicks++;},true);});await press(page,'j');assert.equal(await page.evaluate(()=>__clicks),1,'Custom activation changes a boundary once');assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();console.log('PASS special game: shared remapped movement and exactly one boundary activation');
}
async function localeJourney(browser){
 for(const locale of ['en','zh-Hans','zh-Hant','ko','es','fr','de','pt']){
  const f=await setup(browser,{locale,viewport:{width:375,height:667}}),{page}=f;await page.waitForFunction(locale=>NPI18n.get()===locale,locale);await editor(page);
  const result=await page.evaluate(()=>{const root=document.getElementById('np-key-bindings'),walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),bad=[];let n;while(n=walk.nextNode())if(n.parentElement.getClientRects().length&&!n.parentElement.closest('[translate="no"],script,style')&&/[\u3041-\u3096\u30a1-\u30fa]/.test(n.nodeValue))bad.push(n.nodeValue);return{bad,overflow:root.scrollWidth>root.clientWidth+1};});assert.deepEqual(result.bad,[],locale+' translated key settings');assert.equal(result.overflow,false,locale+' mobile settings fit');assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();
 }
 console.log('PASS custom-key settings: all eight translations and narrow-screen layout');
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{for(const run of [normalJourney,dailyJourney,hugeJourney,guardsJourney,specialJourney,localeJourney]){if(process.env.NP_KEYS_CASE&&run.name!==process.env.NP_KEYS_CASE)continue;await run(browser);}}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
