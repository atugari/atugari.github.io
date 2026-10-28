// Check the files a crawler receives before executing any JavaScript.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[2]||'linkedom');
const root=path.resolve(__dirname,'..'),origin='https://atugari.github.io',home=origin+'/nanpure/';
const codes=['ja','en','zh-Hans','zh-Hant','ko','es','fr','de','pt','it','nl','sv','pl','cs','ru','id','vi','th','hi','ar'];
const urls=new Map(codes.map(code=>[code,code==='ja'?home:home+code.toLowerCase()+'/']));
const sitemap=parseHTML(fs.readFileSync(path.join(root,'sitemap.xml'),'utf8')).document;
const listed=[...sitemap.querySelectorAll('url > loc')].map(el=>el.textContent);
assert.equal(listed.length,new Set(listed).size,'Duplicate sitemap entries');
assert(listed.includes(home+'daily-sudoku/'),'Daily guide missing from sitemap');
const titles=new Set();
for(const [code,url] of urls){
  const html=fs.readFileSync(path.join(root,new URL(url).pathname,'index.html'),'utf8');
  const {document}=parseHTML(html);
  assert.equal(document.documentElement.lang,code,url+' language');
  assert.equal(document.querySelectorAll('h1').length,1,url+' heading');
  assert.equal(document.querySelectorAll('link[rel="canonical"]').length,1);
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'),url,url+' self canonical');
  const title=document.querySelector('title').textContent;
  assert(!titles.has(title),'Every language needs its own title');titles.add(title);
  assert(document.querySelector('meta[name="description"]').getAttribute('content').length>40);
  assert(!/noindex/i.test(document.querySelector('meta[name="robots"]').getAttribute('content')));
  assert.equal(document.querySelector('meta[property="og:url"]').getAttribute('content'),url);
  assert(!document.querySelector('meta[http-equiv="refresh"]'),'Language pages must not redirect');
  assert(listed.includes(url),url+' missing from sitemap');
  const alternates=[...document.querySelectorAll('link[rel="alternate"][hreflang]')];
  assert.equal(alternates.length,21,url+' complete language cluster');
  for(const [language,target] of [...urls,['x-default',home+'en/']]){
    const matches=alternates.filter(el=>el.getAttribute('hreflang')===language);
    assert.equal(matches.length,1,url+' one alternate for '+language);
    assert.equal(matches[0].getAttribute('href'),target,url+' reciprocal '+language);
  }
  for(const el of document.querySelectorAll('a[href],link[href]')){
    const target=new URL(el.getAttribute('href'),url);
    if(target.origin!==origin)continue;
    let file=path.join(root,target.pathname);
    if(target.pathname.endsWith('/'))file=path.join(file,'index.html');
    assert(fs.existsSync(file),url+' broken local link '+target.pathname);
  }
  const graphs=[...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(script=>JSON.parse(script.textContent)['@graph']);
  const page=graphs.find(node=>node['@type']==='WebPage');
  assert.equal(page.inLanguage,code);assert.equal(page.url,url);
  assert.deepEqual(graphs.find(node=>node['@type']==='WebApplication').inLanguage,codes);
  assert.equal(document.querySelectorAll('.language-directory a[hreflang]').length,20);
  if(code==='ja'){
    assert(document.querySelector('.search-japanese').textContent.includes('日替わり'));
    assert.equal(document.querySelectorAll('#search-directory').length,1,'Repeated rebuild duplicated home directory');
  }else{
    assert(document.querySelector('article').textContent.length>600,url+' useful translated content without JS');
    assert.equal(document.querySelectorAll('article section').length,5);
    assert.equal(document.querySelector('html').getAttribute('dir'),code==='ar'?'rtl':'ltr');
    for(const link of document.querySelectorAll('.international-actions a,.international-header a,.guide-footer a')){
      const target=new URL(link.getAttribute('href'),url);
      assert.equal(target.pathname,'/nanpure/');
      assert.equal(target.searchParams.get('lang'),code,url+' game language retained');
    }
    assert.equal(document.querySelectorAll('script:not([type="application/ld+json"])').length,0,'Static language pages must remain readable without runtime scripts');
  }
}
const {document:daily}=parseHTML(fs.readFileSync(path.join(root,'nanpure/daily-sudoku/index.html'),'utf8'));
assert(daily.querySelector('article').textContent.includes('午前0時'));
assert(daily.querySelector('a[href="/nanpure/?view=daily"]'));
console.log('PASS search: 20 static languages, self canonicals, reciprocal hreflang, sitemap, local links, RTL, Japanese daily guide and game language handoff');
