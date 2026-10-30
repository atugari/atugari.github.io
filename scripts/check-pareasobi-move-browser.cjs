// Exercise the stable public routes with every local asset, including the
// navigation adapter. API responses are isolated; no public records are changed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.mp3':'audio/mpeg','.png':'image/png','.webp':'image/webp'};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{const context=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'}));
await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin){const file=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Missing asset'});return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)})}if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,unread:0,signedIn:true,serverNow:Date.now()})});return route.fulfill({status:204,body:''})});
await page.goto(origin+'/plaza.html');for(const slug of ['shirupure','wado','crossword','cross','tenbin','paths','studio','workshop'])assert.equal(await page.locator('a[href="/puzzles/'+slug+'/"]').count(),1);
await page.goto(origin+'/nanpure/?lang=ja');await page.locator('[data-pare-entry]').waitFor();assert.equal(await page.locator('.shiru-entry').isVisible(),false);
await page.goto(origin+'/nanpure/?lang=en');await page.locator('[data-pare-entry] strong').filter({hasText:'More puzzles on Pareasobi'}).waitFor();assert(!/[\u3041-\u3096\u30a1-\u30fa]/.test(await page.locator('[data-pare-entry]').innerText()),'Relocation copy follows the selected language');
await page.goto(origin+'/nanpure/?lang=ja');await page.locator('[data-pare-entry] strong').filter({hasText:'ほかのパズルはパレあそびへ'}).waitFor();
await page.locator('.main-choice').click();const notebook=page.frameLocator('iframe.notebook');await notebook.locator('[data-pare-entry]').waitFor();assert.equal(await notebook.locator('[data-action="open-crossword"]').isVisible(),false);assert.equal(await notebook.locator('[data-action="open-prototype"]').isVisible(),false);
for(const slug of ['shirupure','wado','crossword','cross','tenbin','paths','studio','workshop','magic-square']){
 await page.goto(origin+'/puzzles/'+slug+'/');await page.locator('#game:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#status').hidden);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,slug+' outer width');
 const child=page.frameLocator('#game');assert(await child.locator('main').isVisible(),slug+' has actual content');
 if(slug==='shirupure'){await child.locator('[data-act=learn]').click();await child.locator('.lesson-target').click();await page.locator('[data-sound]').click();await page.locator('dialog[open] [data-audio=track]').selectOption('cozy-puzzle-3');assert.equal(await page.evaluate(()=>NPSiteAudio.get().track),'cozy-puzzle-3');await page.locator('dialog[open]').getByRole('button',{name:'閉じる',exact:true}).click();}
 if(slug==='paths')assert((await child.locator('main').innerText()).includes('しるしのこみち'));
 if(slug==='magic-square')assert(await child.locator('[data-magic-play]').isDisabled());
 await page.locator('[data-hub]').click();await page.locator('.game-list').waitFor();
}
await page.goto(origin+'/puzzles/cross/stock/');await page.locator('#summary').filter({hasText:'6,340'}).waitFor();assert.deepEqual(await page.locator('#kind option[value]:not([value=""])').evaluateAll(nodes=>nodes.map(n=>n.value)),['cross']);await page.locator('#size').selectOption({label:'6×6'});await page.locator('#quick').click();await page.waitForFunction(()=>document.querySelector('#playing-title').textContent.includes('P-010296'));
await page.waitForFunction(()=>document.querySelector('#game')?.contentWindow?.NanpureAppTest?.getCurrent()?.kind==='cross');assert.match(page.url(),/\/puzzles\/cross\/stock\/\?scope=cross&p=P-010296$/);
await page.reload();await page.waitForFunction(()=>document.querySelector('#player')?.hidden===false&&document.querySelector('#playing-title').textContent.includes('P-010296'));
await page.locator('#back').click();await page.locator('#library:not([hidden])').waitFor();assert.match(page.url(),/\/puzzles\/cross\/stock\/\?scope=cross$/);
await page.goto(origin+'/nanpure/collection/');await page.locator('#summary').filter({hasText:'93,660'}).waitFor();assert.equal(await page.locator('#kind option[value="cross"]').count(),0);assert.equal(await page.locator('#kind option[value]:not([value=""])').count(),22);
await page.goto(origin+'/nanpure/collection/?p=P-010296');await page.waitForURL('**/puzzles/cross/stock/**');await page.waitForFunction(()=>document.querySelector('#playing-title')?.textContent.includes('P-010296'));
assert.deepEqual(errors,[]);await context.close();console.log('PASS public relocation: nine tools start, hub returns, Sudoku-only shell, audio controls, scoped original collection ids, reload/resume and legacy bookmarks.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
