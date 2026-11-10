// Focused real-browser checks for the collapsible game introductions and home updates entry.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),site='https://atugari.github.io';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const pages=['wado','crossword','shirupure','cross','tenbin','studio','workshop','paths'];
async function contextFor(browser,width,height){
 const context=await browser.newContext({viewport:{width,height},locale:'ja-JP',isMobile:width<=600,serviceWorkers:'block'});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.removeItem('np-release-seen');});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===site){
   const relative=decodeURIComponent(u.pathname).replace(/^\//,'');
   const file=path.join(root,relative+(u.pathname.endsWith('/')?'index.html':''));
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   return route.fulfill({status:404,body:'not found'});
  }
  if(route.request().method()!=='GET'&&route.request().method()!=='OPTIONS')return route.abort();
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,total:0,counts:{},puzzles:[],challenges:[]})});
 });
 return context;
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
 try{
  for(const [width,height] of [[390,844],[1280,900]]){
   const context=await contextFor(browser,width,height),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   for(const key of pages){
    await page.goto(site+'/puzzles/'+key+'/',{waitUntil:'domcontentloaded'});
    const intro=page.locator('details.game-intro'),summary=intro.locator('summary'),frame=page.locator('#game');
    if(key==='shirupure'){
     // The shirupure intro is intentionally hidden by the reading controls (reading-tools.js),
     // so the collapsible-intro checks do not apply to this page.
     await page.waitForFunction(()=>{const el=document.querySelector('details.game-intro');return el&&getComputedStyle(el).display==='none';},null,{timeout:10000});
     continue;
    }
    await intro.waitFor();assert.equal(await intro.evaluate(e=>e.open),false,key+' starts collapsed');
    await frame.waitFor({state:'visible',timeout:30000});
    await page.waitForFunction(()=>{const f=document.querySelector('#game');try{return !!f?.contentDocument?.querySelector('main')}catch{return false}},null,{timeout:30000});
    const before=await frame.boundingBox();assert(before&&before.height>120,key+' has a usable play area while collapsed');
    await summary.click();assert.equal(await intro.evaluate(e=>e.open),true,key+' opens');
    const expanded=await frame.boundingBox();assert(expanded&&expanded.height>80,key+' keeps the game visible while expanded');
    await summary.click();assert.equal(await intro.evaluate(e=>e.open),false,key+' closes');
    const after=await frame.boundingBox();assert(after&&after.height>120,key+' restores the play area after closing');
   }
   assert.deepEqual(errors,[], 'no browser runtime errors at '+width+'px');
   await context.close();
  }
  const context=await contextFor(browser,390,844),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site+'/nanpure/',{waitUntil:'domcontentloaded'});
  const entry=page.locator('.home-updates-entry');
  await entry.waitFor({state:'visible',timeout:30000});
  assert.equal(await entry.locator('.home-updates-dot').count(),1,'unread indicator appears for a new release');
  await entry.click();
  await page.locator('.update-news').waitFor({state:'visible',timeout:15000});
  const seen=await page.evaluate(()=>localStorage.getItem('np-release-seen'));
  assert(seen&&/^\d{4}\.\d{2}\.\d+\.\d+$/.test(seen),'opening updates persists the seen release version');
  await page.locator('.game-dialog .dialog-close').click();
  await page.waitForFunction(()=>document.querySelector('.home-updates-entry .home-updates-dot')===null);
  assert.equal(await page.locator('.update-news').count(),0,'updates panel closes');
  assert.deepEqual(errors,[],'no home runtime errors');
  await context.close();
  console.log('PASS collapsible introductions: 7 games × mobile/desktop, shirupure intro hidden as intended; PASS home updates: unread marker, open, mark-read persistence and close');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
