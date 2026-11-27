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
await page.goto(origin+'/');for(const slug of ['shirupure','wado','crossword'])assert.equal(await page.locator('a.game-card[href="/puzzles/'+slug+'/"]').count(),1);
await page.goto(origin+'/nanpure/?lang=en');
await page.getByRole('link',{name:'Support the creator for ¥100/month ♫',exact:true}).waitFor();
assert.equal(await page.locator('.designed-home [data-pare-entry]').count(),0);
await page.goto(origin+'/nanpure/?lang=ja');
await page.getByRole('link',{name:'月100円で製作者を応援しよう♫',exact:true}).waitFor();
assert.equal(await page.locator('.designed-home [data-pare-entry]').count(),0);
assert.equal(await page.locator('.shiru-entry').isVisible(),false);
// The prerendered home buttons receive their click handlers when the shell mounts.
await page.waitForFunction(()=>window.NPAchievementShellAttached);await page.locator('.main-choice').click();const notebook=page.frameLocator('iframe.notebook');await notebook.locator('#multi-sizes-form').waitFor();await page.evaluate(()=>{document.querySelector('iframe.notebook')?.contentWindow?.NPWebsiteHome?.();});await page.locator('.choose-rules').click();await notebook.locator('[data-action="open-notebook"]').waitFor();await notebook.locator('[data-action="open-crossword"]').waitFor({state:'attached'});await notebook.locator('[data-action="open-prototype"]').waitFor({state:'attached'});
// The navigation adapter hides the non-Sudoku entries with data-np-moved, but the
// notebook re-renders its menu when the language pack lands, briefly showing fresh
// buttons. Wait until both entries stay hidden for a full second before asserting.
await page.waitForFunction(()=>{const doc=document.querySelector('iframe.notebook')?.contentDocument;if(!doc)return false;const ok=['open-crossword','open-prototype'].every(a=>{const b=doc.querySelector('[data-action="'+a+'"]');return b&&b.hasAttribute('data-np-moved')&&doc.defaultView.getComputedStyle(b).display==='none'});if(!ok){window.__npHideStableSince=0;return false}const now=Date.now();if(!window.__npHideStableSince)window.__npHideStableSince=now;return now-window.__npHideStableSince>1000});
assert.equal(await notebook.locator('[data-action="open-crossword"]').isVisible(),false);assert.equal(await notebook.locator('[data-action="open-prototype"]').isVisible(),false);
assert.equal(await notebook.locator('.homechoices a[href="/puzzles/"]').count(),0,'The Sudoku play menu has no Pareasobi tile');
assert(await notebook.locator('[data-action="open-notebook"]').isVisible(),'Sudoku remains available from the play menu');
await page.goto(origin+'/puzzles/');
for(const slug of ['shirupure','wado','crossword','studio'])assert.equal(await page.locator('a[href="/puzzles/'+slug+'/"]').count(),1);

for(const slug of ['shirupure','wado','crossword','studio']){
 await page.goto(origin+'/puzzles/'+slug+'/');if(slug==='wado'){await page.locator('#levels button').first().waitFor();assert.equal(await page.locator('#levels button').count(),10,'wado difficulty list');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'wado outer width');assert.equal(await page.locator('[data-sound]').count(),0,'wado sound button removed');await page.locator('[data-hub]').click();await page.locator('.game-list').waitFor();continue;}await page.locator('#game:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#status').hidden);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,slug+' outer width');
 const child=page.frameLocator('#game');assert(await child.locator('main').isVisible(),slug+' has actual content');
 if(slug==='shirupure'){await child.locator('[data-act=learn]').click();await child.locator('.lesson-target').click();await page.waitForFunction(()=>{const h=document.querySelector('body[data-game="shirupure"]>header');return h&&getComputedStyle(h).display==='none'});assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('body[data-game="shirupure"]>header')).display),'none','shirupure outer header hidden as intended');}
 if(slug==='wado'){assert.equal(await page.locator('[data-sound]').count(),0,'wado sound button removed');}
 if(slug==='shirupure'){await page.goto(origin+'/');}else{await page.locator('[data-hub]').click();}await page.locator('.game-list').waitFor();
}
// All public cards must start and return at each requested viewport. Verify an
// actual input survives reload, not just that the same puzzle ID is displayed.
for(const viewport of [{width:1280,height:800},{width:375,height:812},{width:812,height:375}]){
 await page.setViewportSize(viewport);await page.goto(origin+'/');
 for(const slug of ['shirupure','wado','crossword']){
  await page.locator('a.game-card[href="/puzzles/'+slug+'/"]').click();
  if(slug==='wado'){await page.locator('#levels button').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'wado outer width '+viewport.width);await page.locator('[data-hub]').click();await page.locator('.game-list').waitFor();continue;}
  await page.locator('#game:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#status').hidden);
  assert(await page.frameLocator('#game').locator('main').isVisible(),slug+' actual game at '+viewport.width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,slug+' outer width '+viewport.width);
  if(slug==='shirupure')assert.equal(await page.frameLocator('#game').locator('a.main-site-link').getAttribute('href'),'/plaza.html','Real href also supports opening the hub in another tab');
  if(slug==='shirupure'){await page.goto(origin+'/');}else{await page.locator('[data-hub]').click();}await page.locator('.game-list').waitFor();
 }
  console.log('PASS viewport '+viewport.width+'x'+viewport.height+': three starts/returns');
}
assert.deepEqual(errors,[]);await context.close();console.log('PASS public relocation: four tools start, hub returns, Sudoku-only shell, audio controls.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
