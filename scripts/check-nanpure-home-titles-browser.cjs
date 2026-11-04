// Verify the real home and collection without sending public writes.
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),site='https://atugari.github.io',types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg'};
async function setup(browser,width,height,theme='color'){
 const context=await browser.newContext({viewport:{width,height},locale:'ja-JP',isMobile:width<=600,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(theme=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});if(localStorage.getItem('home-titles-ci'))return;localStorage.setItem('home-titles-ci','1');localStorage.setItem('np-site-theme-v1',JSON.stringify({theme}));localStorage.setItem('np-achievements-v1',JSON.stringify({version:1,earned:{'NP-0001':{at:1792800000000},'NP-0002':{at:1792800001000},'NP-0003':{at:1792800002000}}}));const n=9,solution=Array.from({length:81},(_,i)=>(Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9+1),puzzle=solution.map((v,i)=>i<18?0:v),session={id:'home-titles-ci',day:'2026-10-25',level:1,n,kind:'normal',started:1792800000000,serverNow:1792800000000,finished:false,solved:false,elapsed:0,ranked:false,resumed:true,puzzle,solution,regions:Array.from({length:81},(_,i)=>Math.floor(Math.floor(i/9)/3)*3+Math.floor(i%9/3))};localStorage.setItem('np-practice-resume-v1',JSON.stringify({session,grid:puzzle,notes:{},elapsed:0,misses:0,hints:0,runId:session.id}));},theme);
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='pagead2.googlesyndication.com')return route.fulfill({status:200,contentType:'application/javascript',body:'/* AdSense is disabled in automated checks. */'});if(u.origin===site){const relative=decodeURIComponent(u.pathname).replace(/^\//,''),file=path.join(root,relative+(u.pathname.endsWith('/')?'index.html':''));if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});return route.fulfill({status:404,body:'not found'});}if(route.request().method()!=='GET'&&route.request().method()!=='OPTIONS')return route.abort();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,total:0,counts:{},puzzles:[],challenges:[]})});});
 await page.goto(site+'/nanpure/');await page.locator('.np-home-ready [data-np-titles]').waitFor({state:'attached'});await page.locator('.home-resume').waitFor();return{page,context,errors};
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 for(const[width,height,theme]of [[360,730,'color'],[375,667,'notebook'],[320,568,'color'],[390,844,'lounge'],[600,800,'color'],[900,950,'color']]){
  const f=await setup(browser,width,height,theme),{page}=f;
  assert.equal(await page.locator('.header h1.brand').textContent(),'ナンプレ帳');
  const homeSettings=page.getByRole('button',{name:'設定',exact:true});
  const settingsBox=await homeSettings.boundingBox();
  assert(settingsBox.width>=84&&settingsBox.height>=46,'The settings button is large enough for touch');
  await page.waitForFunction(()=>!!window.NPSiteLayout);
  assert.equal(await page.locator('.header [data-site-layout-select]').count(),0,'The home header has no layout switch');
  if(width===320||width===900){
   await homeSettings.click();
   const menu=page.locator('.site-menu'),close=page.locator('.game-dialog .dialog-close');
   await menu.waitFor();
   assert.equal(await menu.locator('.menu-categories > *').count(),5);
   assert.equal(await menu.locator('[data-menu-panel="ranking"]').count(),0);
   const help=menu.locator('[data-menu-group="help"]');
   assert.equal(await help.locator('[data-menu-panel="faq"]').isVisible(),false);
   await help.locator('summary').click();
   await help.locator('[data-menu-panel="faq"]').click();
   await page.locator('.faq-panel').waitFor();
   await close.click();await menu.waitFor();
   assert(await help.locator('[data-menu-panel="faq"]').isVisible(),'The expanded group stays open');
   const design=menu.locator('[data-menu-panel="theme"]');
   assert.equal(await design.locator('strong').textContent(),'背景とボタンを変更');
   await design.click();await page.locator('.theme-settings').waitFor();
   assert.equal(await menu.isVisible(),false);
   const preview=page.locator('.theme-preview-choice'),next=page.getByRole('button',{name:'次へ',exact:true});
   assert.equal(await page.locator('.theme-settings h2').textContent(),'背景とボタンを変更');
   assert.equal(await page.locator('.theme-save-note,.theme-option-copy').count(),0);
   const initial=await page.evaluate(()=>NPSiteTheme.get());
   const seen=new Set();
   for(let i=0;i<5;i++){
    const id=await preview.getAttribute('data-theme-preview');
    const expected=id+(width<=650?'-mobile.webp':'-desktop.webp');
    await page.waitForFunction(filename=>{
     const image=document.querySelector('.theme-preview-choice img');
     return image?.currentSrc.endsWith(filename)&&image.complete&&image.naturalWidth>0;
    },expected);
    const image=await preview.locator('img').evaluate(image=>({width:image.naturalWidth,height:image.naturalHeight}));
    assert.equal(await page.locator('.theme-settings img').count(),1);
    assert.equal(image.width<image.height,width<=650);
    seen.add(id);
    if(id.startsWith('contrast-')){
     await preview.click();
     await page.waitForFunction(theme=>document.documentElement.dataset.siteTheme===theme,id);
     assert.equal(await preview.getAttribute('aria-pressed'),'true');
     assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('np-site-theme-v1')).theme),id);
     assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),id==='contrast-dark'?'rgb(18, 24, 33)':'rgb(242, 245, 248)');
    }
    await next.click();
   }
   assert.deepEqual([...seen].sort(),['color','contrast-dark','contrast-light','lounge','notebook']);
   await page.evaluate(theme=>NPSiteTheme.set(theme),initial);
   await close.click();await menu.waitFor();
   assert(await design.evaluate(button=>button===document.activeElement),'Focus returns to the design button');
   await menu.locator('[data-menu-panel="settings"]').click();
   await page.locator('.play-settings .ps-category').first().waitFor();
   await page.locator('.play-settings [data-site-layout-select]').waitFor();
   await close.click();await menu.waitFor();
   await close.click();await page.locator('.game-dialog[open]').waitFor({state:'detached'});
  }
  assert.equal(await page.locator('.designed-home .start-title').count(),0);
  assert.match(await page.locator('.theme-entry.compact').textContent(),/^背景とボタンを変更/);
  assert.match(await page.locator('.home-topline [data-np-titles]').textContent(),/^称号一覧/);
  const centered=await page.locator('.start-choices .choice-arrow').evaluateAll(nodes=>nodes.every(node=>{
   const circle=node.getBoundingClientRect(),icon=node.querySelector('svg').getBoundingClientRect();
   return Math.abs((circle.left+circle.right)-(icon.left+icon.right))<1&&Math.abs((circle.top+circle.bottom)-(icon.top+icon.bottom))<1;
  }));
  assert(centered,'Each chevron is centered in its circle');
  assert.deepEqual(await page.locator('.designed-home .start-choices strong').allTextContents(),['ナンプレで遊ぶ','ナンプレを作る','日替わりナンプレに挑戦する','ナンプレを学ぶ','ナンプレの作品を見る']);
  assert.equal(await page.locator('.designed-home [data-collection-entry]').count(),0);
  assert.equal(await page.locator('.designed-home :is(.home-bottom-links,.home-version,[data-home-guide],[data-pare-entry])').count(),0);
  const support=page.locator('.home-support-button');
  assert.equal(await support.textContent(),'月100円で製作者を応援しよう♫');
  assert.equal(await support.getAttribute('href'),'https://ofuse.me/memberships/5107');
  const playSize=await page.locator('.main-choice').boundingBox(),supportSize=await support.boundingBox();
  for(const side of ['width','height'])assert(Math.abs(supportSize[side]-playSize[side]*2/3)<1,'Support '+side+' is two thirds of the play card');
  const cards=await page.locator('.start-choices .choice-card').evaluateAll(nodes=>nodes.map(e=>({height:e.offsetHeight,width:e.offsetWidth,background:getComputedStyle(e).backgroundColor})));
  for(const card of cards)assert.deepEqual([card.width,card.height],[cards[0].width,cards[0].height],'All five entry cards have the same size');
  assert.notEqual(cards[3].background,cards[4].background,'Learning and works use different colors');
  assert.equal(await page.locator('.learn-choice').getAttribute('href'),'/nanpure/learn/');
  await page.locator('.works-choice').click();
  assert(await page.locator('.np-home-more .home-event').isVisible());
  await page.locator('.works-choice').click();
  await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('.designed-home').scrollTop=0});
  const box=await page.evaluate(()=>{const m=document.querySelector('.designed-home'),rects=Array.from(m.querySelectorAll('button,a')).filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({text:e.textContent.trim(),r:e.getBoundingClientRect().toJSON()}));return{height:m.clientHeight,scroll:m.scrollHeight,width:innerWidth,viewport:innerHeight,rects};});
  assert(box.scroll>=box.height,JSON.stringify({width,height,...box}));
  for(const a of box.rects){assert(a.r.top>=0,a.text+' is above the page');assert(a.r.left>=-1&&a.r.right<=width+1,a.text+' is outside horizontal bounds');}
  for(let i=0;i<box.rects.length;i++)for(let j=i+1;j<box.rects.length;j++){const a=box.rects[i],b=box.rects[j];assert(!(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>2&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>2),'overlapping home actions: '+a.text+' / '+b.text);}
  if(await page.locator('.home-topline [data-np-titles]').isVisible())await page.locator('.home-topline [data-np-titles]').click();else{await page.locator('.menu-button').click();await page.locator('[data-menu-group="records"] > summary').click();await page.locator('.site-menu [data-np-titles]').click();}await page.locator('.np-titles[open]').waitFor();assert.equal(await page.locator('.np-title-tabs [data-filter=earned]').getAttribute('aria-pressed'),'true');
  const tile=page.locator('.np-title-card.earned').first();await tile.click();await page.locator('.np-title-details[open]').waitFor();assert((await page.locator('.np-title-description').textContent()).length>0);assert.equal(await page.locator('.np-title-details').evaluate(e=>getComputedStyle(e).animationName),'none');await page.locator('.np-title-details>header button').click();
  await page.locator('.np-title-notification input').uncheck();await page.waitForFunction(()=>NPAchievements.getState().notification==='off');await page.evaluate(()=>NPAchievements.capture('ui',{action:'last-book'}));await page.locator('.np-titles>header button').click();if(await page.locator('.game-dialog[open]').isVisible())await page.locator('.game-dialog .dialog-close').click();assert.equal(await page.locator('.np-title-toast').count(),0);
  await page.reload();await page.locator('.np-home-ready').waitFor();assert.equal(await page.evaluate(()=>NPAchievements.getState().notification),'off');assert(await page.evaluate(()=>!!NPAchievements.getState().earned['NP-0001']));
  await page.locator('.create-choice').click();
  await page.frameLocator('iframe.notebook').locator('[data-action="web-single"]').waitFor();
  await page.goto(site+'/nanpure/');
  await page.locator('.main-choice').click();
  await page.frameLocator('iframe.notebook').locator('[data-action="open-notebook"]').waitFor();
  const collection=page.frameLocator('iframe.notebook').locator('[data-collection-entry]');
  await collection.waitFor();
  assert.equal(await collection.locator('strong').textContent(),'すぐ遊べるナンプレ集');
  assert.equal(await collection.getAttribute('href'),'/nanpure/collection/');
  await page.locator('.back-button').click();
  await page.locator('.daily-choice').click();await page.locator('.difficulty-screen').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-np-titles]'));await page.locator('.back-button').click();await page.locator('.np-home-ready [data-np-titles]').waitFor({state:'attached'});await page.locator('.menu-button').click();await page.locator('[data-menu-group="records"] > summary').click();await page.locator('.site-menu [data-np-titles]').click();await page.locator('.np-titles[open]').waitFor();assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS home bounds, no overlapping actions, static title details, notification preference and return home:',width,height,theme);
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
