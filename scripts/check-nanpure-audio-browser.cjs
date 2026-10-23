// Real MP3 decoding and playback: no media methods or audio APIs are mocked.
// Network and game data are isolated; these tests never change public records.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),site='https://atugari.github.io';
const version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const key='np-board-appearance-v1',types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg'};
const tick=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function press(page,value){await page.keyboard.press(value);await tick(page);}
function classic(n){const b=Math.sqrt(n),solution=Array.from({length:n*n},(_,i)=>(Math.floor(i/n)*b+Math.floor(Math.floor(i/n)/b)+i%n)%n+1),puzzle=solution.map((v,i)=>i<2*n?0:v);return{uid:'ci-keys-'+n,id:'CI-KEYS-'+n,kind:'normal',n,level:1,ratingVersion:2,blockRows:b,blockCols:b,created:1792627200000,completed:false,elapsed:0,notes:{},puzzle,solution,grid:puzzle.slice()};}
async function setup(browser,{daily=false,viewport={width:1280,height:900},locale='ja',prefs,standalone=false}={}){
 const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[],packs=[];
 const p=classic(16),summary={day:'2026-10-23',level:1,n:16,kind:'normal',ruleName:'通常ナンプレ',title:'通常ナンプレ',rules:''},session={...summary,id:'ci-keybindings-native',started:1792627200000,serverNow:1792627200000,finished:false,solved:false,elapsed:0,ranked:false,resumed:true,puzzle:p.puzzle,solution:p.solution,regions:Array.from({length:256},(_,i)=>Math.floor(Math.floor(i/16)/4)*4+Math.floor(i%16/4))};
 await context.addInitScript(({daily,session,p})=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('nanpure-auto-next-v1','false');localStorage.setItem('np-daily-settings-v1',JSON.stringify({numberFirst:false,autoNext:false,autoComplete:false,sound:false}));if(daily)localStorage.setItem('np-practice-resume-v1',JSON.stringify({session,grid:p.grid,notes:{},elapsed:0,misses:0,hints:0,runId:session.id}));},{daily,session,p});
 await context.addInitScript(prefs=>{
  if(prefs&&!sessionStorage.getItem('audio-ci-seeded')){localStorage.setItem('np-audio-v1',JSON.stringify(prefs));sessionStorage.setItem('audio-ci-seeded','1');}
  window.__media=[];
  const Original=Audio;
  window.Audio=new Proxy(Original,{construct(Target,args){
   const audio=Reflect.construct(Target,args);audio.__played=false;
   audio.addEventListener('playing',()=>{audio.__played=true;});
   window.__media.push(audio);return audio;
  }});
 },prefs);
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(u.origin===site&&u.pathname.startsWith('/nanpure/')){if(/\/i18n\/[^/]+\.json$/.test(u.pathname))packs.push(path.basename(u.pathname,'.json'));const f=path.resolve(root,'.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:'Missing asset'});return route.fulfill({status:200,contentType:types[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});}if(u.pathname.startsWith('/api/')){if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+u.pathname);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,signedIn:true,unread:0})});}return route.fulfill({status:204,body:''});});
 await page.goto(standalone?site+'/nanpure/releases/'+version+'/notebook/shirupure.html?lang=ja':site+'/nanpure/?lang='+locale);await page.locator(standalone?'[data-act=toggle-sound]':'.main-choice').waitFor();page.setDefaultTimeout(10000);return{context,page,errors,writes,packs};
}
async function openNotebook(page,n=9){
 await page.locator('.main-choice').click();await page.waitForFunction(()=>{const f=document.querySelector('iframe.notebook');return f&&getComputedStyle(f).visibility==='visible';});
 const frame=await(await page.locator('iframe.notebook').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.NPKeyBindings&&!!window.NanpureAppTest);
 await frame.evaluate(p=>{NanpureAppTest.validate(p);const lib=NanpureAppTest.getLibrary();lib.splice(0,lib.length,p);},classic(n));
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="ci-keys-'+n+'"]','[data-action="begin-play"][data-id="ci-keys-'+n+'"]'])await frame.locator(selector).click();
 await frame.locator('#np-play-settings-button').click();await frame.locator('[aria-controls="np-settings-page-input"]').click();await frame.locator('#play-input-mode').selectOption('cell');await frame.locator('#play-input-mode:not([disabled])').waitFor();await frame.locator('#np-play-settings').evaluate(d=>d.close());await tick(page);return frame;
}


const enabled={music:true,effects:true,musicVolume:50,effectsVolume:60,track:'cozy-puzzle-1',style:'glass'};
async function playing(target,track='cozy-puzzle-1',volume=.5){
 await target.waitForFunction(({track,volume})=>__media.some(a=>a.src.endsWith('/'+track+'.mp3')&&a.__played&&!a.paused&&a.currentTime>.1&&a.readyState>=3&&a.volume===volume&&!a.error),{track,volume},{timeout:10000});
}
async function stopped(target){await target.waitForFunction(()=>__media.filter(a=>a.loop).every(a=>a.paused));}
async function effect(target,filename,from=0){
 await target.waitForFunction(({filename,from})=>__media.slice(from).some(a=>a.src.endsWith('/'+filename+'.mp3')&&a.__played&&a.currentTime>0&&!a.error),{filename,from},{timeout:10000});
}
async function openShiru(page){
 await page.locator('.shiru-entry').click();
 await page.waitForFunction(()=>document.querySelector('iframe.notebook')?.contentWindow?.ShirupureCourse);
 return (await page.locator('iframe.notebook').elementHandle()).contentFrame();
}
async function finish(f){assert.deepEqual(f.errors,[],'no page errors');assert.deepEqual(f.writes,[],'no public writes');await f.context.close();}
async function standalone(browser){
 const f=await setup(browser,{standalone:true}),{page}=f;
 assert.match(await page.locator('[data-act=toggle-sound]').textContent(),/音なし/,'fresh UI reflects shared mute');
 await page.locator('[data-act=toggle-sound]').click();
 assert.equal(await page.evaluate(()=>NPSiteAudio.get().music&&NPSiteAudio.get().effects),true,'toggle reaches actual engine');
 await page.setViewportSize({width:375,height:812});
 // Standalone settings used to leave the menu unchanged.
 await page.locator('[data-act=menu]').click();await page.locator('[data-act=sound]').click();
 await page.locator('[data-setting=music]').waitFor();assert(await page.locator('[data-setting=music]').isChecked());
 await page.locator('[data-volume=musicVolume]').fill('50');
 await page.locator('[data-act=choose-music]').click();await page.locator('[data-act=pick-music][data-track=bgm-2]').click();
 assert.equal(await page.evaluate(()=>NPSiteAudio.get().track),'cozy-puzzle-2');
 await page.locator('[data-act=close]').first().click();await page.locator('[data-act=learn]').click();
 await playing(page,'cozy-puzzle-2',.5);await page.locator('.lesson-target').click();await effect(page,'click_001');
 await page.locator('[data-act=menu]').click();await page.locator('#dialog [data-act=home]').click();await stopped(page);
 await page.setViewportSize({width:1280,height:900});await page.locator('[data-act=toggle-sound]').click();
 assert.equal(await page.evaluate(()=>NPSiteAudio.get().effects||NPSiteAudio.get().music),false);
 await page.reload();await page.locator('[data-act=toggle-sound]').waitFor();assert.match(await page.locator('[data-act=toggle-sound]').textContent(),/音なし/,'mute survives reload');
 await finish(f);console.log('PASS standalone: shared mute, working settings, track/volume, real BGM and effect, stop on home');
}
async function embedded(browser){
 const f=await setup(browser,{prefs:enabled}),{page}=f,frame=await openShiru(page);
 assert.match(await frame.locator('[data-act=toggle-sound]').textContent(),/音あり/);
 await frame.locator('[data-act=toggle-sound]').click();assert.equal(await page.evaluate(()=>NPSiteAudio.get().effects||NPSiteAudio.get().music),false);
 await frame.locator('[data-act=toggle-sound]').click();assert.equal(await page.evaluate(()=>NPSiteAudio.get().style),'glass','legacy toggle preserves site effect style');
 // Open the real parent settings panel through the game menu, then modify it.
 await frame.locator('[data-act=menu]').click();await frame.locator('[data-act=sound]').click();await page.locator('.audio-settings').waitFor();
 await page.evaluate(()=>NPSiteAudio.set({music:false,effects:false,track:'cozy-puzzle-3',musicVolume:75}));
 assert.match(await frame.locator('[data-act=toggle-sound]').textContent(),/音なし/,'child follows parent event');
 await page.keyboard.press('Escape');await frame.locator('[data-act=close]').last().click();
 await frame.locator('[data-act=toggle-sound]').click();
 assert.equal(await page.evaluate(()=>NPSiteAudio.get().track),'cozy-puzzle-3','toggle cannot restore stale track');
 assert.equal(await page.evaluate(()=>NPSiteAudio.get().musicVolume),75);
 await frame.locator('[data-act=learn]').click();await playing(page,'cozy-puzzle-3',.75);
 await frame.locator('.lesson-target').click();await effect(page,'glass_001');
 await finish(f);console.log('PASS embedded: shared settings and effect style, parent updates, real BGM and effect');
}
async function nativeAndNotebook(browser){
 const f=await setup(browser,{daily:true}),{page}=f;
 await page.locator('.menu-button').click();await page.locator('.menu-entry').filter({hasText:'BGM・効果音'}).click();
 await page.locator('.audio-settings .sound-toggle input').nth(0).check();await page.locator('.audio-settings .sound-toggle input').nth(1).check();await page.locator('.audio-settings select').nth(1).selectOption('glass');await page.locator('.sound-volume input').first().fill('50');
 await page.locator('.sound-preview').click();await playing(page);
 await page.locator('.sound-preview').click();await stopped(page);
 await page.locator('.sound-samples button').first().click();await effect(page,'glass_001');
 await page.keyboard.press('Escape');await page.locator('.home-resume').click();await page.locator('.variable-board').waitFor();await playing(page);
 const beforeNative=await page.evaluate(()=>__media.length);await page.locator('.variable-board [data-cell="0"]').click();await page.locator('[data-native-number="1"]').click();await effect(page,'glass_001',beforeNative);
 await page.goto(site+'/nanpure/');await page.locator('.main-choice').waitFor();const frame=await openNotebook(page);await playing(page);
 const beforeFree=await page.evaluate(()=>__media.length);await frame.locator('#board [data-cell="0"]').click();await frame.locator('[data-action="number"][data-number="1"]').click();await effect(page,'glass_001',beforeFree);
 await finish(f);console.log('PASS native and notebook: previews, real decoding, BGM and input sounds');
}
async function standaloneNotebook(browser){
 const f=await setup(browser,{prefs:enabled}),{page}=f;
 await page.goto(site+'/nanpure/releases/'+version+'/notebook/index.html?lang=ja');await page.waitForFunction(()=>!!window.NanpureAppTest);
 await page.evaluate(p=>{NanpureAppTest.validate(p);NanpureAppTest.getLibrary().splice(0,Infinity,p)},classic(9));
 for(const selector of ['[data-action="open-notebook"]','[data-action="start"][data-flow="play"]','[data-action="pick-play"][data-id="ci-keys-9"]','[data-action="begin-play"][data-id="ci-keys-9"]'])await page.locator(selector).click();
 await playing(page);await finish(f);console.log('PASS standalone notebook: late audio loader and play state start real BGM');
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=user-gesture-required']});try{await standalone(browser);await embedded(browser);await nativeAndNotebook(browser);await standaloneNotebook(browser);}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
