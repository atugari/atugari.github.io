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
  return {locale:window.NPI18n?.get(),overflow:document.documentElement.scrollWidth>innerWidth+1,bad:[...new Set(bad)]};
 });
 assert.equal(result.locale,lang,'Notebook locale: '+label);
 assert.deepEqual(result.bad,[],'Japanese notebook UI: '+label);
 assert.equal(result.overflow,false,'Notebook mobile overflow: '+label);
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
 const uid=await frame.evaluate(()=>{
  const source=window.SHAPE_PREVIEWS?.jigsaw?.[3];if(!source)throw Error('Missing shipped Jigsaw preview fixture');
  const puzzle=JSON.parse(JSON.stringify(source));
  Object.assign(puzzle,{uid:'ci-i18n-jigsaw-complexity-4',created:1792627200000,kind:'jigsaw',n:9,level:1,complexity:4,shapeVersion:2,completed:false,elapsed:0,notes:{},grid:puzzle.puzzle.slice()});
  const library=NanpureAppTest.getLibrary();library.splice(0,library.length,puzzle);return puzzle.uid;
 });
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
 console.log('PASS native routes, mobile layout, live Cloudflare reads, 32 Jigsaw creation flows, 24 print confirmations and no private legacy URLs');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
