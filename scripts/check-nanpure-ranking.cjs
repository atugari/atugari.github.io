// Exercise the shipped ranking UI against controlled API responses.
// node --experimental-vm-modules scripts/check-nanpure-ranking.cjs /path/to/linkedom [runtime-before-export.js]
const testConsole=console;
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[2]||'linkedom');
const repo=path.resolve(__dirname,'..'),manifest=require('../nanpure/release-manifest.json');
const base=path.join(repo,manifest.base),catalog=require('./i18n/catalog.cjs');
const added=require('./i18n/catalog-ranking-35.json');
const locales=Object.keys(require('./i18n/languages.json')).filter(code=>code!=='ja');
for(const key of Object.keys(added)){
 const translations=catalog[key];
 assert.deepEqual(Object.keys(translations).sort(),locales.slice().sort(),key);
 const placeholders=[...key.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();
 for(const value of Object.values(translations)){
  assert(value.length>0,key);
  assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),placeholders,key);
 }
}
for(const match of fs.readFileSync(path.join(repo,'scripts/client-overrides/app/ranking-panel.tsx'),'utf8').matchAll(/\bt\('([^']+)'/g))assert(catalog[match[1]],'Missing translation: '+match[1]);
const {window:w}=parseHTML(fs.readFileSync(path.join(repo,'nanpure/index.html'),'utf8'));
const values=new Map([['nanpure-language-v1','ja']]),rankingRequests=[],errors=[];
const today='2026-10-23';
const challenges=[1,2,3].map(level=>({day:today,level,n:9,kind:'normal',title:'Daily',rules:'Daily'}));
Object.assign(w,{window:w,self:w,NodeFilter:{SHOW_TEXT:4},Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,structuredClone,queueMicrotask,performance,setTimeout,clearTimeout,
 localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)},
 sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 location:{origin:'https://atugari.github.io',href:'https://atugari.github.io/nanpure/?view=ranking',pathname:'/nanpure/',search:'?view=ranking',hash:''},
 history:{replaceState(){},pushState(){},go(){}},
 setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},scrollTo(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
 fetch:async(url,init={})=>{
  if(url==='/nanpure/version.json')return{ok:true,json:async()=>({version:manifest.version})};
  const parsed=new URL(String(url));
  assert.equal(parsed.origin,manifest.online);
  if(parsed.pathname==='/api/ranking')return new Promise(resolve=>rankingRequests.push({params:parsed.searchParams,signal:init.signal,reply:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data})}));
  return{ok:true,json:async()=>({day:today,serverNow:Date.now(),challenges,records:[],rows:[],items:[],days:[],signedIn:true,save:null})};
 },console:{...console,error:(...args)=>errors.push(args.map(String).join(' '))}
});
w.parent=w;
w.HTMLElement.prototype.showModal=function(){this.open=true};
w.HTMLElement.prototype.close=function(){this.open=false};
Object.defineProperty(w.document,'hidden',{value:false});
const context=vm.createContext(w),modules=new Map();
async function load(file){
 file=path.resolve(file);if(modules.has(file))return modules.get(file);
 const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,importModuleDynamically:async(spec,ref)=>{const next=await load(path.resolve(path.dirname(ref.identifier),spec));await next.evaluate();return next}});
 modules.set(file,m);await m.link((spec,ref)=>load(path.resolve(path.dirname(ref.identifier),spec)));return m;
}
async function settle(condition,label){const deadline=Date.now()+5000;while(!condition()){assert(Date.now()<deadline,'Timed out: '+label);await new Promise(resolve=>setTimeout(resolve,10))}}
function button(text){const result=[...w.document.querySelectorAll('.ranking button')].find(node=>node.textContent.trim()===text);assert(result,'Missing button: '+text);result.click()}
function result(mode='time',period='today',rows=[],myEntry=null,extra={}){
 return{day:today,mode,period,from:period==='all'?null:period==='week'?'2026-10-19':period==='month'?'2026-10-01':today,to:today,timezone:'Asia/Tokyo',rows,totalPlayers:rows.length,myRank:myEntry?.rank||null,myEntry,completed:rows.length,scoring:{basePoints:[1000,2000,3000],maxBonusRatio:0.5,referenceMsPerCell:5000,formula:'base + floor(base * 0.5 * referenceMs / (referenceMs + elapsedMs))'},...extra};
}
(async()=>{
 w.NPTranslations=structuredClone(catalog);
 vm.runInContext(fs.readFileSync(process.argv[3]||path.join(base,'notebook/i18n.js'),'utf8'),context);
 for(const name of ['site-theme.js','ui-text.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),context);
 const entry=await load(path.join(base,'shell/main.js'));await entry.evaluate();
 await settle(()=>rankingRequests.length===1,'initial ranking request');
 assert.equal(rankingRequests[0].params.get('mode'),'time');
 assert.equal(rankingRequests[0].params.get('period'),'today');
 assert.equal(rankingRequests[0].params.get('level'),'1');
 assert(w.document.querySelector('.ranking [aria-busy=true]'));
 assert(w.document.querySelector('.ranking').textContent.includes('読み込んでいます'));
 assert(!w.document.querySelector('.ranking-empty'),'Loading must not be presented as an empty ranking');
 const rows=Array.from({length:50},(_,index)=>({rank:index===1?1:index+1,name:index===0?'<img src=x onerror=alert(1)>':`Player ${index+1}`,elapsed:index<2?1001:1000+index,score:1498,clears:1,isMe:false}));
 const outside={rank:75,name:'My record',elapsed:98765,score:1401,clears:1,isMe:true};
 rankingRequests[0].reply(result('time','today',rows,outside,{totalPlayers:100}));
 await settle(()=>w.document.querySelectorAll('.world-rank-list li').length===50,'all 50 rows');
 assert(w.document.querySelector('.ranking-my-place').textContent.includes('75位'),'Own rank outside the top 50 must remain visible');
 assert.equal(w.document.querySelectorAll('.ranking-position')[1].textContent,'1','Use server tie ranks instead of row index');
 assert(w.document.querySelector('.ranking-value').textContent.endsWith('.001'),'Keep millisecond precision for time ranks');
 assert.equal(w.document.querySelector('.ranking-player-name').textContent,'<img src=x onerror=alert(1)>');
 assert.equal(w.document.querySelector('.ranking-player-name').getAttribute('translate'),'no');
 assert(!w.document.querySelector('.ranking-player img'),'Names must render as text');
 // React translations are subsequently revisited by the shared DOM translator.
 // Both the visible own rank and accessible row ranks must retain their language.
 for(const locale of locales){
  await w.NPI18n.set(locale);
  const ownLabel=catalog['{rank}位'][locale].replace('{rank}','75');
  const rowLabel=catalog['{rank}位'][locale].replace('{rank}','1');
  await settle(()=>w.document.querySelector('.ranking-my-place strong')?.textContent===ownLabel,'translated own rank '+locale);
  w.NPI18n.apply();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(w.document.querySelector('.ranking-my-place strong').textContent,ownLabel,'Own rank after DOM translation '+locale);
  assert.equal(w.document.querySelector('.ranking-position').getAttribute('aria-label'),rowLabel,'Accessible rank after DOM translation '+locale);
 }
 await w.NPI18n.set('ja');
 await settle(()=>w.document.querySelector('.ranking-my-place strong')?.textContent==='75位','return to Japanese');
 button('スコア');await settle(()=>rankingRequests.length===2,'score request');
 assert.equal(rankingRequests[1].params.get('mode'),'score');
 button('今週');await settle(()=>rankingRequests.length===3,'weekly request');
 assert.equal(rankingRequests[2].params.get('period'),'week');
 const own={rank:2,name:'Week player',elapsed:12345,score:12500,clears:10,isMe:true};
 rankingRequests[2].reply(result('score','week',[own],own,{totalPlayers:3}));
 await settle(()=>w.document.querySelector('.ranking-my-score')?.textContent.includes('12,500 pt'),'weekly score');
 rankingRequests[1].reply(result('score','today',[{...own,name:'STALE RESULT',score:999}]));
 await new Promise(resolve=>setTimeout(resolve,30));
 assert(!w.document.querySelector('.ranking').textContent.includes('STALE RESULT'),'Stale responses must not replace the selected period');
 assert(w.document.querySelector('.ranking-my-place').textContent.includes('10問クリア'));
 assert(w.document.querySelector('.ranking-is-me'),'Highlight own row');
 button('今月');await settle(()=>rankingRequests.length===4,'monthly request');
 assert.equal(rankingRequests[3].params.get('period'),'month');rankingRequests[3].reply({error:'offline'},503);
 await settle(()=>w.document.querySelector('.ranking-notice')?.textContent.includes('再試行'),'error and retry');
 assert(!w.document.querySelector('.ranking-empty'),'Network errors are not empty rankings');
 button('再試行');await settle(()=>rankingRequests.length===5,'retry request');rankingRequests[4].reply(result('score','month'));
 await settle(()=>w.document.querySelector('.ranking-empty'),'empty monthly result');
 assert(w.document.querySelector('.ranking-join-note'));
 button('累計');await settle(()=>rankingRequests.length===6,'all-time request');
 assert.equal(rankingRequests[5].params.get('period'),'all');rankingRequests[5].reply(result('score','all'));
 await settle(()=>w.document.querySelector('.ranking-range')?.textContent.includes('集計開始から今日まで'),'all-time label');
 button('世界タイム');await settle(()=>rankingRequests.length===7,'return to time');rankingRequests[6].reply(result());
 await settle(()=>!w.document.querySelector('.ranking [aria-busy=true]'),'time loaded');
 button('難問');await settle(()=>rankingRequests.length===8,'hard time request');assert.equal(rankingRequests[7].params.get('level'),'3');rankingRequests[7].reply(result());
 await settle(()=>!w.document.querySelector('.ranking [aria-busy=true]'),'hard loaded');
 assert.equal(errors.length,0,errors.join('\n'));
 testConsole.log('PASS worldwide ranking UI: 50 rows, tie ranks, milliseconds, private names, own rank outside top 50, period/difficulty controls, stale-response protection, retry/empty, '+locales.length+'-language coverage and dynamic rank translation');
 process.exit(0);
})().catch(error=>{testConsole.error(error);process.exit(1)});
