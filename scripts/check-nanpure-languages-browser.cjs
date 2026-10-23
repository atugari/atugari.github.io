// User journeys for the additional languages. All sessions and storage are disposable, and
// every network request is intercepted so tests cannot change public records.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),site='https://atugari.github.io';
const version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const key='np-board-appearance-v1',types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp'};
const tick=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function press(page,value){await page.keyboard.press(value);await tick(page);}
function classic(n){const b=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>(Math.floor(i/n)*b+Math.floor(Math.floor(i/n)/b)+i%n)%n+1),puzzle=solution.map((v,i)=>i<2*n?0:v);return{uid:'ci-keys-'+n,id:'CI-KEYS-'+n,kind:'normal',n,level:1,ratingVersion:2,blockRows:b,blockCols:b,created:1792627200000,completed:false,elapsed:0,notes:{},puzzle,solution,grid:puzzle.slice()};}
async function setup(browser,{daily=false,viewport={width:1280,height:900},locale='ja'}={}){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[],packs=[];
 const p=classic(16),summary={day:'2026-10-23',level:1,n:16,kind:'normal',ruleName:'通常ナンプレ',title:'通常ナンプレ',rules:''},session={...summary,id:'ci-keybindings-native',started:1792627200000,serverNow:1792627200000,finished:false,solved:false,elapsed:0,ranked:false,resumed:true,puzzle:p.puzzle,solution:p.solution,regions:Array.from({length:256},(_,i)=>Math.floor(Math.floor(i/16)/4)*4+Math.floor(i%16/4))};
 await context.addInitScript(({daily,session,p})=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('nanpure-auto-next-v1','false');localStorage.setItem('np-daily-settings-v1',JSON.stringify({numberFirst:false,autoNext:false,autoComplete:false,sound:false}));if(daily)localStorage.setItem('np-practice-resume-v1',JSON.stringify({session,grid:p.grid,notes:{},elapsed:0,misses:0,hints:0,runId:session.id}));},{daily,session,p});
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(u.origin===site&&u.pathname.startsWith('/nanpure/')){if(/\/i18n\/[^/]+\.json$/.test(u.pathname))packs.push(path.basename(u.pathname,'.json'));const f=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:'Missing asset'});return route.fulfill({status:200,contentType:types[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});}if(u.pathname.startsWith('/api/')){if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+u.pathname);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,signedIn:true,unread:0})});}return route.fulfill({status:204,body:''});});
 await page.goto(site+'/nanpure/?lang='+locale);await page.locator('.main-choice').waitFor();return{context,page,errors,writes,packs};
}
async function openNotebook(page,n=9){
 await page.locator('.main-choice').click();await page.waitForFunction(()=>{const f=document.querySelector('iframe.notebook');return f&&getComputedStyle(f).visibility==='visible';});
 const frame=await(await page.locator('iframe.notebook').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.NPKeyBindings&&!!window.NanpureAppTest);
 await frame.evaluate(p=>{NanpureAppTest.validate(p);const lib=NanpureAppTest.getLibrary();lib.splice(0,lib.length,p);},classic(n));
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="ci-keys-'+n+'"]','[data-action="begin-play"][data-id="ci-keys-'+n+'"]'])await frame.locator(selector).click();
 await frame.locator('#np-play-settings-button').click();await frame.locator('[aria-controls="np-settings-page-input"]').click();await frame.locator('#play-input-mode').selectOption('cell');await frame.locator('#play-input-mode:not([disabled])').waitFor();await frame.locator('#np-play-settings').evaluate(d=>d.close());await tick(page);return frame;
}

const cell=(frame,index)=>frame.locator('#board [data-cell="'+index+'"]');
const choice=(target,key)=>target.locator('[data-appearance="'+key+'"]');
async function openView(frame){await frame.locator('#np-play-settings-button').click();await frame.locator('[aria-controls="np-settings-page-view"]').click();await choice(frame,'regionWidth').waitFor();}
// Independent expected menu labels catch untranslated or incorrect common UI.
const additional={it:'Gioco libero',nl:'Vrij spelen',sv:'Spela fritt',pl:'Gra swobodna',cs:'Volná hra',ru:'Свободная игра',id:'Bermain bebas',vi:'Chơi tự do',th:'เล่นอิสระ',hi:'स्वतंत्र खेल',ar:'لعب حر'};
async function audit(target,selector,label){
 // New notebook dialogs are translated by a MutationObserver/rAF batch. Wait
 // for its visible text, as the existing creation/print journeys do, without
 // forcing NPI18n.apply() or treating one pending frame as a missing message.
 await target.waitForFunction(selector=>{
  const root=document.querySelector(selector);if(!root)return false;
  const skip='script,style,textarea,[translate="no"],[data-i18n-skip],[contenteditable="true"]',walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while(node=walk.nextNode())if(node.parentElement.getClientRects().length&&!node.parentElement.closest(skip)&&/[\u3041-\u3096\u30a1-\u30fa]/.test(node.nodeValue))return false;
  return true;
 },selector,{timeout:10000});
 const result=await target.locator(selector).evaluate(root=>{
  const skip='script,style,textarea,[translate="no"],[data-i18n-skip],[contenteditable="true"]',bad=[],walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while(node=walk.nextNode())if(node.parentElement.getClientRects().length&&!node.parentElement.closest(skip)&&/[\u3041-\u3096\u30a1-\u30fa]/.test(node.nodeValue))bad.push(node.nodeValue.trim());
  return{bad:[...new Set(bad)],overflow:document.documentElement.scrollWidth>innerWidth+1,error:document.documentElement.getAttribute('data-i18n-error')};
 });assert.deepEqual(result.bad,[],label+' translated');assert.equal(result.overflow,false,label+' fits');assert.equal(result.error,null,label+' observer');
}
async function journey(browser,locale,expected){
 const f=await setup(browser,{locale,viewport:{width:375,height:812},daily:true}),{page}=f;
 assert.equal((await page.locator('.main-choice strong').textContent()).trim(),expected,locale+' home label');
 assert.equal(await page.locator('.language-picker option').count(),20);
 assert.deepEqual(f.packs,[locale],locale+' cold start loads one dictionary');await audit(page,'#root',locale+' home');
 await page.locator('.home-resume').click();await page.locator('.variable-board [data-cell="0"]').waitFor();
 const nativeNodes=await page.locator('.variable-board').evaluateHandle(board=>[...board.querySelectorAll('.cell')]);
 await page.locator('.variable-board [data-cell="0"]').click();await page.locator('[data-native-number="1"]').click();
 assert.equal(await page.locator('.variable-board [data-cell="0"] .cell-value').textContent(),'1');
 await page.evaluate(async()=>{await NPI18n.set('ja')});await page.evaluate(async locale=>{await NPI18n.set(locale)},locale);await tick(page);
 assert.equal(await page.evaluate(nodes=>nodes.every((n,i)=>n===document.querySelectorAll('.variable-board .cell')[i]),nativeNodes),true,locale+' native cell identity');
 assert.equal(await page.locator('.variable-board [data-cell="0"] .cell-value').textContent(),'1');
 await page.locator('.variable-board [data-cell="0"]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('2');assert.equal(await page.locator('.variable-board [data-cell="1"] .cell-value').textContent(),'2',locale+' keyboard coordinates');
 const nativeDirection=await page.locator('.variable-board').evaluate(b=>({dir:getComputedStyle(b).direction,left:b.children[0].getBoundingClientRect().left,right:b.children[1].getBoundingClientRect().left}));assert.equal(nativeDirection.dir,'ltr');assert(nativeDirection.left<nativeDirection.right,locale+' native coordinates');
 await page.locator('.header .play-settings-button').click();await page.locator('[aria-controls="daily-settings-view"]').click();await audit(page,'.play-settings',locale+' native settings');await page.locator('.ps-close').click();
 // Reuse the current document and the existing parent translation cache.
 await page.goto(site+'/nanpure/?lang='+locale);await page.locator('.main-choice').waitFor();f.packs.splice(0);
 const frame=await openNotebook(page);assert.deepEqual(f.packs,[],locale+' frame reuses parent dictionary');
 const nodes=await frame.locator('#board').evaluateHandle(board=>[...board.querySelectorAll('.cell')]);await cell(frame,0).click();await frame.locator('[data-action="number"][data-number="1"]').click();await tick(page);
 for(const lang of ['ja',locale]){await page.evaluate(async lang=>{await NPI18n.set(lang)},lang);await frame.waitForFunction(lang=>NPI18n.get()===lang,lang);await tick(page);assert.equal(await cell(frame,0).textContent(),'1');assert.equal(await frame.evaluate(nodes=>nodes.every((n,i)=>n===document.querySelectorAll('#board .cell')[i]),nodes),true,locale+' free-play cell identity');}
 assert.equal(await frame.locator('#board').evaluate(b=>getComputedStyle(b).direction),'ltr');
 await openView(frame);await audit(frame,'#np-play-settings',locale+' notebook settings');
 if(locale==='ar'){await page.setViewportSize({width:320,height:812});await tick(page);await audit(frame,'#np-play-settings',locale+' 320px settings');assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert.equal(await frame.locator('html').getAttribute('dir'),'rtl');await page.screenshot({path:process.env.NP_LANGUAGES_SCREENSHOT||'/tmp/nanpure-arabic-settings.png'});}
 await frame.locator('#np-play-settings').evaluate(d=>d.close());
 // Exercise the shipped SVG print renderer, all literal digits and translated
 // accessibility labels without opening a printer or submitting any data.
 const expectedDigits=await frame.evaluate(()=>{const p=NanpureAppTest.getCurrent();const out=NPPrint.buildPrint([p],{mode:'multi',paper:'A4',cols:1,rows:1,answers:'yes'});const proof=document.createElement('div');proof.className='language-print-proof';proof.innerHTML=out.pages.join('');document.body.append(proof);return p.puzzle.map((v,cell)=>({v,cell})).filter(x=>x.v).map(x=>({cell:x.cell,text:String(x.v)}));});
 await tick(page);const boards=await frame.locator('.language-print-proof .printed-board').evaluateAll(boards=>boards.map(b=>[...b.querySelectorAll('.puzzle-digit[data-cell]')].map(d=>({cell:Number(d.dataset.cell),text:d.textContent.trim()}))));assert(boards.length>=2);assert.deepEqual(boards[0],expectedDigits,locale+' printed givens');assert.equal(boards[1].length,81,locale+' printed solution');
 await frame.locator('.language-print-proof').evaluate(n=>n.remove());
 assert.deepEqual(await frame.evaluate(()=>NPI18n.missing()),[],locale+' no missing translations');assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await nativeNodes.dispose();await nodes.dispose();await f.context.close();console.log('PASS additional language:',locale,'mobile home, native and free play, settings, stable digits, SVG print, lazy loading');
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{for(const [locale,label]of Object.entries(additional))await journey(browser,locale,label);}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
