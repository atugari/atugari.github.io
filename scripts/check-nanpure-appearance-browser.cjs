// User journeys for board appearance. All sessions and storage are disposable, and
// every network request is intercepted so tests cannot change public records.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),site='https://atugari.github.io';
const version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const key='np-board-appearance-v1',types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp'};
const tick=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function press(page,value){await page.keyboard.press(value);await tick(page);}
function classic(n){const b=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>(Math.floor(i/n)*b+Math.floor(Math.floor(i/n)/b)+i%n)%n+1),puzzle=solution.map((v,i)=>i<2*n?0:v);return{uid:'ci-keys-'+n,id:'CI-KEYS-'+n,kind:'normal',n,level:1,ratingVersion:2,blockRows:b,blockCols:b,created:1792627200000,completed:false,elapsed:0,notes:{},puzzle,solution,grid:puzzle.slice()};}
async function setup(browser,{daily=false,viewport={width:1280,height:900},locale='ja'}={}){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
 const p=classic(16),summary={day:'2026-10-23',level:1,n:16,kind:'normal',ruleName:'通常ナンプレ',title:'通常ナンプレ',rules:''},session={...summary,id:'ci-keybindings-native',started:1792627200000,serverNow:1792627200000,finished:false,solved:false,elapsed:0,ranked:false,resumed:true,puzzle:p.puzzle,solution:p.solution,regions:Array.from({length:256},(_,i)=>Math.floor(Math.floor(i/16)/4)*4+Math.floor(i%16/4))};
 await context.addInitScript(({daily,session,p})=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('nanpure-auto-next-v1','false');localStorage.setItem('np-daily-settings-v1',JSON.stringify({numberFirst:false,autoNext:false,autoComplete:false,sound:false}));if(daily)localStorage.setItem('np-practice-resume-v1',JSON.stringify({session,grid:p.grid,notes:{},elapsed:0,misses:0,hints:0,runId:session.id}));},{daily,session,p});
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(u.origin===site&&u.pathname.startsWith('/nanpure/')){const f=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:'Missing asset'});return route.fulfill({status:200,contentType:types[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});}if(u.pathname.startsWith('/api/')){if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+u.pathname);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,signedIn:true,unread:0})});}return route.fulfill({status:204,body:''});});
 await page.goto(site+'/nanpure/?lang='+locale);await page.locator('.main-choice').waitFor();return{context,page,errors,writes};
}
async function openNotebook(page,n=9){
 await page.locator('.main-choice').click();await page.waitForFunction(()=>{const f=document.querySelector('iframe.notebook');return f&&getComputedStyle(f).visibility==='visible';});
 const frame=await(await page.locator('iframe.notebook').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.NPKeyBindings&&!!window.NanpureAppTest);
 await frame.evaluate(p=>{NanpureAppTest.validate(p);const lib=NanpureAppTest.getLibrary();lib.splice(0,lib.length,p);},classic(n));
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="ci-keys-'+n+'"]','[data-action="begin-play"][data-id="ci-keys-'+n+'"]'])await frame.locator(selector).click();
 await frame.locator('#np-play-settings-button').click();await frame.locator('[aria-controls="np-settings-page-input"]').click();await frame.locator('#play-input-mode').selectOption('cell');await frame.locator('#play-input-mode:not([disabled])').waitFor();await frame.locator('#np-play-settings').evaluate(d=>d.close());await tick(page);return frame;
}

const cell=(frame,index)=>frame.locator('#board [data-cell="'+index+'"]');
const choice=(target,key)=>target.locator('[data-appearance="'+key+'"]');
async function openView(frame){await frame.locator('#np-play-settings-button').click();await frame.locator('[aria-controls="np-settings-page-view"]').click();await choice(frame,'regionWidth').waitFor();}
async function appearanceJourney(browser){
 const f=await setup(browser,{viewport:{width:390,height:844}}),{page}=f,frame=await openNotebook(page);
 const jigsaw=await frame.evaluate(()=>{const source=SHAPE_PREVIEWS.jigsaw[3],p={...JSON.parse(JSON.stringify(source)),uid:'appearance-jigsaw',id:'APPEARANCE',kind:'jigsaw',n:9,level:1,created:1792627200000,completed:false,elapsed:0,notes:{},grid:source.puzzle.slice()};NanpureAppTest.validate(p);return {...p,regions:NP.regions(p)};});
 await cell(frame,18).click();await openView(frame);
 assert.equal(await choice(frame,'regionWidth').locator('option').count(),5);assert.equal(await choice(frame,'cellWidth').locator('option').count(),3);assert.equal(await choice(frame,'digitWeight').locator('option').count(),5);
 const shape=await frame.locator('#board .grid-regions').getAttribute('d');
 for(const width of [2,3,4,5,6]){await choice(frame,'regionWidth').selectOption(String(width));assert.equal(await frame.locator('#board .grid-regions').evaluate(n=>getComputedStyle(n).strokeWidth),width+'px');assert.equal(await frame.locator('#board .grid-regions').getAttribute('d'),shape);}
 for(const width of [1,2,3]){await choice(frame,'cellWidth').selectOption(String(width));assert.equal(await frame.locator('#board .grid-thin').evaluate(n=>getComputedStyle(n).strokeWidth),width+'px');}
 for(const weight of [400,600,750,900]){await choice(frame,'digitWeight').selectOption(String(weight));assert.equal(await frame.locator('#board .given>span').first().evaluate(n=>getComputedStyle(n).fontWeight),String(weight));}
 const colors=[];
 for(const strength of ['1','2','3']){await choice(frame,'areaStrength').selectOption(strength);colors.push(await frame.locator('#board .guide:not(.same,.selected)').first().evaluate(n=>getComputedStyle(n).backgroundColor));}
 assert.equal(new Set(colors).size,3,'Three distinct related-cell strengths');
 const sameColors=[];
 for(const strength of ['1','2','3']){await choice(frame,'sameStrength').selectOption(strength);sameColors.push(await frame.locator('#board .same:not(.selected)').first().evaluate(n=>getComputedStyle(n).backgroundColor));}
 assert.equal(new Set(sameColors).size,3,'Three distinct matching-digit strengths');
 for(const [key,id,klass]of [['areaStrength','highlight-area','.guide'],['sameStrength','highlight-same','.same']]){
  await choice(frame,key).selectOption('0');await frame.waitForFunction(id=>!document.getElementById(id).disabled,id);assert.equal(await frame.locator('#board '+klass).count(),0,'Off uses existing play logic');assert(await frame.locator('#np-play-settings').isVisible(),'Changing a highlight keeps settings open');await choice(frame,key).selectOption('2');await frame.waitForFunction(id=>!document.getElementById(id).disabled,id);
 }
 await choice(frame,'cellWidth').selectOption('1');await choice(frame,'digitWeight').selectOption('0');assert.equal(await frame.locator('#board .given>span').first().evaluate(n=>getComputedStyle(n).fontWeight),'750','Standard preserves original given-number weight');
 await frame.evaluate(()=>{window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='np-board-appearance-v1')throw Error('full');return __set.call(this,k,v)}});
 await choice(frame,'regionWidth').selectOption('3');await frame.waitForFunction(()=>document.querySelector('[data-appearance=regionWidth]').value==='6');assert.equal(await choice(frame,'regionWidth').inputValue(),'6');assert((await frame.locator('#np-board-appearance-options [role="status"]').innerText()).includes('保存できません'));await frame.evaluate(()=>Storage.prototype.setItem=window.__set);
 await frame.locator('#np-play-settings').evaluate(d=>d.close());await tick(page);
 // The same public shared state reaches a second page and its native jigsaw.
 const native=await f.context.newPage();native.on('pageerror',e=>f.errors.push(e.message));
 const summary={day:'2026-10-23',level:1,n:9,kind:'jigsaw',ruleName:'ジグソー',title:'ジグソー',rules:''},session={...summary,id:'appearance-native',started:1792627200000,serverNow:1792627200000,finished:false,solved:false,elapsed:0,ranked:false,resumed:true,puzzle:jigsaw.puzzle,solution:jigsaw.solution,regions:jigsaw.regions};
 await native.addInitScript(({session,jigsaw})=>localStorage.setItem('np-practice-resume-v1',JSON.stringify({session,grid:jigsaw.grid,notes:{},elapsed:0,misses:0,hints:0,runId:session.id})),{session,jigsaw});
 await native.goto(site+'/nanpure/');await native.locator('.home-resume').click();await native.locator('.variable-board [data-cell="0"]').waitFor();
 assert.equal(await native.locator('.variable-board').evaluate(n=>getComputedStyle(n).borderTopWidth),'6px');
 await native.locator('.variable-board [data-cell="0"]').click();await native.locator('.header .play-settings-button').click();await native.locator('[aria-controls="daily-settings-view"]').click();
 assert.equal(await native.locator('.variable-board .given .cell-value').first().evaluate(n=>getComputedStyle(n).fontWeight),'800','Native standard keeps its original weight');
 for(const weight of ['400','600','750','900']){await choice(native,'digitWeight').selectOption(weight);assert.equal(await native.locator('.variable-board .given .cell-value').first().evaluate(n=>getComputedStyle(n).fontWeight),weight);}
 await choice(native,'digitWeight').selectOption('0');
 const nativeColors=[];
 for(const level of ['1','2','3']){await choice(native,'areaStrength').selectOption(level);nativeColors.push(await native.locator('.variable-board .related:not(.same,.selected)').first().evaluate(n=>getComputedStyle(n).backgroundColor));}
 assert.equal(new Set(nativeColors).size,3,'Native highlight strengths differ');
 const widths=[];for(const width of ['2','3','4','5','6']){await choice(native,'regionWidth').selectOption(width);widths.push(await native.locator('.variable-board').evaluate(board=>getComputedStyle([...board.querySelectorAll('.cell')].find(n=>n.style.borderRightWidth.includes('--np-region-line'))).borderRightWidth));}
 assert.deepEqual(widths,['2px','3px','4px','5px','6px']);
 await choice(native,'regionWidth').selectOption('4');await frame.waitForFunction(()=>getComputedStyle(document.querySelector('#board .grid-regions')).strokeWidth==='4px');
 await choice(native,'areaStrength').selectOption('0');await choice(native,'sameStrength').selectOption('0');
 assert.equal(await native.locator('.variable-board .related,.variable-board .same').count(),0);
 await native.locator('.ps-close').click();await tick(native);await native.screenshot({path:process.env.NP_APPEARANCE_SCREENSHOT||'/tmp/nanpure-appearance-native.png'});
 await native.reload();await native.locator('.main-choice').waitFor();assert.equal(await native.evaluate(()=>JSON.parse(localStorage.getItem('np-board-appearance-v1')).regionWidth),4,'Saved preference survives reload');
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();console.log('PASS appearance: 5 region widths, 3 cell widths, 5 digit weights, 4 highlight options, native jigsaw edges, unchanged grid geometry, save failure, shared frames and persistence');
}
async function localeJourney(browser){
 for(const locale of ['en','zh-Hans','zh-Hant','ko','es','fr','de','pt']){
  const f=await setup(browser,{locale,viewport:{width:375,height:740}}),frame=await openNotebook(f.page);await openView(frame);
  const result=await frame.locator('#np-board-appearance-options').evaluate(root=>({japanese:/[\u3041-\u3096\u30a1-\u30fa]/.test(root.textContent),overflow:root.scrollWidth>root.clientWidth+1}));
  assert.equal(result.japanese,false,locale+' translated');assert.equal(result.overflow,false,locale+' fits mobile');assert.deepEqual(f.errors,[]);await f.context.close();
 }
 console.log('PASS appearance settings: 8 languages at 375 px');
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{await appearanceJourney(browser);await localeJourney(browser);}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
