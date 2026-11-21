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
await page.goto(origin+'/plaza.html');for(const slug of ['shirupure','wado','crossword'])assert.equal(await page.locator('a.game-card[href="/puzzles/'+slug+'/"]').count(),1);
await page.goto(origin+'/nanpure/?lang=en');
await page.getByRole('link',{name:'Support the creator for ¥100/month ♫',exact:true}).waitFor();
assert.equal(await page.locator('.designed-home [data-pare-entry]').count(),0);
await page.goto(origin+'/nanpure/?lang=ja');
await page.getByRole('link',{name:'月100円で製作者を応援しよう♫',exact:true}).waitFor();
assert.equal(await page.locator('.designed-home [data-pare-entry]').count(),0);
assert.equal(await page.locator('.shiru-entry').isVisible(),false);
// The prerendered home buttons receive their click handlers when the shell mounts.
await page.waitForFunction(()=>window.NPAchievementShellAttached);await page.locator('.main-choice').click();const notebook=page.frameLocator('iframe.notebook');await notebook.locator('[data-action="open-notebook"]').waitFor();await notebook.locator('[data-action="open-crossword"]').waitFor({state:'attached'});await notebook.locator('[data-action="open-prototype"]').waitFor({state:'attached'});
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
 await page.goto(origin+'/puzzles/'+slug+'/');await page.locator('#game:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#status').hidden);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,slug+' outer width');
 const child=page.frameLocator('#game');assert(await child.locator('main').isVisible(),slug+' has actual content');
 if(slug==='shirupure'){await child.locator('[data-act=learn]').click();await child.locator('.lesson-target').click();await page.waitForFunction(()=>{const h=document.querySelector('body[data-game="shirupure"]>header');return h&&getComputedStyle(h).display==='none'});assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('body[data-game="shirupure"]>header')).display),'none','shirupure outer header hidden as intended');}
 if(slug==='wado'){await page.locator('[data-sound]').click();await page.locator('dialog[open] [data-audio=track]').selectOption('cozy-puzzle-3');assert.equal(await page.evaluate(()=>NPSiteAudio.get().track),'cozy-puzzle-3');await page.locator('dialog[open]').getByRole('button',{name:'閉じる',exact:true}).click();}
 if(slug==='shirupure'){await page.goto(origin+'/plaza.html');}else{await page.locator('[data-hub]').click();}await page.locator('.game-list').waitFor();
}
await page.goto(origin+'/nanpure/collection/');await page.locator('#summary').filter({hasText:sudokuCount}).waitFor();assert.equal(await page.locator('#kind option[value="cross"]').count(),0);assert.equal(await page.locator('#kind option[value]:not([value=""])').count(),23);
// All public cards must start and return at each requested viewport. Verify an
// actual input survives reload, not just that the same puzzle ID is displayed.
for(const viewport of [{width:1280,height:800},{width:375,height:812},{width:812,height:375}]){
 await page.setViewportSize(viewport);await page.goto(origin+'/plaza.html');
 for(const slug of ['shirupure','wado','crossword']){
  await page.locator('a.game-card[href="/puzzles/'+slug+'/"]').click();
  await page.locator('#game:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#status').hidden);
  assert(await page.frameLocator('#game').locator('main').isVisible(),slug+' actual game at '+viewport.width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,slug+' outer width '+viewport.width);
  if(slug==='shirupure')assert.equal(await page.frameLocator('#game').locator('a.main-site-link').getAttribute('href'),'/plaza.html','Real href also supports opening the hub in another tab');
  if(slug==='shirupure'){await page.goto(origin+'/plaza.html');}else{await page.locator('[data-hub]').click();}await page.locator('.game-list').waitFor();
 }
  console.log('PASS viewport '+viewport.width+'x'+viewport.height+': three starts/returns');
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
  await page.locator('#back').click();await page.locator('#library:not([hidden])').waitFor();await page.locator('#library header a[href="/nanpure/"]').click();await page.waitForFunction(()=>window.NPAchievementShellAttached);await page.locator('.main-choice').click();await page.frameLocator('iframe.notebook').locator('[data-collection-entry]').waitFor();
 }
 console.log('PASS appended sizes '+viewport.width+'x'+viewport.height+': filters, start, keypad, erase, undo, durable grid, reload and notebook return');
}
// The phone recording's 16x16 board used under two thirds of the available
// width because docked controls consumed the height. Keep all keys accessible,
// and check the warning against rendered geometry on desktop as well.
for(const viewport of [{width:360,height:680},{width:844,height:390},{width:1280,height:800}]){
 await page.setViewportSize(viewport);await page.goto(origin+'/nanpure/collection/?p=P-059062');
 const child=page.frameLocator('#game'),dialog=child.locator('.np-workspace-dialog');
 await child.locator('[data-board-settings]').waitFor();await child.locator('[data-board-settings]').click();
 await dialog.locator('[data-digit-size]').selectOption('100');await dialog.locator('[data-dialog-position]').selectOption('bottom');await dialog.locator('form button').click();
 const wide=child.locator('[data-wide]');if(await wide.getAttribute('aria-pressed')==='true')await wide.click();
 await child.locator('[data-zoom="fit"]').click();
 if(viewport.width===360){
  try{await page.waitForFunction(()=>{const d=document.querySelector('#game').contentDocument,r=d.querySelector('#board .cell').getBoundingClientRect();return r.width>=20&&r.height>=20});}catch(error){
   const geometry=await child.locator('.np-workspace-screen').evaluate(el=>{const r=el.querySelector('#board .cell').getBoundingClientRect();return{width:innerWidth,height:innerHeight,cell:[r.width,r.height],rows:getComputedStyle(el).gridTemplateRows,position:el.dataset.numberPosition,preference:el.dataset.numberPreference,wide:el.classList.contains('np-wide')};});
   throw Error('Phone 16x16 fit: '+JSON.stringify(geometry),{cause:error});
  }
  const keys=await child.locator('.np-number-panel .number-pad>button').evaluateAll(nodes=>({count:nodes.length,rows:new Set(nodes.map(el=>Math.round(el.getBoundingClientRect().top))).size}));
  assert.equal(keys.count,16);assert(keys.rows<=2,'Sixteen keys take at most two rows at phone width');
 }
 for(let i=0;i<4;i++)await child.locator('[data-zoom="out"]').click();
 await child.locator('.np-small-board-notice:not([hidden])').waitFor();
 const before=await page.evaluate(()=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid.slice());
 await child.locator('[data-readable]').click();
 await page.waitForFunction(()=>{const d=document.querySelector('#game').contentDocument,r=d.querySelector('#board .cell').getBoundingClientRect();return Math.min(r.width,r.height)>=31.9&&d.querySelector('.np-small-board-notice').hidden});
 assert.deepEqual(await page.evaluate(()=>document.querySelector('#game').contentWindow.NanpureAppTest.getCurrent().grid),before,'Readability choices never edit the puzzle');
 for(let i=0;i<4;i++)await child.locator('[data-zoom="out"]').click();
 await child.locator('.np-small-board-notice:not([hidden])').waitFor();await child.locator('[data-dismiss-size]').click();assert(await child.locator('.np-small-board-notice').isHidden());
 await child.locator('[data-zoom="fit"]').click();assert(await child.locator('.np-small-board-notice').isHidden(),'Dismissal lasts for this open puzzle');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'16x16 outer width');
 console.log('PASS readable 16x16 '+viewport.width+'x'+viewport.height+': compact phone keys, actual-size warning, one-tap readable zoom, dismiss and unchanged grid');
}
assert.deepEqual(errors,[]);await context.close();console.log('PASS public relocation: four tools start, hub returns, Sudoku-only shell, audio controls, scoped original collection ids, reload/resume.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
