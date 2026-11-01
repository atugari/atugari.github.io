// CI browser regressions: real worker, painting, keyboard, save and mobile layout.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io',version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('nanpure-language-v1','ja');Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.fulfill({status:204,body:''});const file=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});});
  const url=origin+'/nanpure/releases/'+version+'/notebook/index.html';await page.goto(url);await page.locator('[data-action="open-notebook"]').waitFor();await page.locator('[data-action="open-notebook"]').click();
  // Both the free-play home and the create menu have a direct, illustrated entry.
  assert.equal(await page.locator('[data-action="pattern-open"] svg').count(),1);
  await page.locator('[data-action="pattern-open"]').click();await page.locator('#np-pattern-dialog').waitFor();
  await page.locator('[data-pattern-close]').click();await page.locator('[data-flow="create"]').click();await page.locator('[data-action="pattern-open"]').click();
  const dialog=page.locator('#np-pattern-dialog');await dialog.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});
  assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),55);
  assert((await dialog.locator('[data-pixel]').allTextContents()).every(t=>!t.trim()),'Drawing is not obscured by generated digits');
  // Ruby text is cleaned during capture; button clicks must still find their original ancestor.
  await page.evaluate(()=>NPFurigana.setEnabled(true));await dialog.locator('[data-pattern-view="preview"] ruby').first().waitFor();
  await dialog.locator('[data-pattern-view="preview"] ruby').first().click();await page.waitForFunction(()=>document.querySelector('#np-pattern-dialog').dataset.view==='preview');
  assert.equal((await dialog.locator('[data-pixel]').allTextContents()).filter(t=>t.trim()).length,55);
  assert.equal(await dialog.locator('[data-pixel="0"]').getAttribute('aria-disabled'),'true');const previewCell=await dialog.locator('[data-pixel="0"]').boundingBox();await page.mouse.click(previewCell.x+previewCell.width/2,previewCell.y+previewCell.height/2);assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),55,'Preview does not paint');
  await dialog.locator('[data-pattern-view="paint"]').click();await page.waitForFunction(()=>document.querySelector('#np-pattern-dialog').dataset.view==='paint');
  await page.evaluate(()=>NPFurigana.setEnabled(false));
  await dialog.locator('[data-pixel="0"]').click();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),56);
  await dialog.locator('[data-pixel="0"]').click();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),55,'Tap toggles paint and erase');
  await dialog.locator('[data-pattern-undo]').click();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),56);
  await dialog.locator('[data-pattern-redo]').click();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),55);
  const original=await dialog.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true'));
  await dialog.locator('[data-pattern-transform="1"]').click();await dialog.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});
  const rotated=await dialog.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true')),expected=Array(81);original.forEach((v,i)=>expected[i%9*9+8-Math.floor(i/9)]=v);assert.deepEqual(rotated,expected);
  await dialog.locator('[data-pattern-undo]').click();assert.deepEqual(await dialog.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true')),original);
  await dialog.locator('.pattern-digit-options summary').click();await dialog.locator('[data-pattern-omit]').selectOption('9');await dialog.locator('[data-pattern-status][data-state="impossible"]').waitFor();assert.equal(await dialog.locator('.needs-work').count(),9);assert((await dialog.locator('[data-pattern-advice]').textContent()).includes('3行目'));
  await dialog.locator('[data-pattern-omit]').selectOption('0');
  await dialog.locator('[data-pattern-clear]').click();await dialog.locator('[data-pattern-symmetry]').selectOption('horizontal');await dialog.locator('[data-pixel="0"]').click();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),2);assert.equal(await dialog.locator('[data-pixel="8"]').getAttribute('aria-pressed'),'true');
  await dialog.locator('[data-pattern-brush="erase"]').click();await dialog.locator('[data-pixel="0"]').click();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),0);
  await dialog.locator('[data-pattern-symmetry]').selectOption('both');await dialog.locator('[data-pixel="40"]').press('Enter');assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),1);
  await dialog.locator('[data-pattern-symmetry]').selectOption('none');await dialog.locator('[data-pattern-brush="paint"]').click();

  await dialog.locator('[data-pattern-clear]').click();await dialog.locator('[data-pattern-status][data-state="impossible"]').waitFor();assert.equal(await dialog.locator('[data-pattern-save]').isDisabled(),true);
  // Painting invalidates an older worker immediately and keeps exact cell choices.
  await dialog.locator('[data-pattern-preset="diamond"]').click();await dialog.locator('[data-pattern-clear]').click();await page.waitForTimeout(400);assert.equal(await dialog.locator('[data-pattern-status]').getAttribute('data-state'),'impossible');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await dialog.locator('[data-pixel="0"]').scrollIntoViewIfNeeded();const from=await dialog.locator('[data-pixel="0"]').boundingBox(),to=await dialog.locator('[data-pixel="8"]').boundingBox();await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),9);
  await dialog.locator('[data-pattern-undo]').click();assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),0);
  await dialog.locator('[data-pixel="0"]').focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),2);
  await dialog.locator('[data-pattern-preset="omit"]').click();await dialog.locator('[data-pattern-omit]').selectOption('9');await dialog.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});assert.equal(await dialog.locator('[data-pixel][aria-pressed="true"]').count(),72);
  await dialog.locator('[data-pixel="80"]').scrollIntoViewIfNeeded();const boardEnd=await dialog.locator('[data-pixel="80"]').boundingBox(),footer=await dialog.locator('.pattern-footer').boundingBox();assert(boardEnd.y+boardEnd.height<=footer.y+1,'Footer never covers drawing cells');
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow on '+viewport.width);
  await dialog.locator('[data-pattern-symmetry]').selectOption('point');await dialog.locator('[data-pattern-close]').click();await page.reload();await page.locator('[data-action="open-notebook"]').waitFor();await page.locator('[data-action="open-notebook"]').click();await page.locator('[data-flow="create"]').click();await page.locator('[data-action="pattern-open"]').click();await dialog.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});assert.equal(await dialog.locator('[data-pattern-omit]').inputValue(),'9');assert.equal(await dialog.locator('[data-pattern-symmetry]').inputValue(),'point');
  await dialog.locator('[data-pattern-save]').click();await dialog.waitFor({state:'detached'});await page.getByRole('heading',{name:'この問題で遊ぶ？'}).waitFor();
  const saved=await page.evaluate(()=>{const p=NanpureAppTest.getLibrary()[0];return{mask:p.clueMask,omit:p.omittedDigit,puzzle:p.puzzle,uid:p.uid};});assert.equal(saved.omit,9);assert(!saved.puzzle.includes(9));assert.deepEqual(saved.puzzle.map(Boolean),saved.mask.map(Boolean));
  await page.reload();await page.locator('[data-action="open-notebook"]').waitFor();assert(await page.evaluate(uid=>NanpureAppTest.getLibrary().some(p=>p.uid===uid&&p.omittedDigit===9),saved.uid));assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS pattern browser: 320px/mobile/desktop direct entry, furigana clicks, separate preview, toggle and redo; symmetry, rotation, coordinate advice, painting, stroke undo, keyboard, stale worker cancellation, draft restoration, unique digit omission, durable save and review.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
