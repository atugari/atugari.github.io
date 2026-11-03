// Actual native fullscreen, input and restoration; all network/storage isolated.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io';
const version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const catalog=JSON.parse(fs.readFileSync(path.join(root,'nanpure/collection/catalog.json')));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
function classic(n){const b=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>(Math.floor(i/n)*b+Math.floor(Math.floor(i/n)/b)+i%n)%n+1),puzzle=solution.map((v,i)=>i<n?0:v);return{uid:'ci-fullscreen-'+n,id:'CI-FULLSCREEN-'+n,kind:'normal',n,level:1,blockRows:b,blockCols:b,created:Date.now(),completed:false,elapsed:0,notes:{},puzzle,solution,grid:puzzle.slice()};}
async function setup(browser,viewport){
 const context=await browser.newContext({viewport,screen:viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('nanpure-language-v1','ja');localStorage.setItem('nanpure-auto-next-v1','false');});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin){const file=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Missing asset'});return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],rows:[],records:[],days:[],challenges:[],save:null,unread:0,signedIn:true})});return route.fulfill({status:204,body:''});});
 return{page,context,errors};
}
const tick=frame=>frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function journey(page,frame,{multi=false,native=true}={}){
 await frame.locator('[data-fullscreen]').waitFor({state:'attached'});await tick(frame);
 const before=await frame.locator('#board-scroll').boundingBox();const state=await frame.evaluate(()=>JSON.stringify({grid:NanpureAppTest.getCurrent().grid,notes:NanpureAppTest.getCurrent().notes}));
 if(await frame.locator('[data-fullscreen]').isVisible())await frame.locator('[data-fullscreen]').click();
 else{await frame.locator('[data-board-settings]').click();await frame.locator('[data-fullscreen-entry]').click();}
 await frame.waitForFunction(()=>document.querySelector('.np-workspace-screen')?.dataset.fullscreenMode);
 await tick(frame);
 if(native)assert(await page.evaluate(()=>document.fullscreenElement===document.documentElement),'Actual browser fullscreen is active');
 assert(await frame.locator('.np-fullscreen').count());const after=await frame.locator('#board-scroll').boundingBox();
 assert(after.height>before.height+20,'Full screen enlarges the board: '+JSON.stringify({before,after}));
 assert.equal(await frame.evaluate(()=>JSON.stringify({grid:NanpureAppTest.getCurrent().grid,notes:NanpureAppTest.getCurrent().notes})),state,'Entering preserves all input');
 if(await frame.evaluate(()=>innerWidth>=900)){
  const position=frame.locator('.np-workspace-tools [data-position]'),original=await position.inputValue();
  for(const value of ['left','top','bottom','auto']){
   await position.selectOption(value);await tick(frame);
   const b=await frame.locator('#board-scroll').boundingBox(),k=await frame.locator('.np-number-panel').boundingBox();
   assert(value==='left'?k.x+k.width<=b.x+1:value==='top'?k.y+k.height<=b.y+1:value==='bottom'?k.y>=b.y+b.height-1:k.x>=b.x+b.width-1,'Keypad follows its selected fullscreen position: '+value+' '+JSON.stringify({b,k}));
  }
  await position.selectOption(original);await tick(frame);
 }
 const bounds=await frame.locator('.np-number-panel').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};});assert(bounds.left>=-1&&bounds.top>=-1&&bounds.right<=bounds.width+1&&bounds.bottom<=bounds.height+1,'Keypad remains on screen');
 if(multi){assert.equal(await frame.locator('.np-workspace-screen>.linked-controls,.np-workspace-screen>.multi-board-legend').count(),0);await frame.locator('[data-fullscreen-boards]').click();assert(await frame.locator('.np-fullscreen-boards').isVisible());await frame.locator('.np-fullscreen-boards [data-action="linked-focus"]').last().click();await frame.locator('.np-fullscreen [data-fullscreen]').waitFor();assert(!await frame.locator('.np-fullscreen-boards').isVisible());}
 const cell=await frame.locator('#board [data-cell]').evaluateAll(els=>els.find(e=>e.getAttribute('aria-label')?.includes('空')&&!e.classList.contains('given'))?.getAttribute('data-cell'));
 if(cell!==undefined){await frame.locator('#board [data-cell="'+cell+'"]').click();await frame.locator('[data-action="number"]').first().click();assert.notEqual(await frame.evaluate(()=>JSON.stringify({grid:NanpureAppTest.getCurrent().grid,notes:NanpureAppTest.getCurrent().notes})),state,'Digit input works in full screen');await frame.locator('[data-action="undo"]').click();}
 const beforeExit=await frame.evaluate(()=>JSON.stringify({grid:NanpureAppTest.getCurrent().grid,notes:NanpureAppTest.getCurrent().notes}));
 const visibleProgress=value=>{const p=JSON.parse(value);return{grid:p.grid,notes:Object.fromEntries(Object.entries(p.notes).filter(([,values])=>values.length))};};
 assert.deepEqual(visibleProgress(beforeExit),visibleProgress(state),'Undo restores every digit and nonempty note');
 await frame.locator('[data-fullscreen]').click();await frame.waitForFunction(()=>!window.NPBoardFullscreen.isActive());await tick(frame);
 assert(!await page.evaluate(()=>!!document.fullscreenElement));assert.equal(await frame.locator('.np-fullscreen-boards').count(),0);
 if(multi)assert(await frame.locator('.np-workspace-screen>.linked-controls,.np-workspace-screen>.multi-board-legend').count());
 assert(await frame.locator('.np-workspace-screen>.play-head').count(),'Original header is restored');
 const restored=await frame.locator('#board-scroll').boundingBox();assert(Math.abs(restored.height-before.height)<2,'Original layout restored');
 assert.equal(await frame.evaluate(()=>JSON.stringify({grid:NanpureAppTest.getCurrent().grid,notes:NanpureAppTest.getCurrent().notes})),beforeExit,'Exiting preserves the exact grid and notes');
 console.log('PASS fullscreen geometry '+JSON.stringify({before:before.height,expanded:after.height,restored:restored.height,multi,native}));
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const [kind,n,viewport]of [['normal',25,{width:1440,height:900}],['multi',9,{width:1440,height:900}],['normal',16,{width:390,height:844}]]){
  const f=await setup(browser,viewport),cfg=catalog.configs.find(c=>c.kind===kind&&c.n===n);await f.page.goto(origin+'/nanpure/collection/?p=P-'+String(cfg.start).padStart(6,'0'));await f.page.waitForFunction(()=>document.querySelector('#game')?.contentWindow?.NPBoardFullscreen);
  const frame=await(await f.page.locator('#game').elementHandle()).contentFrame();await journey(f.page,frame,{multi:kind==='multi'});assert.deepEqual(f.errors,[]);await f.context.close();
 }
 const f=await setup(browser,{width:1440,height:900});await f.page.goto(origin+'/nanpure/');await f.page.locator('.main-choice').click();
 await f.page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(el=>el.contentWindow?.NanpureAppTest&&el.contentWindow?.NPBoardFullscreen));
 const iframe=f.page.locator('iframe[title="ナンプレ帳 問題生成とプレイ"]'),frame=await(await iframe.elementHandle()).contentFrame();
 await frame.locator('[data-action="open-notebook"]').waitFor();
 await frame.evaluate(async p=>{NanpureAppTest.validate(p);const lib=NanpureAppTest.getLibrary();lib.splice(0,lib.length,p);await NPStorage.save(lib,p);},classic(16));
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="ci-fullscreen-16"]','[data-action="begin-play"][data-id="ci-fullscreen-16"]'])await frame.locator(selector).click();
 await journey(f.page,frame);assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS actual website shell: parent header reclaimed, native fullscreen, input and restoration');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
