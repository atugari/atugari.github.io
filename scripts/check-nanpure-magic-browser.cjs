// Exercise the real generation worker and persistent magic-square previews.
// Every network request is isolated, including APIs; public records never change.
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
const storageKey='np-magic-square-v1';
async function settle(target){await target.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function complete(target,count){await target.waitForFunction(({key,count})=>document.querySelector('#magic-form')?.getAttribute('aria-busy')==='false'&&JSON.parse(localStorage.getItem(key)||'{"items":[]}').items.length===count,{key:storageKey,count},{timeout:15000});}
async function start(target,{n='3',blanks='standard',count='1'}={}){await target.locator('#magic-size').selectOption(n);await target.locator('#magic-blanks').selectOption(blanks);await target.locator('#magic-count').selectOption(count);await target.locator('#magic-generate').focus();await target.locator('#magic-generate').press('Enter');}
async function audit(target){
 await target.waitForFunction(()=>!/[\u3041-\u3096\u30a1-\u30fa]/.test(document.querySelector('.screen').innerText),{},{timeout:10000});
 assert.equal(await target.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'mobile page fits');
 assert.equal(await target.locator('html').getAttribute('dir'),'rtl');
}
async function finish(f){assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();}
async function journey(browser){
 const f=await setup(browser),{page}=f;
 await page.locator('.main-choice').click();await page.waitForFunction(()=>document.querySelector('iframe.notebook')?.contentWindow?.NanpureAppTest);
 const frame=await(await page.locator('iframe.notebook').elementHandle()).contentFrame();
 const future=frame.locator('[data-future="magic-square"]');assert(await future.isDisabled());assert.equal(await future.getAttribute('aria-disabled'),'true');
 assert(await frame.getByRole('button',{name:'イラストロジック帳を開く'}).isDisabled());
 await future.evaluate(el=>el.click());assert.equal(await frame.evaluate(()=>NanpureAppTest.getRoute().flow),'hub','disabled entry cannot start a game');
 await frame.locator('[data-action="open-prototype"]').click();await frame.locator('[data-proto="magic-generator"]').click();
 await frame.locator('#magic-form').waitFor();await frame.waitForFunction(()=>!!window.NPMagicSquare);
 assert(await frame.locator('[data-magic-play]').isDisabled());
 await start(frame,{n:'4',blanks:'many',count:'3'});await complete(frame,3);
 const records=await frame.evaluate(key=>JSON.parse(localStorage.getItem(key)).items,storageKey);
 for(const p of records){assert.equal(p.n,4);assert.equal(p.target,34);assert(p.blanks>0);assert.equal(p.puzzle.length,16);}
 const proof=await frame.evaluate(()=>JSON.parse(localStorage.getItem('np-magic-square-v1')).items.map(p=>NPMagicSquare.countSolutions(p.puzzle,p.n)));
 assert(proof.every(p=>p.complete&&p.count===1));
 await frame.locator('.magic-question>summary').first().click();await frame.locator('.magic-preview').first().waitFor();
 const shown=await frame.locator('.magic-preview').first().locator('.magic-board').first().locator('td').allTextContents();
 assert.deepEqual(shown.map(s=>s.trim()?Number(s):0),records.at(-1).puzzle,'preview matches generated givens');
 const answer=frame.locator('.magic-answer').first();assert.equal(await answer.getAttribute('open'),null,'answer starts hidden');await answer.locator('summary').click();assert.deepEqual((await answer.locator('td').allTextContents()).map(Number),records.at(-1).solution);
 assert.equal(await frame.locator('#magic-list input,#magic-list [contenteditable],#magic-list button').count(),0,'saved boards are previews with no play controls');
 const before=await frame.evaluate(key=>localStorage.getItem(key),storageKey);await page.keyboard.press('1');assert.equal(await frame.evaluate(key=>localStorage.getItem(key),storageKey),before);
 await page.setViewportSize({width:320,height:812});await page.evaluate(async()=>NPI18n.set('ar'));await frame.waitForFunction(()=>NPI18n.get()==='ar');await audit(frame);
 assert.equal(await frame.locator('.magic-board').first().evaluate(el=>getComputedStyle(el).direction),'ltr');
 await start(frame,{n:'5',blanks:'few'});await complete(frame,4);await audit(frame);
 assert(!String(await frame.locator('#magic-status').textContent()).includes('{0}'),'saved count is formatted');
 await page.evaluate(async()=>NPI18n.set('ja'));await frame.waitForFunction(()=>NPI18n.get()==='ja');
 await frame.goto(frame.url());await frame.locator('.magic-question').first().waitFor();assert.equal(await frame.locator('.magic-question').count(),4,'saved questions survive navigation');
 // Cancelling before the real worker sends its first result must not add a
 // late question, including one queued behind a storage lock.
 await frame.evaluate(()=>{document.getElementById('magic-form').requestSubmit();document.getElementById('magic-stop').click();});await settle(frame);assert.equal(await frame.locator('#magic-form').getAttribute('aria-busy'),'false');await complete(frame,4);
 // Force a repeatable RNG seed; both runs still execute the real worker.
 await frame.evaluate(()=>{window.__random=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=values=>{values.fill(42);return values;};});
 await start(frame);await complete(frame,5);await start(frame);await complete(frame,5);assert.equal(await frame.locator('.magic-question').count(),5,'duplicate generated questions are not saved twice');await frame.evaluate(()=>{crypto.getRandomValues=window.__random;});
 await frame.evaluate(key=>{window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('full','QuotaExceededError');return __set.call(this,k,v);};},storageKey);
 await start(frame,{n:'5'});await frame.locator('#magic-error:not([hidden])').waitFor();await complete(frame,5);assert.equal(await frame.locator('.magic-question').count(),5,'failed save cannot claim an extra saved question');await frame.evaluate(()=>{Storage.prototype.setItem=window.__set;});
 await frame.goto(frame.url().split('#')[0]+'#play');await frame.locator('#magic-form').waitFor();assert(await frame.locator('[data-magic-play]').isDisabled());assert.equal(await frame.locator('#magic-list input,#magic-list [contenteditable]').count(),0,'hash cannot enable play');
 await frame.locator('.magic-header a').click();await frame.locator('[data-proto="magic-generator"]').waitFor();
 await finish(f);console.log('PASS magic browser: disabled play entries, real worker, unique 4×4/5×5, hidden answers, persistent previews, Arabic at 320px, cancellation, deduplication and storage failure');return records[0];
}
async function corrupt(browser){
 const f=await setup(browser),{page}=f;
 const raw='{"version":1,"items":[{"kind":"magic-square","n":4}]}';
 await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:storageKey,raw});
 await page.goto(site+'/nanpure/releases/'+version+'/notebook/magic-square.html?lang=ja');await page.locator('#magic-error:not([hidden])').waitFor();assert(await page.locator('#magic-generate').isDisabled());assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),raw,'unreadable saved data is preserved');assert(await page.locator('[data-magic-play]').isDisabled());
 await finish(f);console.log('PASS magic browser: unreadable stored data is preserved and play remains unavailable');
}
async function languages(browser,fixture){
 const f=await setup(browser),{page}=f;
 await page.evaluate(({key,fixture})=>localStorage.setItem(key,JSON.stringify({version:1,items:[fixture]})),{key:storageKey,fixture});
 await page.setViewportSize({width:375,height:812});
 const locales=Object.keys(require('./i18n/languages.json')).filter(code=>code!=='ja');
 for(const locale of locales){
  await page.goto(site+'/nanpure/releases/'+version+'/notebook/magic-square.html?lang='+locale);await page.waitForFunction(locale=>window.NPI18n?.get()===locale&&!!window.NPMagicSquare,locale);await page.locator('.magic-question>summary').click();await page.locator('.magic-preview').waitFor();
  await page.waitForFunction(()=>!/[\u3041-\u3096\u30a1-\u30fa]/.test(document.body.innerText));
  assert.equal(await page.locator('h1').textContent(),await page.evaluate(()=>NPI18n.t('まほうじんを作る')),locale+' title');assert.deepEqual(await page.evaluate(()=>NPI18n.missing()),[],locale+' complete translations');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,locale+' fits');assert(await page.locator('[data-magic-play]').isDisabled());
  if(locale==='ar'&&process.env.NP_MAGIC_SCREENSHOT)await page.screenshot({path:process.env.NP_MAGIC_SCREENSHOT,fullPage:true});
 }
 await finish(f);console.log('PASS magic browser: all 19 translated languages, saved previews and disabled play on mobile');
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{const fixture=await journey(browser);await corrupt(browser);await languages(browser,fixture);}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
