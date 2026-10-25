// Exercise the shipped React component against the real API and SQLite.
const testConsole=console;
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),cryptoModule=require('node:crypto');
const{pathToFileURL}=require('node:url'),{parseHTML}=require(process.argv[2]||'linkedom');
const root=path.resolve(__dirname,'..'),manifest=require('../nanpure/release-manifest.json'),catalog=require('./i18n/catalog.cjs');
const added=require('./i18n/catalog-cloud-57.cjs'),locales=Object.keys(require('./i18n/languages.json')).filter(x=>x!=='ja');
for(const[key,row]of Object.entries(added)){
 assert.deepEqual(Object.keys(row).sort(),locales.slice().sort());
 for(const value of Object.values(row))assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map(m=>m[0]),[...key.matchAll(/\{\w+\}/g)].map(m=>m[0]));
}
const source=fs.readFileSync(path.join(root,'nanpure-api/client/cloud-save.tsx'),'utf8');
assert.equal(cryptoModule.createHash('sha256').update(source).digest('hex'),manifest.cloudSaveSourceSha256);
const shellFile=path.join(root,manifest.base,'shell/main.js');let shipped=fs.readFileSync(shellFile,'utf8');
assert(shipped.includes('cloud-save-source:'+manifest.cloudSaveSourceSha256));
const boot=shipped.lastIndexOf('Promise.resolve(window.NPI18n?.ready).then('),license=shipped.indexOf('/*! Bundled license information:',boot);
assert(boot>0&&license>boot);
// Only replace startup in memory; test the actual bundled component and its
// original React/context/API bindings without loading unrelated screens.
shipped=shipped.slice(0,boot)+'export const CloudTest={Component:xp,React:Ct,createRoot:ZS.createRoot,Context:rS};\n'+shipped.slice(license);
const{window:w}=parseHTML('<!doctype html><html><head></head><body><main id="cloud-test"></main></body></html>');
const values=new Map([['np-cloud-sync-key-v1','a'.repeat(64)],['np-api-device-v1','b'.repeat(64)]]),errors=[];
let DB,worker,failChunk=false,large=false,restored=null;
Object.assign(w,{window:w,self:w,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,structuredClone,queueMicrotask,performance,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
 localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},sessionStorage:{getItem:()=>null},
 location:{origin:'https://atugari.github.io',href:'https://atugari.github.io/nanpure/',pathname:'/nanpure/',search:'',hash:''},
 console:{...console,error:(...args)=>errors.push(args.map(String).join(' '))},
 fetch:async(url,init={})=>{
  const target=new URL(String(url));assert.equal(target.origin,manifest.online);assert.equal(target.pathname,'/api/cloud');
  if(failChunk&&target.searchParams.get('action')==='chunk'&&init.method==='POST'){failChunk=false;return Response.json({error:'通信できませんでした。'},{status:503});}
  const headers=new Headers(init.headers);headers.set('Origin','https://atugari.github.io');
  return worker.fetch(new Request('https://worker.test'+target.pathname+target.search,{...init,headers}),{DB});
 }
});w.parent=w;
const context=vm.createContext(w),modules=new Map();
async function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(file===shellFile?shipped:fs.readFileSync(file,'utf8'),{context,identifier:file,importModuleDynamically:async(spec,ref)=>{const next=await load(path.resolve(path.dirname(ref.identifier),spec));await next.evaluate();return next}});modules.set(file,m);await m.link((spec,ref)=>load(path.resolve(path.dirname(ref.identifier),spec)));return m;}
const wait=async(condition,label)=>{const until=Date.now()+5000;while(!condition()){assert(Date.now()<until,'Timed out: '+label);await new Promise(r=>setTimeout(r,5));}};
function button(text){const b=[...w.document.querySelectorAll('button')].find(e=>e.textContent.trim()===text);assert(b,'Missing button: '+text);return b;}
const contents=()=>w.document.querySelector('.cloud-save')?.textContent||'';
const message=()=>w.document.querySelector('.cloud-save>p[role="status"]')?.textContent||'';
async function run(){
 worker=(await import(pathToFileURL(path.join(root,'nanpure-api/src/index.js')))).default;
 DB=(await import(pathToFileURL(path.join(root,'nanpure-api/test/db.mjs')))).database();
 const module=await load(shellFile);await module.evaluate();
 const{Component,React,createRoot,Context}=module.namespace.CloudTest,reactRoot=createRoot(w.document.getElementById('cloud-test'));
 const backup=()=>({format:'nanpure-website-backup-v1',created:Date.now(),data:{},notebook:{puzzles:[],...(large?{padding:'x'.repeat(5*1024*1024)}:{})}});
 function render(locale='ja'){const t=s=>locale==='ja'?s:catalog[s]?.[locale]||s;reactRoot.render(React.createElement(Context.Provider,{value:{locale,t,setLocale(){}}},React.createElement(Component,{capture:async()=>backup(),onRestore:v=>{restored=v},busy:false})));}
 async function save(){button('クラウドに保存').click();await new Promise(r=>setTimeout(r,10));const confirm=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='この端末の内容を保存');if(confirm)confirm.click();}
 render();await wait(()=>contents().includes('今日はあと3回保存できます。'),'initial remaining count');
 assert(contents().includes('5MB'));assert(contents().includes('問題の作成・印刷と端末への保存は引き続き無料で使えます。'));
 await save();await wait(()=>contents().includes('今日はあと2回保存できます。')&&contents().includes('クラウドに保存しました。'),'first save');
 const original=DB.raw.prepare('SELECT revision FROM cloud_saves').get().revision;
 large=true;await save();await wait(()=>message().includes('5MBを超える場合は')&&!button('クラウドに保存').disabled,'oversized local backup message');
 assert(contents().includes('今日はあと2回保存できます。'));assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM cloud_uploads').get().n,0);
 large=false;failChunk=true;await save();await wait(()=>message().includes('通信できませんでした。')&&!button('クラウドに保存').disabled,'failed upload recovery');
 assert(contents().includes('今日はあと2回保存できます。'));assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM cloud_uploads').get().n,0);assert.equal(DB.raw.prepare('SELECT revision FROM cloud_saves').get().revision,original);
 await save();await wait(()=>contents().includes('今日はあと1回保存できます。'),'second save');
 await save();await wait(()=>contents().includes('今日はあと0回保存できます。'),'third save');assert(button('クラウドに保存').disabled);assert(!button('クラウドから読み込む').disabled);
 button('クラウドから読み込む').click();await wait(()=>restored,'download at daily limit');assert.equal(restored.format,'nanpure-website-backup-v1');
 for(const locale of locales){render(locale);const expected=catalog['今日はあと{count}回保存できます。'][locale].replace('{count}','0');await wait(()=>contents().includes(expected),'translated quota '+locale);assert(contents().includes(catalog['クラウド保存は5MBまで・1日3回です。'][locale]));}
 assert.deepEqual(errors,[]);reactRoot.unmount();DB.raw.close();
 testConsole.log('PASS shipped cloud UI + real API: remaining saves, oversize rejection, failed-upload recovery, limit preserves download, and 19 translated locales');
}
run().then(()=>process.exit(0)).catch(e=>{testConsole.error(e);try{DB?.raw.close()}catch{}process.exit(1)});
