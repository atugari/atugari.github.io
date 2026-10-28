// Real browser checks; API requests are mocked so public records never change.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io';
const languages=['en','zh-Hans','zh-Hant','ko','es','fr','de','pt','it','nl','sv','pl','cs','ru','id','vi','th','hi','ar'];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
async function setup(browser,javaScriptEnabled=true){
  const context=await browser.newContext({javaScriptEnabled,viewport:{width:375,height:812},serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin){
      let file=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing asset'});
      return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    }
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],records:[],rows:[],days:[],challenges:[],save:null,unread:0,serverNow:Date.now()})});
    return route.fulfill({status:204,body:''});
  });
  return context;
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const staticContext=await setup(browser,false),page=await staticContext.newPage();
    for(const code of ['ja',...languages]){
      const url=origin+'/nanpure/'+(code==='ja'?'':code.toLowerCase()+'/');
      await page.goto(url);await page.locator('h1').waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'),code);
      assert.equal(await page.locator('.language-directory a').count(),20);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,code+' mobile overflow');
    }
    await page.setViewportSize({width:320,height:812});await page.goto(origin+'/nanpure/ar/');
    assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Arabic 320px overflow');
    await page.screenshot({path:process.env.NP_SEARCH_SCREENSHOT||'/tmp/nanpure-search-arabic.png',fullPage:true});
    await staticContext.close();
    const context=await setup(browser),game=await context.newPage(),errors=[];
    game.on('pageerror',error=>errors.push(error.message));
    await context.addInitScript(()=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('nanpure-language-v1','ja');});
    for(const code of languages){
      await game.goto(origin+'/nanpure/'+code.toLowerCase()+'/');
      await game.locator('.international-actions .primary').first().click();
      await game.waitForFunction(code=>window.NPI18n?.get()===code,code);
      await game.locator('.main-choice').waitFor();
      assert.equal(await game.locator('.language-picker select').inputValue(),code,code+' overrides saved Japanese preference');
      assert.equal(await game.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,code+' playable home fits');
    }
    assert.deepEqual(errors,[],'Game startup errors');
    await game.goto(origin+'/nanpure/?lang=ja');await game.locator('.main-choice').waitFor();
    assert.equal(await game.locator('#search-directory').isVisible(),true);
    await game.locator('.main-choice').click();await game.locator('.site-shell.mode-practice').waitFor();
    assert.equal(await game.locator('#search-directory').isVisible(),false,'Directory must not intrude on gameplay');
    await game.goto(origin+'/nanpure/?lang=en&view=privacy');await game.locator('.legal').waitFor();
    assert.equal(await game.locator('#search-directory').isVisible(),false,'Directory must not appear below the privacy page');
    await context.close();
    console.log('PASS browser search: 20 mobile pages without JS, Arabic RTL at 320px, 19 translated game handoffs and home-only directory');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
