// Real client + Worker/SQLite. Every request is intercepted; no live records change.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),repo=path.resolve(__dirname,'..'),root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io';
(async()=>{
 const {default:worker}=await import(pathToFileURL(path.join(repo,'nanpure-api/src/index.js'))),{database}=await import(pathToFileURL(path.join(repo,'nanpure-api/test/db.mjs'))),{hash}=await import(pathToFileURL(path.join(repo,'nanpure-api/src/http.js'))),{japanDay}=await import(pathToFileURL(path.join(repo,'nanpure-api/src/shared/daily-plan.js')));
 const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp'},key='a'.repeat(64),me=await hash('x-nanpure-key:'+key);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
 try{for(const [width,height]of [[1280,900],[360,740]]){
  const DB=database(),day=japanDay(),now=Date.now(),oldDay=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10),errors=[];let rejectName=false;
  for(let i=0;i<122;i++){const elapsed=i===121?9999999:10000+i*1000;DB.raw.prepare('INSERT INTO attempts(id,player,day,level,started,elapsed,solved,finished) VALUES(?,?,?,?,?,?,?,?)').run('ranking-ci-'+i,i===121?me:'other-'+i,day+':cloudflare-v1',1,now-elapsed,elapsed,now,i%2?now:null);}
  DB.raw.prepare('INSERT INTO attempts(id,player,day,level,started,elapsed,solved,finished) VALUES(?,?,?,?,?,?,?,?)').run('previous-own',me,oldDay+':cloudflare-v1',1,now-20000,20000,now,now);
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(key=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('np-api-device-v1',key);localStorage.setItem('nanpure-language-v1','ja');},key);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname==='puzzle-api.puzzle-hub-4826.workers.dev'&&['/api/daily','/api/ranking','/api/ranking-profile'].includes(url.pathname)){
    if(url.pathname==='/api/ranking-profile'&&request.method()==='POST'&&rejectName){rejectName=false;return route.fulfill({status:503,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:'{"error":"offline"}'});}
    const headers=new Headers(request.headers());headers.set('Origin',origin);
    const response=await worker.fetch(new Request(request.url(),{method:request.method(),headers,...(request.method()==='POST'?{body:request.postData()}:{})}),{DB});
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
   }
   if(url.origin!==origin)return route.fulfill({status:200,contentType:url.hostname==='pagead2.googlesyndication.com'?'application/javascript':'application/json',body:url.hostname==='pagead2.googlesyndication.com'?'/* disabled */':'{"rows":[],"records":[],"items":[],"days":[],"challenges":[]}'});
   const file=path.join(root,decodeURIComponent(url.pathname).replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':''));
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});return route.fulfill({status:404,body:'not found'});
  });
  try{
   await page.goto(origin+'/nanpure/?view=ranking');await page.locator('.world-rank-list li').nth(49).waitFor();await page.locator('#ranking-nickname:enabled').waitFor();
   assert.equal(await page.locator('.ranking-player-name').first().textContent(),'ナンプレイヤー');
   await page.locator('.ranking-pages').getByRole('button',{name:'次へ',exact:true}).click();await page.locator('.ranking-pages span').filter({hasText:'2 / 3'}).waitFor();
   await page.locator('.ranking-my-page').click();await page.locator('.ranking-pages span').filter({hasText:'3 / 3'}).waitFor();assert.equal(await page.locator('.world-rank-list li').count(),22);assert.equal(await page.locator('.ranking-is-me .ranking-player-name').textContent(),'ナンプレイヤー');
   await page.locator('#ranking-nickname').fill('パレード');await page.locator('.ranking-profile').getByRole('button',{name:'保存する',exact:true}).click();await page.locator('.ranking-is-me .ranking-player-name').filter({hasText:'パレード'}).waitFor();
   assert.equal(DB.raw.prepare('SELECT name FROM ranking_profiles WHERE player=?').get(me).name,'パレード');
   rejectName=true;await page.locator('#ranking-nickname').fill('保存失敗の名前');await page.locator('.ranking-profile').getByRole('button',{name:'保存する',exact:true}).click();await page.locator('.ranking-profile [role=status]').filter({hasText:'通信できませんでした'}).waitFor();assert.equal(await page.locator('.ranking-is-me .ranking-player-name').textContent(),'パレード');
   await page.locator('#ranking-nickname').fill('');await page.locator('.ranking-profile').getByRole('button',{name:'保存する',exact:true}).click();await page.locator('.ranking-is-me .ranking-player-name').filter({hasText:'ナンプレイヤー'}).waitFor();
   await page.locator('.ranking-mode-controls').getByRole('button',{name:'スコア',exact:true}).click();await page.locator('.ranking-periods').getByRole('button',{name:'累計',exact:true}).click();await page.locator('.ranking-my-place').filter({hasText:'2問クリア'}).waitFor();await page.locator('.ranking-is-me .ranking-player-name').waitFor();
   const bounds=await page.locator('.ranking').evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth}));assert(bounds.scroll<=bounds.width+2,JSON.stringify(bounds));
   await page.reload();await page.locator('#ranking-nickname:enabled').waitFor();assert.equal(await page.locator('#ranking-nickname').inputValue(),'');
   assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM attempts WHERE player=?').get(me).n,2);assert.equal(DB.raw.prepare('SELECT elapsed FROM attempts WHERE id=?').get('ranking-ci-121').elapsed,9999999);assert.deepEqual(errors,[]);
   console.log('PASS ranking '+width+'x'+height+': all 122 players, own page, nickname save/failure/reset, historical score and reload');
  }finally{await context.close();DB.raw.close();}
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
