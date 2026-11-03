// Exercise actual IndexedDB transactions and the shipped UI in isolated Chrome storage.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io';
const fixture=fs.readFileSync(path.join(__dirname,process.env.NP_STORAGE_FIXTURE||'fixtures/nanpure-lazy-storage.html'),'utf8'),scope=fixture.match(/<script id="qa-scope">[\s\S]*?<\/script>/)[0];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await context.newPage();
 await context.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'}));
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.fulfill({status:204,body:''});if(url.pathname==='/storage-qa.html')return route.fulfill({contentType:'text/html',body:fixture});const file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Missing asset'});return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:url.pathname.endsWith('/notebook/index.html')?fs.readFileSync(file,'utf8').replace('<head>','<head>'+scope):fs.readFileSync(file)});});
 await page.goto(origin+'/storage-qa.html');await page.locator('#run').click();await page.waitForFunction(()=>['passed','failed'].includes(window.qa?.status),null,{timeout:180000});
 const result=await page.evaluate(()=>({qa:window.qa,checks:document.querySelector('#results').innerText,metrics:document.querySelector('#metrics')?.innerText}));console.log(result.checks);if(result.metrics)console.log(result.metrics);assert.equal(result.qa.status,'passed',JSON.stringify(result.qa));await context.close();
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
