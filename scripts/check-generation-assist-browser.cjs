// A real browser Worker and the shipped generator; all API responses are isolated.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const notebook=path.join(root,'nanpure/releases',version,'notebook'),html=fs.readFileSync(path.join(notebook,'index.html'),'utf8'),sources=new Map();
for(const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){const id=tag[1].match(/\bid=["']([^"']+)["']/);if(id)sources.set(id[1],tag[2]);}
const ids=['core-normal','core-unique-solver','core-big','core-killer','core-rect','core-giant','core-hundred','core-expert','core-master-logic','core-master','core-cover-logic','core-cover','core-resolution-logic','core-resolution','core-deduction','core-neighbor','core-step','core-cross','core-linked','core-variants','core-expansion','core-multi','common-source','generator-source','core-mixed-multi'];
for(const id of ids)assert(sources.has(id),'Missing generator source: '+id);
const engine='var global=self;if(!self.globalThis)self.globalThis=self;\n'+ids.map(id=>sources.get(id)).join('\n');
const fixture=fs.readFileSync('scripts/fixtures/generation-assist-retry.html','utf8').replaceAll('__RELEASE__',version);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/generation-engine.js')return route.fulfill({contentType:'text/javascript',body:engine});
   if(pathname==='/generation-assist.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(notebook,'generation-assist.js'))});
   if(pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
   return route.fulfill({status:204,body:''});
  });
  await page.goto('https://atugari.github.io/');await page.getByRole('button',{name:'再接続を検証する'}).click();
  await page.waitForFunction(()=>/すべて成功|FAIL/.test(document.querySelector('#result').textContent),null,{timeout:40000});
  const result=await page.locator('#result').innerText();assert(!result.includes('FAIL'),result);assert(result.includes('すべて成功'),result);assert.deepEqual(errors,[]);
  console.log(result);await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
