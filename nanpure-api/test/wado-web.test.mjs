import test from'node:test';import assert from'node:assert/strict';import worker from'../src/index.js';import{database}from'./db.mjs';
import{problem,discoveryQueries,searchLinks,discover,evidence,inspectNetwork,words,safeResult}from'../src/shared/wado-web.js';
const p={arms:{top:'感',right:'配'},answer:'心'},r=(content,url='https://example.test/page')=>({title:'用例のページ',url,content});
test('network discovery uses web text rather than dictionary candidates',async()=>{
 const calls=[];const report=await inspectNetwork(p,async q=>{calls.push(q);return q==='"受配" 意味 用例'?[r('受配する。配給を受ける。')]:[r('感受する。感心する。心配する。')];});
 assert.equal(report.status,'candidates-found');assert.equal(report.exhaustive,false);assert.deepEqual(report.candidates.map(c=>c.answer),['受']);assert.equal(report.candidates[0].allWordsFound,true);assert.deepEqual(report.candidates[0].words.map(w=>w.text),['感受','受配']);assert(calls.includes('"受配" 意味 用例'));assert(report.queries.every(q=>q.ok));assert(!JSON.stringify(report).includes('content'));
});
test('no hits, provider errors and partially observed candidates never prove uniqueness',async()=>{
 let report=await inspectNetwork(p,async()=>[]);assert.equal(report.status,'no-candidates-found');assert.equal(report.exhaustive,false);assert.equal(report.candidates.length,0);
 report=await inspectNetwork(p,async()=>{throw Error('fake-secret-token');});assert.equal(report.status,'incomplete');assert.equal(report.failedQueries,3);assert(!JSON.stringify(report).includes('fake-secret-token'));
 report=await inspectNetwork(p,async()=>[r('感受する。')]);assert.equal(report.candidates[0].allWordsFound,false);assert.equal(report.candidates[0].words[1].sources.length,0);assert.equal(report.exhaustive,false);
});
test('URLs, markup, substrings and user input do not become false web evidence',()=>{
 assert.equal(safeResult(r('感受','javascript:alert(1)')),null);assert.equal(safeResult(r('感受','http://example.test/')),null);
 assert.deepEqual(discover(p,[r('感受性。https://example.test/感温 <tag value="感熱">')]),[]);
 assert.equal(evidence('感受',[r('感受性')]).length,0);assert.equal(evidence('感受',[r('感受する')]).length,1);
 for(const value of [{arms:{top:'感'}},{arms:{top:'感',right:'<script>'}},{...p,query:'extra'},{...p,answer:'AB'},{arms:{side:'感',right:'配'}}])assert.throws(()=>problem(value));
 const links=searchLinks(p,'受');assert(links.every(l=>new URL(l.url).origin==='https://www.google.com'));assert.equal(new URL(links[1].url).searchParams.get('q'),'"感受" "受配"');assert.deepEqual(words({arms:{left:'感',bottom:'配'}},'受').map(w=>w.text),['感受','受配']);assert.equal(discoveryQueries(p).length,3);
});
test('discovery ranks cross-arm evidence and caps candidates visibly',async()=>{
 const report=await inspectNetwork(p,async()=>[r('感受 感温 感熱 感光 受配 温配 熱配 光配')]);assert.equal(report.truncated,true);assert.equal(report.discoveredCandidates,4);assert.equal(report.candidates.length,3);assert.equal(report.exhaustive,false);
});
function setup(extra={}){const DB=database(),env={DB,WADO_WEB_ENABLED:'true',TAVILY_API_KEY:'fake-search-key',...extra};const request=(data,origin='https://atugari.github.io')=>new Request('https://worker.test/api/wado/web-search',{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});return{DB,env,request};}
test('status and disabled API make no provider requests and never disclose a key',async()=>{
 const{DB,env,request}=setup({WADO_WEB_ENABLED:'false'}),old=globalThis.fetch;let n=0;globalThis.fetch=async()=>{n++;throw Error();};
 try{let response=await worker.fetch(request(),env);assert.deepEqual(await response.json(),{enabled:false,provider:'Tavily'});response=await worker.fetch(request(p),env);assert.equal(response.status,503);assert.equal(n,0);}finally{globalThis.fetch=old;DB.raw.close();}
});
test('API sends bounded Japanese search requests and returns only attributed evidence',async()=>{
 const{DB,env,request}=setup(),old=globalThis.fetch;let n=0;
 globalThis.fetch=async(url,options)=>{n++;assert.equal(url,'https://api.tavily.com/search');assert.equal(options.headers.Authorization,'Bearer fake-search-key');const body=JSON.parse(options.body);assert.equal(body.language,'ja');assert.equal(body.filter_by_language,true);assert.equal(body.search_depth,'basic');assert.equal(body.auto_parameters,false);assert.equal(body.include_raw_content,false);assert.equal(body.include_answer,false);return Response.json({results:[r('感受 受配')]});};
 try{const response=await worker.fetch(request(p),env),data=await response.json();assert.equal(response.status,200);assert.equal(data.status,'candidates-found');assert.equal(data.candidates[0].answer,'受');assert.equal(n,3);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),'https://atugari.github.io');assert(!JSON.stringify(data).includes('fake-search-key'));assert.equal(DB.raw.prepare('SELECT count FROM rate_limits WHERE key LIKE ?').get('wado-web-budget:%').count,9);}finally{globalThis.fetch=old;DB.raw.close();}
});
test('untrusted origins, invalid inputs and exhausted global budget never call provider',async()=>{
 const{DB,env,request}=setup({WADO_WEB_DAILY_QUERIES:'8'}),old=globalThis.fetch;let n=0;globalThis.fetch=async()=>{n++;throw Error();};
 try{assert.equal((await worker.fetch(request(p,'https://other.test'),env)).status,403);assert.equal((await worker.fetch(request({arms:{top:'感'}}),env)).status,400);assert.equal((await worker.fetch(request(p),env)).status,429);assert.equal(n,0);}finally{globalThis.fetch=old;DB.raw.close();}
});
test('malformed or failed provider response is incomplete, not a zero-result success',async()=>{
 const{DB,env,request}=setup(),old=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({error:'fake-search-key'});
 try{const response=await worker.fetch(request(p),env),data=await response.json();assert.equal(response.status,200);assert.equal(data.status,'incomplete');assert.equal(data.failedQueries,3);assert(!JSON.stringify(data).includes('fake-search-key'));}finally{globalThis.fetch=old;DB.raw.close();}
});
test('per-IP request limit blocks additional jobs before upstream calls',async()=>{
 const{DB,env,request}=setup({WADO_WEB_DAILY_QUERIES:'100'}),old=globalThis.fetch;let n=0;globalThis.fetch=async()=>{n++;return Response.json({results:[]});};
 try{for(let i=0;i<3;i++)assert.equal((await worker.fetch(request(p),env)).status,200);assert.equal(n,9);assert.equal((await worker.fetch(request(p),env)).status,429);assert.equal(n,9);}finally{globalThis.fetch=old;DB.raw.close();}
});
