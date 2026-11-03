// Real workers and complete editor regression across desktop, phones and landscape.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io',version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
async function setup(browser,viewport){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>{localStorage.setItem('nanpure-language-v1','ja');Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.fulfill({status:204,body:''});const file=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});});
 return{context,page,errors};
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 for(const viewport of [{width:1910,height:878},{width:1440,height:1000},{width:390,height:844},{width:320,height:740},{width:320,height:636},{width:844,height:390}]){
  console.log('Checking pattern workflow',viewport);
  const {context,page,errors}=await setup(browser,viewport);
  await page.goto(origin+'/nanpure/releases/'+version+'/notebook/index.html');
  const open=async()=>{await page.locator('[data-action="open-notebook"]').click();await page.locator('[data-action="pattern-open"]').click();};await open();
  const editor=page.locator('#np-pattern-page'),dialog=editor.locator('.pattern-tools-dialog:not(.pattern-jobs-dialog)'),grid=editor.locator('.pattern-grid');
  const ready=()=>editor.locator('[data-pattern-indicator][data-state="ready"]').waitFor({state:'attached',timeout:20000});
  const generate=async()=>{await editor.locator('[data-pattern-view="preview"]').click();await ready();};
  const edit=async()=>{if(await editor.getAttribute('data-view')!=='paint')await editor.locator('[data-pattern-view="paint"]').click();};
  const tools=async()=>{await edit();if(await dialog.isHidden())await editor.locator('[data-pattern-quick="draw"]').click();await dialog.locator('[data-pattern-tools-tab="drawing"]').click();};
  const details=async selector=>{await tools();if(['.pattern-digit-options','.pattern-math-guide'].includes(selector))await dialog.locator('[data-pattern-tools-tab="conditions"]').click();const el=dialog.locator(selector);if(!await el.evaluate(e=>e.open))await el.locator('summary').click();};
  const close=async()=>{if(await dialog.isVisible())await dialog.locator('[data-pattern-tools-close]').click();};
  const preset=async name=>{await edit();await editor.locator('[data-pattern-quick="presets"]').click();await editor.locator('[data-pattern-preset="'+name+'"]').click();};
  const workspace=async value=>{await details('.pattern-display-options');await dialog.locator('[data-pattern-workspace-select]').selectOption(value);};
  const noScroll=async()=>{
   assert.deepEqual(await editor.evaluate(el=>[...el.querySelectorAll('*')].filter(e=>e.getClientRects().length&&e.clientHeight>0&&getComputedStyle(e).display!=='contents'&&!e.closest('dialog')&&(e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2)).map(e=>({class:e.className,excess:e.scrollHeight-e.clientHeight,width:e.scrollWidth-e.clientWidth}))),[],'No internal scrolling in the fit workspace');
   assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1));
  };
  const simple=async()=>{const labels=await editor.locator('button:visible,select:visible').evaluateAll(els=>els.filter(e=>!e.closest('.pattern-grid,dialog')).map(e=>e.textContent.trim()));assert(labels.length<=8,'Only current actions are shown: '+labels);assert.equal(labels.length,new Set(labels).size,'No duplicate actions');for(const text of await editor.locator('button:visible').evaluateAll(els=>els.filter(e=>!e.closest('.pattern-grid,dialog')).map(e=>e.textContent.trim())))assert(/[\p{L}]/u.test(text),'Every visible action has words, including on narrow screens: '+text);};
  assert.equal(await editor.getAttribute('data-state'),'editing');assert(await editor.locator('[data-pattern-view="preview"]').isEnabled(),'Step 2 starts work without waiting for a hidden result');
  assert(await editor.locator('[data-pattern-save]').isHidden());assert(await editor.locator('[data-pattern-share]').isHidden());assert.equal(await editor.locator('[data-pattern-difficulty] option').count(),19);
  const fit=await grid.boundingBox();assert(fit.x>=0&&fit.y>=0&&fit.x+fit.width<=viewport.width+1&&fit.y+fit.height<=viewport.height+1);
  const side=viewport.width>=980||(viewport.width>=620&&viewport.height<600);
  assert(fit.width>=Math.min(side?viewport.height-(viewport.width>=980?16:96):viewport.height-398,viewport.width-(side?(viewport.width>=980?364:264):12))-1,'Board uses the available space');
  await noScroll();await simple();
  for(const [action,expected]of [['black',81],['white',0],['invert',26]]){await tools();await dialog.locator('[data-pattern-fill="'+action+'"]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),expected);await editor.locator('[data-pattern-undo]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),55);}
  await editor.locator('[data-pixel="0"]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),56);assert(await editor.locator('[data-pattern-view="preview"]').isEnabled());
  await editor.locator('[data-pattern-undo]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),55);await editor.locator('[data-pattern-redo]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),56);await editor.locator('[data-pattern-undo]').click();
  await editor.locator('[data-pattern-difficulty]').selectOption('1');await generate();await noScroll();await simple();
  assert.equal((await editor.locator('[data-pixel]').allTextContents()).filter(t=>t.trim()).length,55);assert((await editor.locator('[data-pattern-rating]').textContent()).includes('01'));
  assert(await editor.locator('[data-pixel].painted').first().evaluate(el=>{const style=getComputedStyle(el),luma=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),fg=luma(style.color),bg=luma(style.backgroundColor);return(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)>=4.5;}),'Completed clue digits remain readable after black-and-white painting');
  const count=await editor.locator('[data-pixel][aria-pressed="true"]').count();const previewHit=await editor.locator('[data-pixel="0"]').boundingBox();await page.mouse.click(previewHit.x+previewHit.width/2,previewHit.y+previewHit.height/2);assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),count,'Preview cannot paint');assert(await editor.locator('[data-pattern-difficulty-label]').isHidden());
  assert.deepEqual(await grid.boundingBox(),fit,'Status and preview never move the board');await edit();
  // All optional controls are reachable once, without duplicating panels.
  await tools();assert.equal(await page.locator('dialog[open]').count(),1);assert.equal(await editor.locator('[data-pattern-quick="draw"]').count(),1);assert.equal(await dialog.locator('[data-pattern-dialog-title]').textContent(),await editor.locator('[data-pattern-quick="draw"]').textContent(),'Settings title matches its entry button');
  await page.evaluate(()=>appBack());assert(await dialog.isHidden());assert.equal(await editor.count(),1);
  await details('.pattern-math-guide');assert.equal(await dialog.locator('.pattern-math-guide a:visible').count(),2);await close();await noScroll();
  await preset('diamond');await editor.locator('[data-pattern-difficulty]').selectOption('10');await generate();assert((await editor.locator('[data-pattern-rating]').textContent()).includes('10'));await edit();
  await editor.locator('[data-pixel="0"]').click(); // Make the rotation visibly change the otherwise symmetric preset.
  const original=await editor.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true'));
  await tools();await dialog.getByText('模様を回す・反転する',{exact:true}).click();await dialog.locator('[data-pattern-transform="1"]').click();
  const rotated=await editor.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true')),expected=Array(81);original.forEach((v,i)=>expected[i%9*9+8-Math.floor(i/9)]=v);assert.notDeepEqual(rotated,original);assert.deepEqual(rotated,expected);
  await editor.locator('[data-pattern-undo]').click();assert.deepEqual(await editor.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')==='true')),original);
  await details('.pattern-digit-options');await dialog.locator('[data-pattern-omit]').selectOption('9');await close();assert.equal(await editor.getAttribute('data-state'),'impossible');assert.equal(await editor.locator('.needs-work').count(),9);assert(await editor.locator('[data-pattern-view="preview"]').isEnabled());
  await editor.locator('[data-pattern-view="preview"]').click();assert((await editor.locator('[data-pattern-next]').textContent()).includes('白いマス'));assert(await editor.locator('[data-pattern-save]').isHidden());
  await details('.pattern-digit-options');await dialog.locator('[data-pattern-omit]').selectOption('0');await close();
  await editor.locator('[data-pattern-quick="presets"]').click();await dialog.locator('[data-pattern-clear]').click();assert.equal(await editor.getAttribute('data-state'),'impossible');
  await tools();await dialog.locator('[data-pattern-symmetry][value="horizontal"]').check();await close();await editor.locator('[data-pixel="0"]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),2);
  await tools();await dialog.locator('[data-pattern-brush][value="erase"]').check();await close();await editor.locator('[data-pixel="0"]').click();assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),0);
  await tools();await dialog.locator('[data-pattern-symmetry][value="none"]').check();await dialog.locator('[data-pattern-brush][value="auto"]').check();await close();
  await editor.locator('[data-pixel="0"]').focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal(await editor.locator('[data-pixel][aria-pressed="true"]').count(),2);
  await preset('heart');await page.evaluate(()=>NPFurigana.setEnabled(true));
  const before=await grid.boundingBox();const frames=page.evaluate(async()=>{const out=[],g=document.querySelector('.pattern-grid');for(let i=0;i<60;i++){const r=g.getBoundingClientRect();out.push([r.x,r.y,r.width,r.height]);await new Promise(requestAnimationFrame);}return out;});
  const hit=await editor.locator('[data-pixel="0"]').boundingBox();await page.mouse.click(hit.x+hit.width/2,hit.y+hit.height/2);for(const axis of [0,1,2,3]){const values=(await frames).map(r=>r[axis]);assert(Math.max(...values)-Math.min(...values)<1,'No pulse or shifting with furigana');}
  await editor.locator('[data-pattern-undo]').click();assert.deepEqual(await grid.boundingBox(),before);await noScroll();await page.evaluate(()=>NPFurigana.setEnabled(false));
  await workspace('pinned');const pinned=await grid.boundingBox();await page.evaluate(()=>scrollTo(0,500));assert.deepEqual(await grid.boundingBox(),pinned);
  await details('.pattern-display-options');await editor.locator('[data-pattern-size="smaller"]').click();assert((await grid.boundingBox()).width<pinned.width);await editor.locator('[data-pattern-size="reset"]').click();assert.deepEqual(await grid.boundingBox(),pinned);await close();
  await workspace('normal');assert((await grid.boundingBox()).width>=(viewport.width>=980?600:330));await details('.pattern-display-options');const old=(await grid.boundingBox()).width;await editor.locator('[data-pattern-size="larger"]').click();assert((await grid.boundingBox()).width>old);await editor.locator('[data-pattern-size="reset"]').click();await close();
  if(viewport.width<360){assert(await editor.locator('[data-pattern-pan-controls]').isVisible());await editor.locator('[data-pattern-pan="right"]').click();assert(await editor.locator('.pattern-board-scroll').evaluate(e=>e.scrollLeft>0));await editor.locator('[data-pattern-pan="left"]').click();}
  // Real continuous stroke, then one undo restores the complete pattern.
  await editor.locator('[data-pixel="0"]').scrollIntoViewIfNeeded();const a=await editor.locator('[data-pixel="0"]').boundingBox(),b=await editor.locator('[data-pixel="4"]').boundingBox();const oldMask=await editor.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed')));
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();for(let i=0;i<=4;i++)assert.equal(await editor.locator('[data-pixel="'+i+'"]').getAttribute('aria-pressed'),'true');await editor.locator('[data-pattern-undo]').click();assert.deepEqual(await editor.locator('[data-pixel]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-pressed'))),oldMask);
  await workspace('fit');await noScroll();await preset('omit');await details('.pattern-digit-options');await dialog.locator('[data-pattern-omit]').selectOption('9');await dialog.locator('[data-pattern-tools-tab="drawing"]').click();await dialog.locator('[data-pattern-symmetry][value="point"]').check();await close();await editor.locator('[data-pattern-difficulty]').selectOption('1');
  await editor.locator('[data-pattern-close]').click();await page.reload();await open();assert.equal(await editor.locator('[data-pattern-omit]').inputValue(),'9');assert.equal(await editor.locator('[data-pattern-symmetry]:checked').inputValue(),'point');assert.equal(await editor.locator('[data-pattern-difficulty]').inputValue(),'1');
  await generate();await noScroll();await editor.locator('[data-pattern-save]').click();await editor.waitFor({state:'detached'});
  const saved=await page.evaluate(async ()=>{const p=await NPStorage.get(NanpureAppTest.getLibrary()[0].uid);return{mask:p.clueMask,omit:p.omittedDigit,puzzle:p.puzzle,uid:p.uid,level:p.level,requested:p.requestedLevel};});assert.equal(saved.omit,9);assert.equal(saved.level,1);assert.equal(saved.requested,1);assert(!saved.puzzle.includes(9));assert.deepEqual(saved.puzzle.map(Boolean),saved.mask.map(Boolean));
  await page.reload();await page.locator('[data-action="open-notebook"]').waitFor();assert(await page.evaluate(uid=>NanpureAppTest.getLibrary().some(p=>p.uid===uid&&p.omittedDigit===9),saved.uid));assert.deepEqual(errors,[]);await context.close();
  console.log('PASS pattern workflow',viewport,': exact difficulty, unique mask, contextual actions, all tools, keyboard/stroke, fixed geometry, furigana, three layouts, draft and durable save');
 }
 for(const viewport of [{width:1534,height:696},{width:390,height:844}]){
  const {context,page,errors}=await setup(browser,viewport);await page.goto(origin+'/nanpure/');await page.getByRole('button',{name:/自由に遊ぶ/}).click();const frame=page.frameLocator('iframe.notebook');await frame.locator('[data-action="open-notebook"]').click();await frame.locator('[data-action="pattern-open"]').click();
  const bounds=await page.locator('iframe.notebook').boundingBox();assert.equal(bounds.y,0);assert.equal(bounds.height,viewport.height);
  await frame.locator('[data-pattern-view="preview"]').click();await frame.locator('[data-pattern-indicator][data-state="ready"]').waitFor({state:'attached'});await frame.locator('[data-pattern-close]').click();assert(await frame.locator('#np-pattern-page').isVisible(),'First Back returns to painting');await frame.locator('[data-pattern-close]').click();await frame.locator('#np-pattern-page').waitFor({state:'detached'});assert(!await page.locator('body').evaluate(e=>e.classList.contains('np-pattern-host')),'Host restored');assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exit(1)});
