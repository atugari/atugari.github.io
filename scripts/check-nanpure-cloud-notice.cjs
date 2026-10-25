// Two explicit acknowledgements; no server traffic or extra personal data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{parseHTML}=require(process.argv[2]||'linkedom'),root=path.resolve(__dirname,'..'),meta=require('../nanpure/release-manifest.json'),catalog=require('./i18n/catalog.cjs'),added=require('./i18n/catalog-cloud-notice-59.cjs');
const source=fs.readFileSync(path.join(root,'scripts/client-overrides/public/cloud-retirement-notice.js'),'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),meta.cloudRetirementNoticeSha256);
assert(fs.readFileSync(path.join(root,meta.base,'shell/main.js'),'utf8').includes('cloud-notice-source:'+meta.cloudRetirementNoticeSha256));
const locales=Object.keys(require('./i18n/languages.json')).filter(x=>x!=='ja');for(const [key,row]of Object.entries(added)){assert.deepEqual(Object.keys(row).sort(),locales.slice().sort());for(const value of Object.values(row))assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map(m=>m[0]),[...key.matchAll(/\{\w+\}/g)].map(m=>m[0]));}
const stateKey='np-cloud-retirement-notice-v1',base=Date.parse('2026-10-26T12:00:00+09:00');
function setup({at=base,storage=new Map(),locale='ja',home=false,known=false,failWrites=false}={}){
 if(known)storage.set('np-cloud-sync-key-v1','a'.repeat(64));
 const{window:w}=parseHTML('<!doctype html><html><body>'+(home?'<div class="site-shell mode-home"><main class="designed-home"></main></div>':'<main class="mode-practice"></main>')+'</body></html>');
 let clock=at;class Clock extends Date{static now(){return clock}}
 w.HTMLElement.prototype.showModal=function(){this.open=true;this.setAttribute('open','')};w.HTMLElement.prototype.close=function(){this.open=false;this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};w.HTMLElement.prototype.getClientRects=function(){return [{}]};w.HTMLElement.prototype.focus=function(){};
 Object.assign(w,{window:w,self:w,Date:Clock,console,requestAnimationFrame:fn=>setImmediate(fn),setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{if(failWrites)throw Error('full');storage.set(key,value)}},NPI18n:{t:key=>locale==='ja'?key:catalog[key]?.[locale]||key},fetch(){throw Error('A notice must not make network requests')}});
 delete w.NPCloudRetirement;Object.defineProperty(w.document,'hidden',{value:false});vm.runInContext(source.replaceAll('__CLOUD_RETIRE_AT__',String(meta.cloudRetiresAt)),vm.createContext(w));
 return{w,storage,api:w.NPCloudRetirement,setTime:value=>{clock=value},dialog:()=>w.document.querySelector('.np-cloud-retirement-dialog'),confirm:()=>{const button=w.document.querySelector('.np-cloud-retirement-dialog button');assert(button,'Notice must be visible before acknowledgement');button.click()}};
}
async function run(){
 const f=setup({home:true,known:true});assert(f.dialog());assert.equal(f.api.getCount(),0);assert(f.dialog().textContent.includes('2026年11月9日0時'));assert(f.dialog().textContent.includes('全員のクラウド保存データを削除'));
 const cancel=new f.w.Event('cancel',{cancelable:true});f.dialog().dispatchEvent(cancel);assert(cancel.defaultPrevented);assert.equal(f.api.getCount(),0);
 f.confirm();assert.equal(f.api.getCount(),1);assert.equal(f.dialog(),null);await f.api.onEntry(base);assert.equal(f.dialog(),null,'Do not repeat automatically on the same day');
 let allowed=false;const use=f.api.beforeUse().then(value=>{allowed=value});assert(f.dialog().textContent.includes('2/2'));assert.equal(allowed,false,'Cloud operations wait for the second acknowledgement');f.confirm();await use;assert.equal(allowed,true);assert.equal(f.api.getCount(),2);assert.equal(f.dialog(),null);assert.equal(await f.api.beforeUse(),true);assert.equal(f.dialog(),null);
 const again=setup({home:true,known:true,storage:f.storage});assert.equal(again.dialog(),null,'No third prompt for this browser');
 const first=setup({home:true,known:true});first.confirm();const tomorrow=setup({home:true,known:true,storage:first.storage,at:base+86400000});assert(tomorrow.dialog().textContent.includes('2/2'));tomorrow.confirm();assert.equal(tomorrow.api.getCount(),2);
 const playing=setup({known:true});assert.equal(playing.dialog(),null,'Never interrupt play automatically');
 const fresh=setup({home:true});assert.equal(fresh.dialog(),null,'Do not interrupt people who have never opened cloud storage');
 const noStorage=setup({failWrites:true});const p=noStorage.api.onEntry(base);noStorage.confirm();await p;const p2=noStorage.api.beforeUse();noStorage.confirm();assert.equal(await p2,true);assert.equal(noStorage.api.getCount(),2);
 const old=new Map([[stateKey,JSON.stringify({retirement:meta.cloudRetiresAt,count:1,lastAt:base})]]),full=setup({storage:old,failWrites:true});const p3=full.api.beforeUse();full.confirm();assert.equal(await p3,true);assert.equal(full.api.getCount(),2,'A full store cannot trap the user in repeated confirmations');
 const end=setup({home:true,known:true,at:meta.cloudRetiresAt});assert.equal(end.dialog(),null);assert.equal(await end.api.beforeUse(),false);
 for(const locale of locales){const l=setup({locale});const first=l.api.onEntry(base);assert(l.dialog().textContent.includes(catalog['クラウド保存終了のお知らせ（{count}/2）'][locale].replace('{count}','1')));assert(!/[\u3041-\u3096\u30a1-\u30fa]/.test(l.dialog().textContent),'Untranslated notice: '+locale);l.confirm();await first;const second=l.api.beforeUse();l.confirm();assert.equal(await second,true)}
 console.log('PASS cloud notices: two explicit acknowledgements, next-day fallback, blocked operations, no repeat, no play interruption, unavailable storage, retirement and 19 translated locales');
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
