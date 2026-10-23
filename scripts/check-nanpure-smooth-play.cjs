// Playback regression: every rendered frame must keep the board and keypad still.
// Uses disposable local puzzles and intercepts all requests; no user data is changed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),baseline=process.env.NP_BASELINE==='1';
const version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'),'utf8')).version;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const tick=target=>target.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
function classic(n){const b=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>(Math.floor(i/n)*b+Math.floor(Math.floor(i/n)/b)+i%n)%n+1),puzzle=solution.map((v,i)=>i<2*n?0:v);return{uid:'ci-smooth-'+n,id:'CI-SMOOTH-'+n,kind:'normal',n,level:1,ratingVersion:2,blockRows:b,blockCols:b,created:1792627200000,completed:false,elapsed:0,notes:{},puzzle,solution,grid:puzzle.slice()};}
async function setup(browser,n,viewport){
 const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('nanpure-auto-next-v1','false');});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin==='https://atugari.github.io'){
   let file=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));
   if(process.env.NP_USE_OVERRIDES==='1'&&['app.js','compact-play.js'].includes(path.basename(file)))file=path.join(root,'scripts/client-overrides/public/notebook',path.basename(file));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing asset'});
   return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  }
  return route.fulfill({status:204,body:''});
 });
 await page.goto('https://atugari.github.io/nanpure/releases/'+version+'/notebook/index.html?lang=ja');
 await page.waitForFunction(()=>!!window.NanpureAppTest&&!!window.NPI18n);
 await page.evaluate(p=>{if(!NanpureAppTest.validate(p))throw Error('Invalid fixture');const lib=NanpureAppTest.getLibrary();lib.splice(0,lib.length,p);},classic(n));
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="ci-smooth-'+n+'"]','[data-action="begin-play"][data-id="ci-smooth-'+n+'"]'])await page.locator(selector).click();
 await page.locator('#board [data-cell="0"]').waitFor();await tick(page);
 await page.evaluate(()=>{
  window.__smooth={samples:[],counts:{layout:0,pan:0},running:true,cells:[...document.querySelectorAll('#board [data-cell]')]};
  for(const [owner,key,counter] of [[NPCompactPlay,'layout','layout'],[NPBoardInput,'refresh','pan']]){const original=owner[key];owner[key]=function(...args){__smooth.counts[counter]++;return original.apply(this,args);};}
  const sample=()=>{if(!__smooth.running)return;const b=document.getElementById('board-scroll').getBoundingClientRect(),k=document.querySelector('.number-pad').getBoundingClientRect();__smooth.samples.push([b.width,b.height,b.top,k.top]);requestAnimationFrame(sample);};sample();
 });
 return{context,page,errors};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const [n,viewport] of [[9,{width:360,height:720}],[9,{width:390,height:844}],[16,{width:375,height:667}],[25,{width:412,height:820}]]){
   const {context,page,errors}=await setup(browser,n,viewport);
   // Reproduce slow storage: feedback must not resize the board while a save waits.
   await page.evaluate(()=>{const original=NPStorage.save;NPStorage.save=function(...args){const result=original.apply(this,args);return Promise.all([result,new Promise(resolve=>setTimeout(resolve,120))]).then(([value])=>value);};});
   await page.locator('#board [data-cell="0"]').tap();
   for(let i=1;i<=6;i++){await page.locator('[data-action="number"][data-number="'+i+'"]').tap();await page.locator('#board [data-cell="'+i+'"]').tap();await tick(page);}
   await page.locator('[data-action="undo"]').tap();await tick(page);
   await page.locator('[data-action="notes"]').tap();await page.locator('[data-action="number"][data-number="2"]').tap();await tick(page);
   await page.waitForTimeout(250);
   const result=await page.evaluate(()=>{__smooth.running=false;const samples=__smooth.samples,span=column=>Math.max(...samples.map(s=>s[column]))-Math.min(...samples.map(s=>s[column]));return{frames:samples.length,boardWidthChange:span(0),boardHeightChange:span(1),boardTopChange:span(2),keypadTopChange:span(3),positions:[...new Set(samples.map(s=>JSON.stringify(s)))],retained:__smooth.cells.every((cell,i)=>cell===document.querySelectorAll('#board [data-cell]')[i]),counts:__smooth.counts,notes:NanpureAppTest.getCurrent().notes};});
   console.log(JSON.stringify({n,viewport,...result,errors}));
   if(process.env.NP_DEBUG){await page.screenshot({path:process.env.NP_DEBUG+'/smooth-'+n+'-'+viewport.width+'.png'});console.log(await page.evaluate(()=>[...document.querySelector('.screen').children].map(e=>({tag:e.tagName,id:e.id,cls:e.className,top:e.getBoundingClientRect().top,height:e.getBoundingClientRect().height}))))}
   if(!baseline){assert(result.frames>10);for(const name of ['boardWidthChange','boardHeightChange','boardTopChange','keypadTopChange'])assert(result[name]<=1,name+' remains stable '+n+' '+JSON.stringify(result));assert(result.retained,'Live cells survive input');assert.deepEqual(errors,[]);}
   const beforeFailure=await page.locator('#board-scroll').boundingBox();
   await page.evaluate(()=>{const original=NPStorage.save;let fail=true;NPStorage.save=function(...args){if(fail){fail=false;return Promise.reject(new Error('Simulated full storage'));}return original.apply(this,args);};});
   await page.locator('#board [data-cell="0"]').tap();await page.locator('[data-action="number"][data-number="3"]').tap();
   await page.waitForFunction(()=>document.getElementById('play-status')?.textContent.includes('未保存'));
   assert(await page.locator('#play-status').isVisible(),'Save failure remains visible');
   if(!baseline)assert.deepEqual(await page.locator('#board-scroll').boundingBox(),beforeFailure,'Save failure keeps the board still');
   // Recover the failed local edit, then check that an idle board does not redraw.
   await page.locator('[data-action="number"][data-number="4"]').tap();await page.waitForTimeout(160);
   await page.evaluate(()=>{__smooth.counts={layout:0,pan:0};});await page.waitForTimeout(220);
   assert.deepEqual(await page.evaluate(()=>__smooth.counts),{layout:0,pan:0},'No idle redraws');
   // Actual resizing still refits the board, and the new keypad is reachable.
   await page.setViewportSize({width:viewport.width+80,height:viewport.height+100});await tick(page);await tick(page);
   assert(await page.locator('.number-pad').isVisible());
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
