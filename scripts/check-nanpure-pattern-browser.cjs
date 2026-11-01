// CI browser regressions: real worker, painting, keyboard, save and mobile layout.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io',version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('nanpure-language-v1','ja');Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.fulfill({status:204,body:''});const file=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});});
  const url=origin+'/nanpure/releases/'+version+'/notebook/index.html';await page.goto(url);await page.locator('[data-action="open-notebook"]').waitFor();await page.locator('[data-action="open-notebook"]').click();await page.locator('[data-flow="create"]').click();await page.locator('[data-action="pattern-open"]').click();
  const dialog=page.locator('#np-pattern-dialog');await dialog.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});
  assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),55);
  await dialog.locator('[data-pattern-clear]').click();await dialog.locator('[data-pattern-status][data-state="impossible"]').waitFor();assert.equal(await dialog.locator('[data-pattern-save]').isDisabled(),true);
  // Painting invalidates an older worker immediately and keeps exact cell choices.
  await dialog.locator('[data-pattern-preset="diamond"]').click();await dialog.locator('[data-pattern-clear]').click();await page.waitForTimeout(400);assert.equal(await dialog.locator('[data-pattern-status]').getAttribute('data-state'),'impossible');
  const from=await dialog.locator('[data-pixel="0"]').boundingBox(),to=await dialog.locator('[data-pixel="8"]').boundingBox();await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),9);
  await dialog.locator('[data-pattern-undo]').click();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),0);
  await dialog.locator('[data-pixel="0"]').focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),2);
  await dialog.locator('[data-pattern-preset="omit"]').click();await dialog.locator('[data-pattern-omit]').selectOption('9');await dialog.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),72);
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow on '+viewport.width);
  await dialog.locator('[data-pattern-close]').click();await page.reload();await page.locator('[data-action="open-notebook"]').waitFor();await page.locator('[data-action="open-notebook"]').click();await page.locator('[data-flow="create"]').click();await page.locator('[data-action="pattern-open"]').click();await dialog.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});assert.equal(await dialog.locator('[data-pattern-omit]').inputValue(),'9');
  await dialog.locator('[data-pattern-save]').click();await dialog.waitFor({state:'detached'});await page.getByRole('heading',{name:'この問題で遊ぶ？'}).waitFor();
  const saved=await page.evaluate(()=>{const p=NanpureAppTest.getLibrary()[0];return{mask:p.clueMask,omit:p.omittedDigit,puzzle:p.puzzle,uid:p.uid};});assert.equal(saved.omit,9);assert(!saved.puzzle.includes(9));assert.deepEqual(saved.puzzle.map(Boolean),saved.mask.map(Boolean));
  await page.reload();await page.locator('[data-action="open-notebook"]').waitFor();assert(await page.evaluate(uid=>NanpureAppTest.getLibrary().some(p=>p.uid===uid&&p.omittedDigit===9),saved.uid));assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS pattern browser: desktop/mobile painting, stroke undo, keyboard, stale worker cancellation, draft restoration, unique digit omission, durable save and review.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
