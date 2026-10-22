// Real Chromium mobile check against the prepared Pages artifact and live read-only API.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
// Reviewed expectations are independent of NPI18n.t(): these checks must catch a
// missing DOM update and incorrect singular grammar, even when no kana remains.
const jigsawLocales={
 en:{complexity:['Simple','Slightly complex','Complex','Very complex'],one:'1 puzzle',sheets:['Sheets: 1 (1 for puzzles)','Sheets: 2 (1 for puzzles + 1 for solutions)']},
 'zh-Hans':{complexity:['简单','稍复杂','复杂','很复杂'],one:'1题',sheets:['共1张（题目1张）','共2张（题目1张＋答案1张）']},
 'zh-Hant':{complexity:['簡單','稍複雜','複雜','很複雜'],one:'1題',sheets:['共1張（題目1張）','共2張（題目1張＋答案1張）']},
 ko:{complexity:['단순','조금 복잡','복잡','매우 복잡'],one:'1문제',sheets:['총 1장(문제 1장)','총 2장(문제 1장 + 정답 1장)']},
 es:{complexity:['Simple','Algo complejo','Complejo','Muy complejo'],one:'1 puzle',sheets:['Hojas: 1 (1 para los puzles)','Hojas: 2 (1 para los puzles + 1 para las soluciones)']},
 fr:{complexity:['Simple','Un peu complexe','Complexe','Très complexe'],one:'1 grille',sheets:['Feuilles : 1 (1 pour les grilles)','Feuilles : 2 (1 pour les grilles + 1 pour les solutions)']},
 de:{complexity:['Einfach','Etwas komplex','Komplex','Sehr komplex'],one:'1 Rätsel',sheets:['Blätter: 1 (1 für Rätsel)','Blätter: 2 (1 für Rätsel + 1 für Lösungen)']},
 pt:{complexity:['Simples','Pouco complexo','Complexo','Muito complexo'],one:'1 desafio',sheets:['Folhas: 1 (1 para os desafios)','Folhas: 2 (1 para os desafios + 1 para as soluções)']}
};
async function expectNotebookText(frame,selector,expected,label,{contains=false,attribute=null}={}){
 await frame.locator(selector).waitFor({state:'visible',timeout:15000});
 try{
  // Wait for the application's MutationObserver/rAF translation, without calling
  // NPI18n.apply() from the test or depending on a fixed sleep.
  await frame.waitForFunction(({selector,expected,contains,attribute})=>{
   const node=document.querySelector(selector);if(!node)return false;
   const normalize=value=>String(value??'').replace(/\s+/g,' ').replace(/\s*[：:]\s*/g,': ').trim();
   const actual=normalize(attribute?node.getAttribute(attribute):node.textContent),wanted=normalize(expected);
   return contains?actual.includes(wanted):actual===wanted;
  },{selector,expected,contains,attribute},{timeout:15000});
 }catch(error){
  const actual=attribute?await frame.locator(selector).getAttribute(attribute):await frame.locator(selector).textContent();
  throw new Error(label+'; expected '+JSON.stringify(expected)+', received '+JSON.stringify(actual),{cause:error});
 }
}
async function checkNotebookInterface(frame,lang,label){
 const result=await frame.evaluate(()=>{
  const root=document.getElementById('app'),bad=[],skip='script,style,textarea,[translate="no"],[contenteditable="true"],[data-i18n-skip]';
  const visible=element=>element&&!element.closest(skip)&&element.getClientRects().length>0;
  const kana=/[\u3041-\u3096\u30a1-\u30fa]/,walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while(node=walk.nextNode())if(visible(node.parentElement)&&kana.test(node.nodeValue))bad.push(node.nodeValue.trim());
  for(const element of root.querySelectorAll('[aria-label],[aria-description],[title],[placeholder]'))if(visible(element)){
   for(const attribute of ['aria-label','aria-description','title','placeholder']){const value=element.getAttribute(attribute);if(value&&kana.test(value))bad.push(attribute+': '+value)}
  }
  return {locale:window.NPI18n?.get(),translationError:document.documentElement.getAttribute('data-i18n-error'),overflow:document.documentElement.scrollWidth>innerWidth+1,bad:[...new Set(bad)]};
 });
 assert.equal(result.locale,lang,'Notebook locale: '+label);
 assert.equal(result.translationError,null,'No translation observer errors: '+label);
 assert.deepEqual(result.bad,[],'Japanese notebook UI: '+label);
 assert.equal(result.overflow,false,'Notebook mobile overflow: '+label);
}
async function checkPrintedDigits(frame,values,label){
 const boards=await frame.locator('.print-proof .printed-board').evaluateAll(nodes=>nodes.map(board=>({
  range:board.getAttribute('data-range')?.split(',').map(Number),
  digits:[...board.querySelectorAll('.puzzle-digit[data-cell]')].map(node=>({cell:Number(node.dataset.cell),text:node.textContent.trim()}))
 })));
 assert(boards.length>0,'Printed board exists: '+label);
 const n=Math.sqrt(values.length);
 for(const board of boards){
  const [left,top,right,bottom]=board.range||[0,0,n,n];
  const expected=values.flatMap((value,cell)=>value&&cell%n>=left&&cell%n<right&&Math.floor(cell/n)>=top&&Math.floor(cell/n)<bottom?[{cell,text:String(value)}]:[]);
  assert.deepEqual(board.digits,expected,'Every printed digit remains puzzle data: '+label);
 }
}
async function twoAnimationFrames(target){
 await target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function settleDailyLayout(page){
 // The first frame can still use the old workspace height. Wait for the
 // ResizeObserver and translated controls to stop changing the actual sizes.
 await page.evaluate(()=>{delete window.__npResponsiveDailySample;});
 await page.waitForFunction(()=>{
  const elements=['.board-viewport','.variable-board','.daily-controls','.daily-workspace'].map(selector=>document.querySelector(selector));
  if(elements.some(element=>!element))return false;
  const sizes=elements.map(element=>{const r=element.getBoundingClientRect();return[r.width,r.height];});
  if(sizes.some(([width,height])=>width<=0||height<=0))return false;
  const signature=JSON.stringify(sizes),previous=window.__npResponsiveDailySample,now=performance.now();
  if(!previous||previous.signature!==signature){window.__npResponsiveDailySample={signature,since:now};return false;}
  return now-previous.since>=150;
 },undefined,{polling:'raf',timeout:15000});
}
async function checkResponsiveDailyPlay(browser,root,viewport,n){
 const label=n+'×'+n+' at '+viewport.width+'×'+viewport.height;
 const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],apiWrites=[];
 const block=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>{const row=Math.floor(i/n),col=i%n;return(row*block+Math.floor(row/block)+col)%n+1;});
 // Leave two rows empty: exercising input can never complete this fixture or
 // submit a result. Resume is local to this disposable browser context.
 const puzzle=solution.map((value,i)=>i<n||i>=n*n-n?0:value);
 const summary={day:'2026-10-22',level:1,n,kind:'normal',ruleName:'通常ナンプレ',title:'通常ナンプレ',rules:''};
 const session={...summary,id:'ci-native-daily-'+n,started:1792627200000,serverNow:1792627200000,finished:false,solved:false,elapsed:0,ranked:false,puzzle,solution,regions:Array.from({length:n*n},(_,i)=>Math.floor(Math.floor(i/n)/block)*block+Math.floor((i%n)/block))};
 const saved={session,grid:puzzle.slice(),notes:{},elapsed:0,misses:0,hints:0,runId:session.id};
 await context.addInitScript(saved=>{
  localStorage.setItem('np-practice-resume-v1',JSON.stringify(saved));
  localStorage.setItem('np-daily-settings-v1',JSON.stringify({cellSize:100,digitSize:100,noteSize:100,keypadSize:100,keypadLayout:'auto',remaining:true,autoComplete:false,sound:false,vibration:false}));
 },saved);
 page.on('pageerror',error=>errors.push(error.message));
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
 await page.route('https://atugari.github.io/nanpure/**',route=>{
  const url=new URL(route.request().url()),file=path.join(root,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
  if(!file.startsWith(root)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing asset'});
  return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 // Intercept every API request, including unexpected writes. None can reach
 // the user's live sessions, rankings, contact records or saved progress.
 await context.route('https://puzzle-api.puzzle-hub-4826.workers.dev/**',route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))apiWrites.push(request.method()+' '+url.pathname);
  const data=url.pathname==='/api/daily'?{day:summary.day,serverNow:session.serverNow,challenges:[summary],records:[]}:{items:[],records:[],rows:[],days:[],challenges:[],save:null,signedIn:true,unread:0};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 try{
  await page.goto('https://atugari.github.io/nanpure/?lang=en',{waitUntil:'domcontentloaded'});
  await page.locator('.home-resume').click();
  await page.waitForFunction(n=>document.querySelectorAll('.mode-daily .variable-board .cell').length===n*n,n,{timeout:15000});
  await settleDailyLayout(page);
  const geometry=()=>page.evaluate(()=>{
   const board=document.querySelector('.variable-board'),viewport=document.querySelector('.board-viewport'),cell=board.querySelector('.cell'),value=board.querySelector('.cell-value');
   const r=board.getBoundingClientRect(),v=viewport.getBoundingClientRect();
   return{width:r.width,height:r.height,viewportWidth:viewport.clientWidth,viewportHeight:viewport.clientHeight,outerWidth:v.width,cellWidth:cell.getBoundingClientRect().width,font:parseFloat(getComputedStyle(value||cell).fontSize),fit:viewport.dataset.boardFit,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  const initial=await geometry();
  assert.equal(initial.overflow,false,'Native daily has no page-wide horizontal overflow: '+label);
  assert.equal(await page.locator('.game-layout .board-scale-controls,.game-layout .keypad-position').count(),0,'Secondary controls stay out of the play surface: '+label);
  const keys=await page.locator('.daily-controls .keypad > button').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,text:node.textContent.trim(),small:node.querySelectorAll('small').length})));
  assert.equal(keys.length,n,'All native daily number keys exist: '+label);
  assert.deepEqual(keys.map(key=>key.text),Array.from({length:n},(_,i)=>String(i+1)),'Number keys have one clear numeric label: '+label);
  assert.deepEqual(keys.filter(key=>key.width<43.5||key.height<43.5||Math.abs(key.width-key.height)>1||key.small),[],'Native number keys are square and have no remaining count: '+label);
  if(n<=9){
   assert(initial.width<=initial.viewportWidth+2&&initial.height<=initial.viewportHeight+2,'9×9 still fits on first settled render: '+label+' '+JSON.stringify(initial));
  }else{
   assert(initial.cellWidth>=39&&initial.font>=21,'Large daily starts with readable cells and digits: '+label+' '+JSON.stringify(initial));
   assert(initial.viewportWidth>=Math.min(280,viewport.width-32)-2&&initial.viewportHeight>=Math.min(280,initial.viewportWidth)-2,'Short screens retain a useful board viewport: '+label+' '+JSON.stringify(initial));
   assert.equal(initial.fit,'false','Large daily starts in readable view: '+label);
  }
  const cell=index=>page.locator('.variable-board [data-cell="'+index+'"]');
  const number=value=>page.locator('.daily-controls .keypad > button').nth(value-1);
  // Verify a two-digit input on large boards, and 9 on the unchanged small one.
  await cell(n-1).click();await number(n).click();
  await expectNotebookText(page,'.variable-board [data-cell="'+(n-1)+'"] .cell-value',String(n),'Native daily number input: '+label);
  assert.equal(await cell(n-1).getAttribute('aria-selected'),'true','Input retains selected cell: '+label);
  if(n===16){
   const undo=page.locator('.daily-controls').getByRole('button',{name:'Undo',exact:true});
   await undo.click();
   await page.waitForFunction(index=>!document.querySelector('.variable-board [data-cell="'+index+'"] .cell-value'),n-1);
   const memo=page.locator('.daily-controls').getByRole('button',{name:/^Notes(?:\s|$)/});
   await memo.click();await number(n).click();
   await page.waitForFunction(({index,value})=>{
    const target=document.querySelector('.variable-board [data-cell="'+index+'"]');
    return !target.querySelector('.cell-value')&&[...target.querySelectorAll('.notes > span')].map(node=>node.textContent.trim()).filter(Boolean).join(',')===String(value);
   },{index:n-1,value:n});
   await undo.click();
   await page.waitForFunction(index=>document.querySelector('.variable-board [data-cell="'+index+'"] .notes').textContent.trim()==='',n-1);
   await memo.click();
  }
  if(n>9){
   const displaySetting=async action=>{
    await page.locator('.header .play-settings-button').click();
    await action(page.locator('.game-dialog'));
    await page.locator('.game-dialog .dialog-close').click();
    await settleDailyLayout(page);
   };
   await displaySetting(dialog=>dialog.locator('.board-scale-controls .fit-board').click());
   const fitted=await geometry();
   assert.equal(fitted.fit,'true','Fit is an explicit overview mode: '+label);
   assert(fitted.width<=fitted.viewportWidth+2&&fitted.height<=fitted.viewportHeight+2,'Fit shows both edges of the native daily board: '+label+' '+JSON.stringify(fitted));
   await displaySetting(dialog=>dialog.locator('.board-scale-controls .reset-board').click());
   const reset=await geometry();
   assert.equal(reset.fit,'false','100% returns to readable view: '+label);
   assert(reset.cellWidth>=39&&reset.font>=21,'Reset restores readable native daily cells: '+label);
   await displaySetting(dialog=>dialog.locator('.board-scale-controls').getByRole('button',{name:'Zoom in',exact:true}).click());
   const enlarged=await geometry();assert(enlarged.width>reset.width+1,'Zoom enlarges the native daily board: '+label);
   await page.locator('.board-viewport').evaluate(element=>{element.scrollLeft=element.scrollWidth;element.scrollTop=element.scrollHeight;});await twoAnimationFrames(page);
   const visibleCell=index=>page.evaluate(index=>{
    const viewport=document.querySelector('.board-viewport'),element=document.querySelector('.variable-board [data-cell="'+index+'"]'),v=viewport.getBoundingClientRect(),r=element.getBoundingClientRect();
    return{inside:r.left>=v.left-2&&r.top>=v.top-2&&r.right<=v.left+viewport.clientWidth+2&&r.bottom<=v.top+viewport.clientHeight+2,selected:element.getAttribute('aria-selected'),scrollLeft:viewport.scrollLeft,scrollTop:viewport.scrollTop};
   },index);
   const corner=await visibleCell(n*n-1);assert(corner.inside&&corner.scrollLeft>0&&corner.scrollTop>0,'Bottom-right cell is reachable through board scrolling: '+label+' '+JSON.stringify(corner));
   await cell(n*n-1).click();await number(solution[n*n-1]).click();
   await expectNotebookText(page,'.variable-board [data-cell="'+(n*n-1)+'"] .cell-value',String(solution[n*n-1]),'Input at the far corner: '+label);
   if(n===16){
    // Moving focus must reveal the chosen cell inside the board viewport, even
    // after the user has manually scrolled away from the current selection.
    await cell(n*n-1).click();
    const parentScroll=await page.evaluate(()=>{
     const viewport=document.querySelector('.board-viewport');viewport.scrollLeft=0;viewport.scrollTop=0;
     return{page:document.scrollingElement.scrollTop,game:document.querySelector('.game-layout').scrollTop};
    });
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(index=>document.querySelector('.variable-board [data-cell="'+index+'"]')?.getAttribute('aria-selected')==='true',n*n-2);
    await twoAnimationFrames(page);
    assert((await visibleCell(n*n-2)).inside,'Keyboard selection stays visible inside enlarged board: '+label);
    const afterScroll=await page.evaluate(()=>({page:document.scrollingElement.scrollTop,game:document.querySelector('.game-layout').scrollTop}));
    assert(Math.abs(parentScroll.page-afterScroll.page)<2&&Math.abs(parentScroll.game-afterScroll.game)<2,'Selection scrolls the board without moving the surrounding page: '+label);
   }
  }
  if(n===16&&viewport.width===390){
   const key=number(16);await key.scrollIntoViewIfNeeded();
   const rect=await key.boundingBox();assert(rect,'Held key is visible: '+label);
   await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
   try{
    await expectNotebookText(page,'.native-number-preview','16','Native held-key number: '+label);
    await page.waitForFunction(()=>document.querySelector('[data-native-number="16"]')?.getAttribute('aria-pressed')==='true');
    const popup=await page.locator('.native-number-preview').boundingBox();
    assert(popup&&popup.y+popup.height<=rect.y,'Held number appears above the key: '+label);
   }finally{await page.mouse.up();}
   await page.locator('.native-number-preview').waitFor({state:'detached'});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Native daily interactions keep horizontal overflow inside the board: '+label);
  assert.deepEqual(apiWrites,[],'Native daily fixtures never request an API write: '+label);
  assert.deepEqual(errors,[],'Native daily page errors: '+label);
  console.log('PASS native daily:',label,n>9?'readable cells, number input, explicit Fit, zoom and far corner':'initial Fit and input',n===16?'plus notes, Undo and selection scrolling':'');
 }finally{await context.close();}
}
async function checkResponsiveFreePlay(browser,root,viewport){
 const label=viewport.width+'×'+viewport.height;
 const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 let releaseNotebook,indexRequests=0,notebookRequests=0;
 const notebookGate=new Promise(resolve=>{releaseNotebook=resolve;});
 const isNotebookIndex=url=>/\/notebook\/index\.html$/.test(new URL(url).pathname);
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
 await page.route('https://atugari.github.io/nanpure/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.includes('/notebook/')&&!/\/notebook\/i18n(?:-data)?\.js$|\/notebook\/i18n\//.test(url.pathname))notebookRequests++;
  if(isNotebookIndex(url.href)){indexRequests++;await notebookGate;}
  const file=path.join(root,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
  if(!file.startsWith(root)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing asset'});
  await route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 // These interaction fixtures never write to the live API.
 await page.route('https://puzzle-api.puzzle-hub-4826.workers.dev/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,signedIn:true,unread:0})}));
 try{
  await page.goto('https://atugari.github.io/nanpure/?lang=en',{waitUntil:'domcontentloaded'});
  await page.locator('.main-choice').waitFor();await twoAnimationFrames(page);
  assert.equal(await page.locator('iframe.notebook').count(),0,'Untouched home does not mount notebook: '+label);
  assert.equal(notebookRequests,0,'Untouched home does not download gameplay assets: '+label);
  const request=page.waitForRequest(r=>isNotebookIndex(r.url()),{timeout:20000});
  await page.locator('.main-choice').click();await request;
  await page.locator('.practice-loading').waitFor();await twoAnimationFrames(page);
  assert.equal(indexRequests,1,'One delayed notebook request while entering Free Play: '+label);
  releaseNotebook();
  const element=await page.locator('iframe.notebook').elementHandle(),frame=await element.contentFrame();
  assert(frame,'Free Play iframe: '+label);
  await frame.waitForFunction(()=>!!window.NanpureAppTest&&window.NPI18n?.get()==='en',{},{timeout:20000});
  await frame.locator('[data-action="open-notebook"]').waitFor();
  assert.equal(indexRequests,1,'Delayed notebook boot never duplicates index request: '+label);

  // Valid classic Sudoku solutions with only the first row removed. These give
  // deterministic input and single-position hints without running a generator.
  const fixtures=await frame.evaluate(()=>{
   const fixtures=[9,25].map(n=>{
    const block=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>{const row=Math.floor(i/n),col=i%n;return(row*block+Math.floor(row/block)+col)%n+1;});
    const puzzle=solution.map((value,i)=>i<n?0:value);
    const result={uid:'ci-responsive-classic-'+n,id:'CI'+n,kind:'normal',n,level:1,ratingVersion:2,blockRows:block,blockCols:block,created:1792627200000+n,completed:false,elapsed:0,notes:{},puzzle,solution,grid:puzzle.slice()};
    NanpureAppTest.validate(result);return result;
   });
   const library=NanpureAppTest.getLibrary();library.splice(0,library.length,...fixtures);
   return fixtures.map(p=>({uid:p.uid,n:p.n,nine:p.puzzle.indexOf(9)}));
  });
  async function openPuzzle(fixture,fromGame=false){
   if(fromGame){await page.locator('.back-button').click();await page.locator('.choose-rules').click();}
   await frame.locator('[data-action="open-notebook"]').click();
   await frame.locator('[data-action="start"][data-flow="play"]').click();
   await frame.locator('[data-action="pick-play"][data-id="'+fixture.uid+'"]').click();
   await frame.locator('[data-action="begin-play"][data-id="'+fixture.uid+'"]').click();
   await frame.waitForFunction(n=>document.querySelectorAll('#board .cell').length===n*n,fixture.n,{timeout:15000});
  }
  await openPuzzle(fixtures[0]);
  // Assert immediately after cells appear, before any input can repair sizing.
  const initial=await frame.evaluate(()=>{
   const board=document.getElementById('board'),viewport=document.getElementById('board-scroll');
   return{width:board.getBoundingClientRect().width,height:board.getBoundingClientRect().height,availableWidth:viewport.clientWidth,availableHeight:viewport.clientHeight};
  });
  assert(initial.width<=initial.availableWidth+2&&initial.height<=initial.availableHeight+2,'First9×9 render fits without a correcting input: '+label+' '+JSON.stringify(initial));
  await expectNotebookText(frame,'#app .screen > h1','Classic Sudoku',label+' classic type heading',{contains:true});
  await expectNotebookText(frame,'[data-video="pause"]','Pause',label+' pause action');
  await frame.locator('[data-video="pause"]').click();
  await expectNotebookText(frame,'#video-pause h2','Paused',label+' paused state');
  await frame.locator('[data-video="resume"]').click();

  const nineSelector='#board [data-cell="'+fixtures[0].nine+'"]';
  await expectNotebookText(frame,nineSelector,'9',label+' literal9 before language switch');
  for(const lang of ['ja','en']){
   await page.locator('.menu-button').click();
   await page.locator('.site-menu .language-picker select').selectOption(lang);
   await page.locator('.game-dialog .dialog-close').click();
   await frame.waitForFunction(lang=>window.NPI18n?.get()===lang,lang,{timeout:15000});
   await twoAnimationFrames(frame);
   await expectNotebookText(frame,nineSelector,'9',label+' literal9 in '+lang);
  }
  await frame.locator('[data-video="pause"]').click();
  await expectNotebookText(frame,'#video-pause h2','Paused',label+' new pause dialog after language round trip');
  await frame.locator('[data-video="resume"]').click();
  await twoAnimationFrames(frame);
  await checkNotebookInterface(frame,'en','language round trip '+label);
  assert.equal(await frame.locator('#np-play-settings-button').count(),1,'One play settings entrance: '+label);
  assert.equal(await frame.locator('.play-head #np-play-settings-button').count(),1,'Play settings are in the header: '+label);
  assert.equal(await frame.locator('.play-dock > .tools > button').count(),4,'Four main play actions: '+label);
  assert.equal(await frame.locator('.play-head [data-video="pause"]').count(),1,'Pause stays beside the clock: '+label);
  assert.equal(await frame.locator('.screen > .video-hud,.screen > #video-flash').count(),0,'Secondary scores and completion details stay out of the play surface: '+label);
  assert.equal(await frame.locator('.screen > .np-pan-tools').count(),0,'Zoom controls are absent from the main play area: '+label);
  assert.equal(await frame.locator('.remaining-count,#show-remaining').count(),0,'Remaining-count digits and their removed setting stay absent: '+label);
  assert.equal(await frame.locator('.fit-options,.fit-options-dialog').count(),0,'No duplicate settings entrance: '+label);
  await frame.locator('#np-play-settings-button').click();
  await frame.locator('#np-play-settings[open]').waitFor();
  assert.equal(await frame.locator('#np-play-settings .np-pan-tools').count(),1,'Board sizing remains available in settings: '+label);
  for(const selector of ['#video-score','[data-video="favorite"]','#video-flash'])assert.equal(await frame.locator('#np-play-settings '+selector).count(),1,'Secondary play details remain available '+selector+': '+label);
  for(const selector of ['#display-mode','#memo-prune','[data-action="check"]','[data-action="restart"]','[data-action="play-print"]'])assert.equal(await frame.locator('#np-play-settings '+selector).count(),1,'Setting/action retained '+selector+': '+label);
  assert((await frame.locator('#np-play-settings > details').count())>=4,'Rules and operations retain their sections: '+label);
  const operations=frame.locator('#np-play-settings details').filter({has:frame.locator('[data-action="play-print"]')});
  await operations.locator('summary').first().click();
  assert(await frame.locator('#np-play-settings [data-action="play-print"]').isVisible(),'Print remains reachable in settings: '+label);
  await frame.locator('.np-settings-close').click();

  // Exercise the actual shared text-size preference, including propagation to
  // the notebook, rather than setting a test-only CSS declaration.
  await page.evaluate(()=>window.NPUIText.set('20'));
  await frame.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--ui-min-font').trim()==='20px');
  await twoAnimationFrames(frame);
  const controls=await frame.locator('.play-dock .tools button,.number-pad button').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,font:parseFloat(getComputedStyle(node).fontSize)})));
  assert(controls.length>0,'Play controls exist: '+label);
  assert.deepEqual(controls.filter(c=>c.width<43.5||c.height<43.5||c.font<19.5),[],'Useful tap targets and minimum text size: '+label);
  const keys=await frame.locator('.number-pad button').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
  assert.deepEqual(keys.filter(c=>Math.abs(c.width-c.height)>1),[],'Number keys stay square with larger text: '+label);
  await page.evaluate(()=>window.NPUIText.set('auto'));await twoAnimationFrames(frame);

  await frame.locator('[data-action="open-hints"]').click();
  await frame.locator('#hint-panel:not([hidden]) .vh-stage').waitFor();await twoAnimationFrames(frame);
  const hint=await frame.evaluate(()=>{
   const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
   const panel=rect('#hint-panel'),board=rect('#board-scroll'),keys=rect('.play-dock');
   const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
   return{boardOverlap:overlaps(panel,board),keyOverlap:overlaps(panel,keys),position:getComputedStyle(document.getElementById('hint-panel')).position};
  });
  assert.equal(hint.boardOverlap,false,'Hint does not cover the board: '+label);
  assert.equal(hint.keyOverlap,false,'Hint does not cover input controls: '+label);
  assert.notEqual(hint.position,'fixed','Hint occupies layout space: '+label);
  await frame.locator('[data-vh="close"]').click();

  await openPuzzle(fixtures[1],true);
  await expectNotebookText(frame,'#app .screen > h1','Classic Sudoku',label+' large classic type heading',{contains:true});
  const cells=await frame.evaluateHandle(()=>Array.from(document.querySelectorAll('#board .cell')));
  await frame.locator('#board [data-cell="0"]').click();
  await frame.locator('[data-action="number"][data-number="1"]').click();
  await expectNotebookText(frame,'#board [data-cell="0"]','1',label+' large puzzle input');
  assert.equal(await frame.evaluate(previous=>previous.length===625&&previous.every((cell,i)=>cell===document.querySelectorAll('#board .cell')[i]),cells),true,'All625cell nodes survive input: '+label);
  await cells.dispose();
  if(viewport.width===390){
   const key=frame.locator('[data-action="number"][data-number="25"]');await key.scrollIntoViewIfNeeded();
   const rect=await key.boundingBox();assert(rect,'Held number has visible bounds');
   await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
   try{
    await frame.locator('.np-key-preview').waitFor();
    const preview=await frame.evaluate(()=>{const key=document.querySelector('[data-action="number"][data-number="25"]'),bubble=document.querySelector('.np-key-preview'),a=key.getBoundingClientRect(),b=bubble.getBoundingClientRect();return{text:bubble.textContent,hidden:bubble.getAttribute('aria-hidden'),gap:a.top-b.bottom,width:b.width,height:b.height};});
    assert.equal(preview.text,'25');assert.equal(preview.hidden,'true');assert(preview.width>=64&&preview.height>=51&&preview.gap>=6&&preview.gap<=10,'Held digit extends above its key with a connecting stem: '+JSON.stringify(preview));
    await frame.waitForFunction(()=>document.querySelector('[data-action="number"][data-number="25"]')?.getAttribute('aria-pressed')==='true',{},{timeout:5000});
    assert.equal(await frame.locator('.np-key-preview').textContent(),'25','Preview survives long-press keypad redraw');
   }finally{await page.mouse.up();}
   assert.equal(await frame.locator('.np-key-preview').count(),0,'Preview clears on release');
   await expectNotebookText(frame,'#board [data-cell="0"]','1',label+' holding a key does not write into the selected cell');
  }
  await frame.locator('#np-play-settings-button').click();
  await frame.locator('.np-pan-fit').click();
  await frame.locator('.np-settings-close').click();await twoAnimationFrames(frame);
  const fitted=await frame.evaluate(()=>{
   const board=document.getElementById('board'),viewport=document.getElementById('board-scroll'),r=board.getBoundingClientRect();
   return{width:r.width,height:r.height,availableWidth:viewport.clientWidth,availableHeight:viewport.clientHeight,scale:Number(viewport.dataset.scale),base:board.offsetWidth};
  });
  assert(fitted.base>=875,'Large board retains its readable base size: '+label);
  assert(fitted.scale<1&&fitted.width<=fitted.availableWidth+2&&fitted.height<=fitted.availableHeight+2,'Fit shows the whole25×25board: '+label+' '+JSON.stringify(fitted));
  await frame.locator('#np-play-settings-button').click();await frame.locator('.np-pan-tools button').nth(1).click();await frame.locator('.np-settings-close').click();
  assert.equal(await frame.locator('#board-scroll').getAttribute('data-scale'),'1','100% resets to base size: '+label);
  await checkNotebookInterface(frame,'en','responsive play '+label);
  assert.deepEqual(errors,[],'Responsive page errors: '+label);
  console.log('PASS responsive Free Play:',label,'lazy boot, compact controls, square digits, held-key preview, hints,625stable cells and settings fit');
 }finally{releaseNotebook();await context.close();}
}
async function checkJigsawCreationAndPrint(page,lang,expected){
 await page.goto('https://atugari.github.io/nanpure/?lang='+lang,{waitUntil:'domcontentloaded'});
 await page.locator('.main-choice').click();
 const iframe=await page.locator('iframe.notebook').elementHandle(),frame=await iframe.contentFrame();
 assert(frame,'Notebook iframe is attached: '+lang);
 await frame.waitForFunction(lang=>!!window.NanpureAppTest&&window.NPI18n?.get()===lang,lang,{timeout:20000});
 await frame.locator('[data-action="open-notebook"]').click();
 await frame.locator('[data-action="start"][data-flow="create"]').click();
 await frame.locator('[data-action="web-single"]').click();
 await frame.locator('[data-action="pick-kind"][data-kind="jigsaw"]').click();
 const complexityRow='.review-row:has([data-action="edit-create"][data-step="complexity"]) > b';
 const countRow='.review-row:has([data-action="edit-create"][data-step="4"]) > b';
 for(let complexity=1;complexity<=4;complexity++){
  if(complexity>1)await frame.locator('[data-action="edit-create"][data-step="complexity"]').click();
  const choice='[data-action="pick-complexity"][data-complexity="'+complexity+'"]',numbered=complexity+': '+expected.complexity[complexity-1];
  await expectNotebookText(frame,choice+' strong',expected.complexity[complexity-1],lang+' complexity choice '+complexity);
  await expectNotebookText(frame,choice,numbered,lang+' complexity aria '+complexity,{attribute:'aria-label'});
  await frame.locator(choice).click();
  await frame.locator('[data-action="pick-level"][data-level="1"]').waitFor();
  await expectNotebookText(frame,'#app h1 + p.hint',numbered,lang+' difficulty description '+complexity,{contains:true});
  await checkNotebookInterface(frame,lang,'jigsaw difficulty '+complexity);
  await frame.locator('[data-action="pick-level"][data-level="1"]').click();
  await frame.locator('[data-action="pick-size"][data-size="9"]').click();
  const oneChoice='[data-action="pick-count"][data-count="1"]';
  await expectNotebookText(frame,oneChoice,expected.one,lang+' singular count choice '+complexity);
  await frame.locator(oneChoice).click();
  await frame.locator('[data-action="generate"]').waitFor();
  await expectNotebookText(frame,complexityRow,numbered,lang+' final complexity '+complexity);
  await expectNotebookText(frame,countRow,expected.one,lang+' final singular count '+complexity);
  const config=await frame.evaluate(()=>{const c=NanpureAppTest.getConfig(),r=NanpureAppTest.getRoute();return {flow:r.flow,step:r.step,kind:c.kind,complexity:c.complexity,n:c.n,level:c.level,count:c.count}});
  assert.deepEqual(config,{flow:'create',step:5,kind:'jigsaw',complexity,n:9,level:1,count:1});
  await checkNotebookInterface(frame,lang,'jigsaw confirmation '+complexity);
  console.log('PASS jigsaw creation:',lang,'complexity',complexity,'count 1');
 }
 // Use a shipped, valid preview puzzle as an in-memory fixture. No generation,
 // import, cloud write, native print dialog or persistent fixture file is needed.
 const printFixture=await frame.evaluate(()=>{
  const source=window.SHAPE_PREVIEWS?.jigsaw?.[3];if(!source)throw Error('Missing shipped Jigsaw preview fixture');
  const puzzle=JSON.parse(JSON.stringify(source));
  // Guarantee a real9in the preview, so a numeric translation collision cannot
  // be hidden by a fixture that happens not to contain that digit among givens.
  puzzle.puzzle[puzzle.solution.indexOf(9)]=9;
  Object.assign(puzzle,{uid:'ci-i18n-jigsaw-complexity-4',created:1792627200000,kind:'jigsaw',n:9,level:1,complexity:4,shapeVersion:2,completed:false,elapsed:0,notes:{},grid:puzzle.puzzle.slice()});
  NanpureAppTest.validate(puzzle);
  const library=NanpureAppTest.getLibrary();library.splice(0,library.length,puzzle);return{uid:puzzle.uid,puzzle:puzzle.puzzle.slice(),solution:puzzle.solution.slice()};
 });
 const uid=printFixture.uid;
 // website.css hides the notebook's own header buttons. Use the visible shell
 // control: openPractice('rules') calls NPWebsiteHome() on the existing iframe.
 await page.locator('.choose-rules').click();
 await frame.locator('[data-action="open-notebook"]').click();
 assert.equal(await frame.evaluate(uid=>NanpureAppTest.getLibrary().some(p=>p.uid===uid),uid),true,'Print fixture survives the shell navigation: '+lang);
 await frame.locator('details.web-other > summary').click();
 await frame.locator('[data-action="start"][data-flow="print"]').click();
 await frame.locator('[data-action="toggle-print"][data-id="'+uid+'"]').click();
 await frame.locator('[data-action="print-next"]').click();
 await frame.locator('[data-action="pick-print-mode"][data-mode="multi"]').click();
 await frame.locator('[data-action="pick-paper"][data-paper="A4"]').click();
 await frame.locator('[data-action="pick-layout"][data-cols="1"][data-rows="1"]').click();
 for(const [index,answers] of ['no','yes'].entries()){
  if(index)await frame.locator('[data-action="edit-print"][data-step="5"]').click();
  await frame.locator('[data-action="pick-answers"][data-answers="'+answers+'"]').click();
  await frame.locator('[data-action="do-print"]').waitFor();
  await expectNotebookText(frame,'.review-row:has([data-action="edit-print"][data-step="1"]) > b',expected.one,lang+' print singular puzzle count');
  await expectNotebookText(frame,'.review > .review-row:last-child > b',expected.sheets[index],lang+' print sheet total '+answers);
  assert((await frame.locator('.print-proof svg').count())>0,'SVG print preview exists: '+lang);
  const plan=await frame.evaluate(()=>{const p=NanpureAppTest.getPrintPlan();return {puzzles:p.puzzles.length,total:p.total,answers:p.answerPages}});
  assert.deepEqual(plan,{puzzles:1,total:index+1,answers:index});
  await checkPrintedDigits(frame,printFixture.puzzle,lang+' puzzle preview '+answers);
  if(answers==='yes'){
   await frame.locator('[data-action="preview-next"]').click();
   await frame.locator('.print-proof .puzzle-digit').first().waitFor();await twoAnimationFrames(frame);
   await checkPrintedDigits(frame,printFixture.solution,lang+' solution preview');
   await frame.locator('[data-action="preview-prev"]').click();
   await twoAnimationFrames(frame);
  }
  await checkNotebookInterface(frame,lang,'print confirmation '+answers);
  console.log('PASS translated print confirmation:',lang,'answers',answers);
 }
 // The tiled SVG header uses complexityLabel(), including its numbered prefix.
 // Ordinary multi-puzzle printing deliberately displays only the complexity number.
 await frame.locator('[data-action="edit-print"][data-step="2"]').click();
 await frame.locator('[data-action="pick-print-mode"][data-mode="tile"]').click();
 await frame.locator('[data-action="pick-paper"][data-paper="A4"]').click();
 await frame.locator('[data-action="pick-layout"][data-cols="2"][data-rows="1"]').click();
 await frame.locator('[data-action="pick-answers"][data-answers="no"]').click();
 await frame.locator('[data-action="do-print"]').waitFor();
 await expectNotebookText(frame,'.print-proof','4: '+expected.complexity[3],lang+' tiled SVG complexity label',{contains:true});
 await expectNotebookText(frame,'.review > .review-row:last-child > b',expected.sheets[0].replaceAll('1','2'),lang+' tiled sheet total');
 await checkPrintedDigits(frame,printFixture.puzzle,lang+' tiled preview');
 await checkNotebookInterface(frame,lang,'tiled print confirmation');
 console.log('PASS translated tiled print confirmation:',lang);
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const root=path.resolve(process.argv[2]||'_site');const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
 await page.route('https://atugari.github.io/nanpure/**',async route=>{const u=new URL(route.request().url()),file=path.join(root,u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);if(!file.startsWith(root)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing asset'});await route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)})});
 for(const view of['','daily','ranking','calendar','contact','replies','backup','privacy','manage']){
  const apiPath={daily:'/api/daily',ranking:'/api/ranking',calendar:'/api/daily/archive',contact:'/api/contact',replies:'/api/contact',backup:'/api/cloud'}[view];
  const response=apiPath?page.waitForResponse(r=>{const u=new URL(r.url());return u.hostname==='puzzle-api.puzzle-hub-4826.workers.dev'&&u.pathname===apiPath&&!u.searchParams.has('summary')&&r.request().method()==='GET'},{timeout:20000}):null;
  await page.goto('https://atugari.github.io/nanpure/?lang=ja'+(view?'&view='+view:''),{waitUntil:'domcontentloaded'});
  if(response){const r=await response;assert.equal(r.status(),200,'API status for '+view)}
  await page.locator('#root > *').first().waitFor();
  await page.waitForTimeout(300);
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
 // Translation layout uses deterministic fixtures after the live API gate.
 // No POST requests or ranking submissions are needed for these checks.
 await page.route('https://puzzle-api.puzzle-hub-4826.workers.dev/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,signedIn:true,unread:0})}));
 for(const lang of Object.keys(jigsawLocales))for(const view of ['', 'contact','backup','privacy']){
  await page.goto('https://atugari.github.io/nanpure/?lang='+lang+(view?'&view='+view:''),{waitUntil:'domcontentloaded'});
  await page.locator({'':'.main-choice',contact:'.contact-form',backup:'.cloud-save',privacy:'.legal'}[view]).waitFor();
  await page.waitForTimeout(300);
  const result=await page.evaluate(()=>{
   const bad=[],walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
   while(n=walk.nextNode())if(n.parentElement&&!n.parentElement.closest('script,style,textarea,[translate="no"],noscript')&&/[\u3041-\u3096\u30a1-\u30fa]/.test(n.nodeValue))bad.push(n.nodeValue.trim());
   return {locale:document.documentElement.dataset.locale,overflow:document.documentElement.scrollWidth>innerWidth+1,bad:[...new Set(bad)]};
  });
  assert.equal(result.locale,lang);assert.equal(result.overflow,false,'Mobile overflow: '+lang+' '+view);assert.deepEqual(result.bad,[],'Japanese interface text: '+lang+' '+view);
  console.log('PASS translated mobile view:',lang,view||'home');
 }
 const localizedFlowFailures=[];
 for(const [lang,expected] of Object.entries(jigsawLocales))try{await checkJigsawCreationAndPrint(page,lang,expected)}catch(error){localizedFlowFailures.push({lang,error:error.stack||error.message});console.error('FAIL localized notebook flow:',lang,error.message)}
 assert.deepEqual(localizedFlowFailures,[],'Localized notebook flow failures');
 assert.deepEqual(errors,[]);await context.close();
 for(const viewport of [{width:390,height:844},{width:375,height:667},{width:320,height:568}])await checkResponsiveFreePlay(browser,root,viewport);
 for(const viewport of [{width:390,height:844},{width:375,height:667},{width:320,height:568}])await checkResponsiveDailyPlay(browser,root,viewport,16);
 for(const n of [9,25])await checkResponsiveDailyPlay(browser,root,{width:390,height:844},n);
 console.log('PASS native routes,3responsive Free Play sizes,5native daily cases, live Cloudflare reads,32Jigsaw creation flows,24print confirmations with numeric SVG checks and no private legacy URLs');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
