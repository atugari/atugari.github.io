// CI browser regressions: real worker, painting, keyboard, save and mobile layout.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io',version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 for(const viewport of [{width:1910,height:878},{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]){
  console.log('Checking pattern page viewport',viewport.width,viewport.height);
  const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('nanpure-language-v1','ja');Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.fulfill({status:204,body:''});const file=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});});
  const url=origin+'/nanpure/releases/'+version+'/notebook/index.html';await page.goto(url);await page.locator('[data-action="open-notebook"]').waitFor();await page.locator('[data-action="open-notebook"]').click();
  // Both the free-play home and the create menu have a direct, illustrated entry.
  assert.equal(await page.locator('[data-action="pattern-open"] svg').count(),1);
  await page.locator('[data-action="pattern-open"]').click();await page.locator('#np-pattern-page').waitFor();
  await page.locator('[data-pattern-close]').click();await page.locator('[data-flow="create"]').click();await page.locator('[data-action="pattern-open"]').click();
  const editor=page.locator('#np-pattern-page');await editor.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});
  assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),55);
  assert.equal(await page.evaluate(()=>NanpureAppTest.getRoute().flow),'pattern','Editor is a navigable page');
  assert.equal(await page.locator('dialog[open]').count(),0,'No floating window');
  const boardSize=await editor.locator('.pattern-grid').boundingBox();assert(boardSize.width>=(viewport.width>=980?600:330),'Board has a readable minimum size');
  assert(await editor.evaluate(el=>[...el.querySelectorAll('button,p,label,summary,small,output')].filter(n=>n.getClientRects().length&&!n.closest('.pattern-grid')).every(n=>parseFloat(getComputedStyle(n).fontSize)>=16)),'Text is at least 16px');
  // Check the whole geometry while a pointer is held and while the worker status changes.
  await editor.locator('[data-pixel="0"]').scrollIntoViewIfNeeded();
  const stability=page.evaluate(async()=>{const out=[],g=document.querySelector('.pattern-grid');for(let i=0;i<80;i++){const r=g.getBoundingClientRect();out.push([r.x,r.y,r.width,r.height]);await new Promise(requestAnimationFrame);}return out;});
  const hit=await editor.locator('[data-pixel="0"]').boundingBox();await page.mouse.move(hit.x+hit.width/2,hit.y+hit.height/2);await page.mouse.down();await page.waitForTimeout(120);await page.mouse.up();
  const geometry=await stability;for(let k=0;k<4;k++)assert(Math.max(...geometry.map(r=>r[k]))-Math.min(...geometry.map(r=>r[k]))<1,'No click/status pulse or movement');
  await editor.locator('[data-pattern-undo]').click();await editor.locator('[data-pattern-status][data-state="ready"]').waitFor();
  const oldSize=(await editor.locator('.pattern-grid').boundingBox()).width;await editor.locator('[data-pattern-size="larger"]').click();assert((await editor.locator('.pattern-grid').boundingBox()).width>oldSize,'Explicit size control enlarges the board');await editor.locator('[data-pattern-size="reset"]').click();assert.equal((await editor.locator('.pattern-grid').boundingBox()).width,oldSize);

  assert((await editor.locator('[data-pixel]').allTextContents()).every(t=>!t.trim()),'Drawing is not obscured by generated digits');
  // Ruby text is cleaned during capture; button clicks must still find their original ancestor.
  await page.evaluate(()=>NPFurigana.setEnabled(true));await editor.locator('[data-pattern-view="preview"] ruby').first().waitFor();
  await editor.locator('[data-pattern-view="preview"] ruby').first().click();await page.waitForFunction(()=>document.querySelector('#np-pattern-page').dataset.view==='preview');
  assert.equal((await editor.locator('[data-pixel]').allTextContents()).filter(t=>t.trim()).length,55);
  assert.equal(await editor.locator('[data-pixel="0"]').getAttribute('aria-disabled'),'true');const previewCell=await editor.locator('[data-pixel="0"]').boundingBox();await page.mouse.click(previewCell.x+previewCell.width/2,previewCell.y+previewCell.height/2);assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),55,'Preview does not paint');
  await editor.locator('[data-pattern-view="paint"]').click();await page.waitForFunction(()=>document.querySelector('#np-pattern-page').dataset.view==='paint');
  await editor.locator('[data-pixel="0"]').scrollIntoViewIfNeeded();
  const rubyGeometry=page.evaluate(async()=>{const out=[],g=document.querySelector('.pattern-grid');for(let i=0;i<60;i++){const r=g.getBoundingClientRect();out.push([r.x,r.y,r.width,r.height]);await new Promise(requestAnimationFrame);}return out;});
  const rubyHit=await editor.locator('[data-pixel="0"]').boundingBox();await page.mouse.click(rubyHit.x+rubyHit.width/2,rubyHit.y+rubyHit.height/2);
  const rubyBounds=await rubyGeometry;for(let k=0;k<4;k++)assert(Math.max(...rubyBounds.map(r=>r[k]))-Math.min(...rubyBounds.map(r=>r[k]))<1,'No pulse with furigana enabled');
  await editor.locator('[data-pattern-undo]').click();
  await page.evaluate(()=>NPFurigana.setEnabled(false));
  await editor.locator('[data-pixel="0"]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),56);
  await editor.locator('[data-pixel="0"]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),55,'Tap toggles paint and erase');
  await editor.locator('[data-pattern-undo]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),56);
  await editor.locator('[data-pattern-redo]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),55);
  if(viewport.width>=1500){const a=await editor.locator('.pattern-grid').boundingBox();await editor.locator('[data-pattern-preset="diamond"]').click();await editor.locator('[data-pattern-status][data-state="ready"]').waitFor();const b=await editor.locator('.pattern-grid').boundingBox();for(const k of ['x','y','width','height'])assert(Math.abs(a[k]-b[k])<1,'A visible template selection does not move or resize the board');await editor.locator('[data-pattern-preset="heart"]').click();await editor.locator('[data-pattern-status][data-state="ready"]').waitFor();}
  const original=await editor.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true'));
  await editor.locator('[data-pattern-transform="1"]').click();await editor.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});
  const rotated=await editor.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true')),expected=Array(81);original.forEach((v,i)=>expected[i%9*9+8-Math.floor(i/9)]=v);assert.deepEqual(rotated,expected);
  await editor.locator('[data-pattern-undo]').click();assert.deepEqual(await editor.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true')),original);
  await editor.locator('.pattern-digit-options summary').click();await editor.locator('[data-pattern-omit]').selectOption('9');await editor.locator('[data-pattern-status][data-state="impossible"]').waitFor();assert.equal(await editor.locator('.needs-work').count(),9);assert((await editor.locator('[data-pattern-advice]').textContent()).includes('3行目'));
  await editor.locator('[data-pattern-omit]').selectOption('0');
  await editor.locator('[data-pattern-clear]').click();await editor.locator('[data-pattern-symmetry]').selectOption('horizontal');await editor.locator('[data-pixel="0"]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),2);assert.equal(await editor.locator('[data-pixel="8"]').getAttribute('aria-pressed'),'true');
  await editor.locator('[data-pattern-brush="erase"]').click();await editor.locator('[data-pixel="0"]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),0);
  await editor.locator('[data-pattern-symmetry]').selectOption('both');await editor.locator('[data-pixel="40"]').press('Enter');assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),1);
  await editor.locator('[data-pattern-symmetry]').selectOption('none');await editor.locator('[data-pattern-brush="paint"]').click();

  await editor.locator('[data-pattern-clear]').click();await editor.locator('[data-pattern-status][data-state="impossible"]').waitFor();assert.equal(await editor.locator('[data-pattern-save]').isDisabled(),true);
  // Painting invalidates an older worker immediately and keeps exact cell choices.
  await editor.locator('[data-pattern-preset="diamond"]').click();await editor.locator('[data-pattern-clear]').click();await page.waitForTimeout(400);assert.equal(await editor.locator('[data-pattern-status]').getAttribute('data-state'),'impossible');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await editor.locator('[data-pixel="0"]').scrollIntoViewIfNeeded();const from=await editor.locator('[data-pixel="0"]').boundingBox(),edge=await editor.locator('.pattern-board-scroll').boundingBox();let last=8,to;while(last>=0){to=await editor.locator('[data-pixel="'+last+'"]').boundingBox();if(to.x+to.width/2<edge.x+edge.width-2)break;last--;}assert(last>=5,'At least six columns are visible at the minimum size');await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),last+1,'One stroke paints every visible column');
  await editor.locator('[data-pattern-undo]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),0);
  if(viewport.width<360){assert(await editor.locator('[data-pattern-pan-controls]').isVisible());await editor.locator('[data-pattern-pan="right"]').click();assert(await editor.locator('.pattern-board-scroll').evaluate(el=>el.scrollLeft>0));await editor.locator('[data-pixel="8"]').click();assert.equal(await editor.locator('[data-pixel="8"]').getAttribute('aria-pressed'),'true');await editor.locator('[data-pattern-undo]').click();await editor.locator('[data-pattern-pan="left"]').click();assert.equal(await editor.locator('.pattern-board-scroll').evaluate(el=>el.scrollLeft),0);}
  await editor.locator('[data-pixel="0"]').focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),2);
  await editor.locator('[data-pattern-preset="omit"]').click();await editor.locator('[data-pattern-omit]').selectOption('9');await editor.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),72);
  await editor.locator('[data-pixel="80"]').scrollIntoViewIfNeeded();const boardEnd=await editor.locator('[data-pixel="80"]').boundingBox(),footer=await editor.locator('.pattern-footer').boundingBox();assert(!(Math.min(boardEnd.x+boardEnd.width,footer.x+footer.width)>Math.max(boardEnd.x,footer.x)+1&&Math.min(boardEnd.y+boardEnd.height,footer.y+footer.height)>Math.max(boardEnd.y,footer.y)+1),'Checking panel never covers drawing cells');
  assert(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow on '+viewport.width);
  await editor.locator('[data-pattern-symmetry]').selectOption('point');await editor.locator('[data-pattern-close]').click();await page.reload();await page.locator('[data-action="open-notebook"]').waitFor();await page.locator('[data-action="open-notebook"]').click();await page.locator('[data-flow="create"]').click();await page.locator('[data-action="pattern-open"]').click();await editor.locator('[data-pattern-status][data-state="ready"]').waitFor({timeout:15000});assert.equal(await editor.locator('[data-pattern-omit]').inputValue(),'9');assert.equal(await editor.locator('[data-pattern-symmetry]').inputValue(),'point');
  await editor.locator('[data-pattern-save]').click();await editor.waitFor({state:'detached'});await page.getByRole('heading',{name:'この問題で遊ぶ？'}).waitFor();
  const saved=await page.evaluate(()=>{const p=NanpureAppTest.getLibrary()[0];return{mask:p.clueMask,omit:p.omittedDigit,puzzle:p.puzzle,uid:p.uid};});assert.equal(saved.omit,9);assert(!saved.puzzle.includes(9));assert.deepEqual(saved.puzzle.map(Boolean),saved.mask.map(Boolean));
  await page.reload();await page.locator('[data-action="open-notebook"]').waitFor();assert(await page.evaluate(uid=>NanpureAppTest.getLibrary().some(p=>p.uid===uid&&p.omittedDigit===9),saved.uid));assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS pattern browser: large-page 1910px/desktop/390px/320px navigation, minimum text/board sizes, stable geometry and deliberate resizing; direct entry, furigana clicks, separate preview, toggle and redo; symmetry, rotation, coordinate advice, painting, stroke undo, keyboard, stale worker cancellation, draft restoration, unique digit omission, durable save and review.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
