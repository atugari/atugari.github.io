// Shipped UI plus the real Worker/SQLite; every request stays inside this test.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const repo=path.resolve(__dirname,'..'),root=path.resolve(process.argv[2]||'_site'),origin='https://atugari.github.io';
(async()=>{
 const {default:worker}=await import(pathToFileURL(path.join(repo,'nanpure-api/src/index.js'))),{database}=await import(pathToFileURL(path.join(repo,'nanpure-api/test/db.mjs'))),{emptyRoom}=await import(pathToFileURL(path.join(repo,'nanpure/gallery/model.mjs')));
 const {events}=await import(pathToFileURL(path.join(repo,'nanpure/exhibitions/model.mjs')));events[0].start='2000-01-01T00:00:00+09:00';events[0].end='2100-01-01T00:00:00+09:00';
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp'};
 try{for(const [width,height]of [[1280,900],[360,740]]){
  const DB=database(),key='f'.repeat(64),errors=[],solution=Array.from({length:81},(_,i)=>(Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9+1),puzzle=solution.slice();puzzle[80]=0;
  const record={uid:'exhibit-ci',kind:'normal',n:9,level:1,puzzle,solution,blockRows:3,blockCols:3},room={...emptyRoom(),name:'CIの展示室',slots:[{type:'puzzle',origin:'created',title:'ねこのいる午後',caption:'動作確認用の作品です。',record},...Array(6).fill(null)]};
  async function api(pathname,data,k=key){const r=await worker.fetch(new Request('https://api.test/api/'+pathname,{method:data?'POST':'GET',headers:{Origin:origin,'X-Gallery-Key':k},...(data?{body:JSON.stringify(data)}:{})}),{DB});const d=await r.json();assert(r.ok,JSON.stringify(d));return d;}
  await api('gallery',{action:'save',published:true,expected:0,room});
  await api('gallery',{action:'save',published:true,expected:0,room:{...room,name:'ほかの作者の展示室'}},'a'.repeat(64));
  const other=(await api('exhibitions',{action:'submit',event:'cats-202611',slot:0,expected:0,confirm:true},'a'.repeat(64))).id;
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(key=>{Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'});localStorage.setItem('np-gallery-key-v1',key);localStorage.setItem('nanpure-language-v1','ja');},key);
  await context.route('**/*',async route=>{const request=route.request(),u=new URL(request.url());
   if(u.hostname==='puzzle-api.puzzle-hub-4826.workers.dev'){
    const headers=new Headers(request.headers());headers.set('Origin',origin);const response=await worker.fetch(new Request(request.url(),{method:request.method(),headers,...(request.method()==='POST'?{body:request.postData()}:{})}),{DB});return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
   }
   if(u.origin!==origin)return route.fulfill({status:200,contentType:'application/javascript',body:'/* external requests disabled */'});
   const file=path.join(root,decodeURIComponent(u.pathname).replace(/^\//,'')+(u.pathname.endsWith('/')?'index.html':''));if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});return route.fulfill({status:404,body:'not found'});
  });
  try{
   await page.goto(origin+'/nanpure/');await page.locator('[data-stepped-home]').waitFor();
   assert.equal(await page.locator('.home-event').isVisible(),false,'Secondary home links stay folded until requested');
   await page.locator('.np-home-more summary').click();

   await page.locator('.home-event').click();await page.locator('.exhibition-art.current').waitFor();
   await page.getByRole('link',{name:'この作品を鑑賞する',exact:true}).click();await page.locator('.reaction-buttons button').filter({hasText:'発想が好き'}).click();await page.locator('.reaction-buttons button[aria-pressed=true]').waitFor();assert.equal((await api('exhibitions?entry='+other)).reactions.idea.count,1);
   await page.locator('[data-nav=event]').click();await page.getByRole('button',{name:'作品を出展する',exact:true}).click();await page.locator('#submit-button:enabled').waitFor();await page.locator('#submission-confirm').check();await page.locator('#submit-button').click();await page.locator('.owner-area').waitFor();
   const entry=new URL(page.url()).searchParams.get('entry');assert(entry);assert.equal(DB.raw.prepare('SELECT count(*) n FROM exhibition_entries WHERE active=1').get().n,2);
   await page.getByRole('button',{name:'この問題を遊ぶ',exact:true}).click();const frame=page.frameLocator('#play-frame');await frame.locator('#board').waitFor();await frame.locator('[data-action=cell][data-cell="80"]').click();await frame.locator('[data-action=cell][data-cell="80"]').press('8');await page.locator('#play-status a').waitFor();await page.locator('#close-play').click();
   await page.getByRole('link',{name:'自分のリプレイを添える',exact:true}).click();await page.locator('.replay-library-item').first().click();await page.getByRole('button',{name:'1手進む',exact:true}).click();await page.locator('.replay-editor output').filter({hasText:'1 / 1'}).waitFor();await page.getByLabel('今の手順に添える説明').fill('最後のひとマスに気づいた！');await page.getByRole('button',{name:'今の手順に説明を付ける',exact:true}).click();
   await page.locator('.publish-replay-form input[type=checkbox]').check();await page.getByRole('button',{name:'このリプレイを公開する',exact:true}).click();await page.locator('.replay-reveal').waitFor();const replay=new URL(page.url()).searchParams.get('replay');assert(replay);
   await page.getByRole('button',{name:'解答を含むリプレイを見る',exact:true}).click();await page.getByRole('button',{name:'1手進む',exact:true}).click();await page.locator('.replay-note').filter({hasText:'最後のひとマスに気づいた！'}).waitFor();const stored=await api('exhibitions?replay='+replay);assert.equal(stored.replay.recording.steps.length,1);assert.equal(stored.replay.recording.steps[0].i,80);assert.equal(stored.replay.recording.annotations[0].step,1);
   await page.getByRole('link',{name:'自分の展示室',exact:true}).click();await page.locator('#main[aria-busy=false]').waitFor();await page.getByRole('button',{name:'ねこのいる午後を見る',exact:true}).click();await page.getByRole('button',{name:'公開済みのリプレイを飾る',exact:true}).click();await page.getByRole('button',{name:'9×9を解いた道のり',exact:true}).click();await page.locator('#save').click();await page.getByText('展示室を保存して公開しました。共有ボタンから紹介できます。',{exact:true}).waitFor();await page.reload();await page.locator('a[href="/nanpure/exhibitions/?replay='+replay+'"]').waitFor();await page.getByRole('link',{name:'ねこのナンプレ展 · 出展作品',exact:true}).waitFor();
   const bounds=await page.locator('html').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert(bounds.scroll<=bounds.width+2,JSON.stringify(bounds));assert.deepEqual(errors,[]);console.log('PASS exhibition '+width+'x'+height+': home, reactions, submit, real clear recording, annotation, publication/readback and gallery attachment');
  }finally{await context.close();DB.raw.close();}
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
