// Exercise the stable public routes with every local asset, including the
// navigation adapter. API responses are isolated; no public records are changed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io';
const catalog=JSON.parse(fs.readFileSync(path.join(root,'nanpure/collection/catalog.json'))),sudokuCount=catalog.configs.filter(c=>c.kind!=='cross').reduce((n,c)=>n+c.count,0).toLocaleString('en-US');
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
await page.locator('.daily-choice').click();await page.locator('.site-shell.mode-challenge').waitFor();await page.locator('a[data-pare-entry]').waitFor({state:'detached'});
await page.goto(origin+'/nanpure/?lang=ja');await page.locator('[data-pare-entry]').waitFor();
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
await page.goto(origin+'/puzzles/cross/stock/');await page.locator('#summary').filter({hasText:'6,340'}).waitFor();assert.deepEqual(await page.locator('#kind option[value]:not([value=""])').evaluateAll(nodes=>nodes.map(n=>n.value)),['all','cross']);await page.locator('#size').selectOption({label:'6×6'});await page.locator('#quick').click();await page.waitForFunction(()=>document.querySelector('#playing-title').textContent.includes('P-010296'));
await page.waitForFunction(()=>document.querySelector('#game')?.contentWindow?.NanpureAppTest?.getCurrent()?.kind==='cross');assert.match(page.url(),/\/puzzles\/cross\/stock\/\?scope=cross&p=P-010296$/);
await page.reload();await page.waitForFunction(()=>document.querySelector('#player')?.hidden===false&&document.querySelector('#playing-title').textContent.includes('P-010296'));
await page.locator('#back').click();await page.locator('#library:not([hidden])').waitFor();assert.match(page.url(),/\/puzzles\/cross\/stock\/\?scope=cross$/);
await page.goto(origin+'/nanpure/collection/');await page.locator('#summary').filter({hasText:sudokuCount}).waitFor();assert.equal(await page.locator('#kind option[value="cross"]').count(),0);assert.equal(await page.locator('#kind option[value]:not([value=""])').count(),23);
await page.goto(origin+'/nanpure/collection/?p=P-010296');await page.waitForURL('**/puzzles/cross/stock/**');await page.waitForFunction(()=>document.querySelector('#playing-title')?.textContent.includes('P-010296'));
// All public cards must start and return at each requested viewport. Verify an
// actual input survives reload, not just that the same puzzle ID is displayed.
for(const viewport of [{width:1280,height:800},{width:375,height:812},{width:812,height:375}]){
 await page.setViewportSize(viewport);await page.goto(origin+'/plaza.html');
 for(const slug of ['shirupure','wado','crossword','cross','tenbin','paths','studio','workshop']){
  await page.locator('a[href="/puzzles/'+slug+'/"]').click();
  await page.locator('#game:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#status').hidden);
  assert(await page.frameLocator('#game').locator('main').isVisible(),slug+' actual game at '+viewport.width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,slug+' outer width '+viewport.width);
  if(slug==='shirupure')assert.equal(await page.frameLocator('#game').locator('a.main-site-link').getAttribute('href'),'/plaza.html','Real href also supports opening the hub in another tab');
  await page.locator('[data-hub]').click();await page.locator('.game-list').waitFor();
 }
 await page.goto(origin+'/puzzles/cross/stock/?p=P-010296');
 await page.waitForFunction(()=>document.querySelector('#game')?.contentWindow?.NanpureAppTest?.getCurrent()?.kind==='cross');
 const value=await page.evaluate(()=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().solution[0]);
 await page.frameLocator('#game').locator('[data-action="cell"][data-cell="0"]').click();
 await page.waitForFunction(v=>{const w=document.querySelector('#game').contentWindow,b=w.document.querySelector('.np-number-panel [data-number="'+v+'"]');if(!b)return false;const r=b.getBoundingClientRect(),hit=w.document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.y>=0&&r.bottom<=w.innerHeight&&!!hit&&b.contains(hit)},value);
 await page.frameLocator('#game').locator('.np-number-panel [data-number="'+value+'"]').click();
 await page.waitForFunction(v=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[0]===v,value);
 const saved=await page.evaluate(async()=>{const w=document.querySelector('#game').contentWindow;await w.NPStorage.flush();const p=w.NanpureAppTest.getCurrent(),stored=await w.NPStorage.get(p.uid);return{uid:p.uid,grid:p.grid.slice(),stored:stored?.grid}});
 assert.deepEqual(saved.stored,saved.grid,'Cross-balance durable save before reload at '+viewport.width);
 const before={uid:saved.uid,grid:saved.grid};
 await page.reload();await page.waitForFunction(()=>document.querySelector('#game')?.contentWindow?.NanpureAppTest?.getCurrent()?.kind==='cross');
 const after=await page.evaluate(()=>{const p=document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent();return{uid:p.uid,grid:p.grid.slice()}});
 assert.deepEqual(after,before,'Actual saved grid at '+viewport.width);
 await page.locator('#back').click();await page.locator('#library:not([hidden])').waitFor();
 await page.locator('#library header a').click();await page.locator('.game-list').waitFor();
 console.log('PASS viewport '+viewport.width+'x'+viewport.height+': eight starts/returns and actual saved-grid reload');
}
// The screenshot's large board must gain usable height, with real editing and
// reload still working. Smaller layouts retain their usable docked keypad.
for(const viewport of [{width:1920,height:870},{width:1280,height:800},{width:375,height:812},{width:812,height:375}]){
 await page.setViewportSize(viewport);await page.goto(origin+'/nanpure/collection/?p=P-060782');
 await page.waitForFunction(()=>document.querySelector('#game')?.contentWindow?.NanpureAppTest?.getCurrent()?.n===25);
 const child=page.frameLocator('#game'),wide=child.locator('[data-wide]'),desktop=viewport.width>=1000;
 await wide.waitFor();if((await wide.getAttribute('aria-pressed')==='true')!==desktop)await wide.click();
 await page.waitForFunction(wide=>document.querySelector('#game').contentDocument.querySelector('[data-wide]')?.getAttribute('aria-pressed')===String(wide),desktop);
 if(desktop){
  await page.waitForFunction(()=>{const w=document.querySelector('#game').contentWindow,b=w.document.getElementById('board-scroll').getBoundingClientRect(),a=w.document.querySelector('.play-dock').getBoundingClientRect();return b.top<60&&b.height>w.innerHeight*.85&&a.bottom<=b.top});
 }
 const unchanged=await page.evaluate(()=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid.slice());
 const settings=child.locator('[data-board-settings]'),dialog=child.locator('.np-workspace-dialog');
 await settings.click();await dialog.locator('select[data-digit-size]').selectOption('100');await dialog.locator('select[data-board-align]').selectOption('left');await dialog.locator('form button').click();
 await child.locator('[data-zoom="fit"]').click();
 const originalFont=await child.locator('[data-cell="0"]>span').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
 for(const align of ['left','center','right']){
  await settings.click();await dialog.locator('select[data-digit-size]').selectOption('200');await dialog.locator('select[data-board-align]').selectOption(align);await dialog.locator('form button').click();
  await page.waitForFunction(align=>{const d=document.querySelector('#game').contentDocument,b=d.getElementById('board'),v=d.getElementById('board-scroll'),br=b.getBoundingClientRect(),vr=v.getBoundingClientRect(),gap=Math.max(0,v.clientWidth-br.width),fraction={left:0,center:.5,right:1}[align];return b.dataset.panAlign===align&&Math.abs(br.left-vr.left-v.clientLeft-gap*fraction)<3},align);
 }
 const font=await child.locator('[data-cell="0"]>span').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
 if(desktop)assert(font>originalFont,'25x25 digits visibly increase');if(viewport.width===1920)assert(font>originalFont*1.5,'Large desktop digits visibly increase');
 const overflowing=await child.locator('#board .np-workspace-digit').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().width>el.parentElement.getBoundingClientRect().width+1).map(el=>({text:el.textContent,font:getComputedStyle(el).fontSize,width:el.getBoundingClientRect().width,cell:el.parentElement.getBoundingClientRect().width})));assert.deepEqual(overflowing,[],'Main digits fit their cells: '+JSON.stringify(overflowing.slice(0,3)));
 assert.deepEqual(await page.evaluate(()=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid),unchanged,'Display choices preserve all entered numbers');
 const {index,value}=await page.evaluate(()=>{const p=document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent(),index=p.puzzle.findIndex(v=>!v);return{index,value:p.solution[index]}});
 await child.locator('[data-action="cell"][data-cell="'+index+'"]').click();await child.locator('[data-action="erase"]').click();
 await page.waitForFunction(i=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[i]===0,index);
 await child.locator('.np-number-panel [data-number="'+value+'"]').click();
 await page.waitForFunction(({index,value})=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[index]===value,{index,value});
 await child.locator('[data-action="undo"]').click();await page.waitForFunction(i=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[i]===0,index);
 await child.locator('.np-number-panel [data-number="'+value+'"]').click();
 await page.waitForFunction(({index,value})=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[index]===value,{index,value});
 // Grid painting precedes the asynchronous IndexedDB commit. Await the queued
 // native write (without requesting a new save), then inspect the durable record.
 const saved=await page.evaluate(async({index})=>{const w=document.querySelector('#game').contentWindow,p=w.NanpureAppTest.getCurrent();await w.NPStorage.flush();const stored=await w.NPStorage.get(p.uid);return{uid:p.uid,grid:p.grid[index],stored:stored?.grid[index],status:w.document.querySelector('#play-status')?.textContent}},{index});
 assert.equal(saved.stored,value,'25x25 durable save before reload: '+JSON.stringify(saved));
 await page.reload();await page.waitForFunction(({index,value})=>document.querySelector('#game')?.contentWindow?.NanpureAppTest?.getCurrent()?.grid[index]===value,{index,value});
 await child.locator('#board[data-digit-size="200"][data-pan-align="right"]').waitFor();
 await settings.click();assert.equal(await dialog.locator('select[data-digit-size]').inputValue(),'200');assert.equal(await dialog.locator('select[data-board-align]').inputValue(),'right');await dialog.locator('form button').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'25x25 outer width');
 console.log('PASS 25x25 '+viewport.width+'x'+viewport.height+': larger digits, left/center/right, unchanged board, editing, undo and persisted preferences/entry');
}
// Appended rectangular and large boards use the existing player and storage.
// Start through the actual filters, edit via the keypad, inspect the queued
// durable write, reload, then return through the collection and notebook.
const importInfo=catalog.imports?.at(-1),baseline=importInfo?JSON.parse(fs.readFileSync(path.join(root,'nanpure/collection',importInfo.file))).baseline.configCount:catalog.configs.length;
const appended=catalog.configs.slice(baseline).filter(c=>c.kind==='normal'),sizes=[...new Set(appended.map(c=>c.n))];
for(const viewport of [{width:1280,height:800},{width:375,height:812},{width:812,height:375}]){
 await page.setViewportSize(viewport);
 for(const n of sizes.filter(n=>viewport.width===1280||[4,14,49,100].includes(n))){
  const cfg=appended.filter(c=>c.n===n).sort((a,b)=>b.level-a.level)[0],id='P-'+String(cfg.start).padStart(6,'0');
  await page.goto(origin+'/nanpure/collection/');await page.locator('#kind').selectOption('normal');await page.locator('#size').selectOption([n,cfg.multiShape||cfg.linkedShape||'',cfg.complexity||''].join(':'));await page.locator('#level').selectOption(String(cfg.level));
  await page.locator('#search').fill(id);await page.locator('.card[data-id="'+id+'"]').waitFor();await page.locator('#quick').click();
  await page.waitForFunction(n=>document.querySelector('#game')?.contentWindow?.NanpureAppTest?.getCurrent()?.n===n,n);
  const child=page.frameLocator('#game'),{index,value}=await page.evaluate(()=>{const w=document.querySelector('#game').contentWindow,p=w.NanpureAppTest.getCurrent(),index=[...w.document.querySelectorAll('[data-action="cell"][data-cell]')].map(el=>+el.dataset.cell).find(i=>!p.puzzle[i]);return{index,value:p.solution[index]}});
  assert(Number.isInteger(index),'Visible editable cell for '+n);
  await child.locator('[data-action="cell"][data-cell="'+index+'"]').click();await child.locator('[data-action="erase"]').click();
  await page.waitForFunction(i=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[i]===0,index);
  if(!await child.locator('.np-number-panel [data-number="'+value+'"]').count())await child.locator('[data-action="number-range"][data-range="'+Math.floor((value-1)/(n===36?18:n===49?25:20))+'"]').click();
  await child.locator('.np-number-panel [data-number="'+value+'"]').click();
  await page.waitForFunction(({index,value})=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[index]===value,{index,value});
  await child.locator('[data-action="undo"]').click();await page.waitForFunction(i=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[i]===0,index);
  await child.locator('.np-number-panel [data-number="'+value+'"]').click();
  await page.waitForFunction(({index,value})=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid[index]===value,{index,value});
  const before=await page.evaluate(async()=>{const w=document.querySelector('#game').contentWindow;await w.NPStorage.flush();const p=w.NanpureAppTest.getCurrent(),stored=await w.NPStorage.get(p.uid);return{uid:p.uid,grid:p.grid,stored:stored?.grid}});
  assert.deepEqual(before.stored,before.grid,'New '+n+'x'+n+' durable grid');await page.reload();
  await page.waitForFunction(uid=>document.querySelector('#game')?.contentWindow?.NanpureAppTest?.getCurrent()?.uid===uid,before.uid);
  assert.deepEqual(await page.evaluate(()=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid),before.grid,'New '+n+'x'+n+' reload at '+viewport.width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'New board outer width');
  await page.locator('#back').click();await page.locator('#library:not([hidden])').waitFor();await page.locator('#library header a').click();await page.locator('[data-collection-entry]').waitFor();
 }
 console.log('PASS appended sizes '+viewport.width+'x'+viewport.height+': filters, start, keypad, erase, undo, durable grid, reload and notebook return');
}
assert.deepEqual(errors,[]);await context.close();console.log('PASS public relocation: nine tools start, hub returns, Sudoku-only shell, audio controls, scoped original collection ids, reload/resume and legacy bookmarks.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
