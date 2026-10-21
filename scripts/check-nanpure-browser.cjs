// Real Chromium mobile check against the prepared Pages artifact and live read-only API.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const root=path.resolve(process.argv[2]||'_site');const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
 await page.route('https://atugari.github.io/nanpure/**',async route=>{const u=new URL(route.request().url()),file=path.join(root,u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);if(!file.startsWith(root)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing asset'});await route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)})});
 for(const view of['','daily','ranking','calendar','contact','replies','backup','privacy','manage']){
  await page.goto('https://atugari.github.io/nanpure/'+(view?'?view='+view:''),{waitUntil:'networkidle'});
  const selector={'':'.main-choice',daily:'.challenge-grid, .daily-choice, .challenge-list',ranking:'.ranking',calendar:'.daily-calendar',contact:'.contact-form',replies:'.contact-history',backup:'.cloud-save',privacy:'.legal',manage:'.legal'}[view];
  // Main feature headings must render and errors must not be hidden behind a redirect.
  if(['ranking','contact','backup','privacy','manage'].includes(view))await page.locator(selector).waitFor({timeout:20000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Mobile overflow in '+view);
  assert.equal((await page.locator('a[href*="chatgpt.site"]').count()),0,'Legacy account URL in '+view);
  assert(!/通信できませんでした|読み込めませんでした/.test(await page.locator('body').innerText()),'API error in '+view);
  if(view==='daily')assert((await page.locator('body').innerText()).includes('日替わり'));
  if(view==='backup')assert((await page.locator('body').innerText()).includes('別の端末とつなぐ'));
  console.log('PASS mobile view:',view||'home');
 }
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS native routes, mobile layout, live Cloudflare reads and no private legacy URLs');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
