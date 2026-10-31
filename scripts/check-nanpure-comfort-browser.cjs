// Browser journeys for the shared workspace and colors. All requests and saves
// are isolated; no public API or user record is touched.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io',version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const catalog=JSON.parse(fs.readFileSync(path.join(root,'nanpure/collection/catalog.json')));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.mp3':'audio/mpeg','.png':'image/png','.webp':'image/webp'};
function classic(n){const h=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>{const r=Math.floor(i/n),c=i%n;return(r*h+Math.floor(r/h)+c)%n+1;}),puzzle=solution.map((v,i)=>i%(n+1)===0?0:v);return{uid:'comfort-browser-'+n,id:'comfort-browser-'+n,kind:'normal',n,level:1,created:Date.now(),puzzle,solution,grid:puzzle.slice(),notes:{},elapsed:0,completed:false};}
async function setup(browser,viewport){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'}));
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin){const f=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.fulfill({status:404,body:'Missing asset'});return route.fulfill({status:200,contentType:types[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});}if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,unread:0,signedIn:true})});return route.fulfill({status:204,body:''});});
 return{context,page,errors};
}
async function colors(frame){
 await frame.locator('.np-workspace-tools [data-board-comfort]').waitFor();
 const before=await frame.evaluate(()=>JSON.stringify({grid:NanpureAppTest.getCurrent().grid,notes:NanpureAppTest.getCurrent().notes}));
 await frame.locator('.np-workspace-tools [data-board-comfort]').click();const dialog=frame.locator('.np-comfort-dialog');await dialog.waitFor();
 assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Settings fit the viewport');
 await dialog.locator('[data-comfort=template]').selectOption('sage');
 await dialog.locator('[data-comfort=selected]').evaluate(el=>{el.value='#dde6c4';el.dispatchEvent(new Event('change',{bubbles:true}));});
 await dialog.locator('[data-comfort=guide]').evaluate(el=>{el.value='#dbe6ef';el.dispatchEvent(new Event('change',{bubbles:true}));});
 await dialog.locator('[data-comfort=hide]').selectOption('outside');await dialog.locator('[data-comfort-close]').last().click();
 await frame.locator('#board [data-cell="0"]').click();
 await frame.waitForFunction(()=>getComputedStyle(document.querySelector('#board [data-cell="0"]')).backgroundColor==='rgb(221, 230, 196)');
 assert.equal(await frame.locator('#board .guide:not(.selected,.same)').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(219, 230, 239)');
 await frame.locator('[data-zoom=fit]').click();assert.equal(await frame.locator('#board').getAttribute('data-np-highlight-hidden'),'true');
 assert.equal(await frame.locator('#board [data-cell="0"]').getAttribute('aria-pressed'),'true','Only the color disappears');
 assert.equal(await frame.locator('#board [data-cell="0"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 247, 237)','Block color survives hidden highlighting');
 await frame.locator('.np-workspace-tools [data-board-comfort]').click();await dialog.locator('[data-comfort=hide]').selectOption('timer');await dialog.locator('[data-comfort=delay]').selectOption('1000');await dialog.locator('[data-comfort-close]').last().click();await frame.locator('#board [data-cell="0"]').click();
 assert.equal(await frame.locator('#board').getAttribute('data-np-highlight-hidden'),'false');await frame.waitForFunction(()=>document.querySelector('#board').dataset.npHighlightHidden==='true');
 assert.equal(await frame.evaluate(()=>JSON.stringify({grid:NanpureAppTest.getCurrent().grid,notes:NanpureAppTest.getCurrent().notes})),before,'Layout and colors preserve the puzzle');
 const geom=await frame.locator('.np-number-panel').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};});assert(geom.left>=-1&&geom.right<=geom.w+1&&geom.bottom<=geom.h+2,'Real controls remain in the viewport');
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const [viewport,n]of [[{width:1440,height:900},25],[{width:390,height:780},16],[{width:844,height:390},16]]){
  const f=await setup(browser,viewport),cfg=catalog.configs.find(c=>c.kind==='normal'&&c.n===n);await f.page.goto(origin+'/nanpure/collection/?p=P-'+String(cfg.start).padStart(6,'0'));await f.page.waitForFunction(()=>document.querySelector('#game')?.contentWindow?.NPBoardComfort);
  const frame=await(await f.page.locator('#game').elementHandle()).contentFrame();await colors(frame);assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS collection comfort '+viewport.width+'x'+viewport.height+' '+n+'x'+n);
 }
 const f=await setup(browser,{width:1440,height:900});await f.page.goto(origin+'/nanpure/releases/'+version+'/notebook/index.html');await f.page.waitForFunction(()=>window.NanpureAppTest&&window.NPBoardComfort);
 await f.page.evaluate(p=>{NanpureAppTest.validate(p);const lib=NanpureAppTest.getLibrary();lib.splice(0,lib.length,p);},classic(16));
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="comfort-browser-16"]','[data-action="begin-play"][data-id="comfort-browser-16"]'])await f.page.locator(selector).click();
 await colors(f.page);assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS generated puzzle comfort: same controls, region colors, custom colors, timer and unchanged progress');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
