const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'client-overrides/public/visit-stats.js'),'utf8');
function make(options={}){
 const browser=options.browser||new Map(),session=options.session||new Map(),sent=[],listeners={};
 const storage=values=>({getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(options.blocked)throw Error('blocked');values.set(k,v)}});
 const w={location:{origin:options.origin||'https://atugari.github.io',search:options.search||''},navigator:{doNotTrack:options.dnt?'1':null,globalPrivacyControl:!!options.gpc},document:{hidden:false,readyState:'complete',addEventListener:(name,fn)=>listeners[name]=fn},localStorage:storage(browser),sessionStorage:storage(session),crypto:webcrypto,URLSearchParams,AbortSignal,Date,Uint8Array,fetch:async(url,init)=>{sent.push({url,...init});return{ok:options.ok!==false}}};
 w.window=w;w.top=options.frame?{}:w;w.addEventListener=(name,fn)=>listeners[name]=fn;
 vm.runInNewContext(source,w);return{w,browser,session,sent,listeners};
}
(async()=>{
 for(const options of [{dnt:true},{gpc:true},{frame:true},{origin:'http://terminal.local:4173'},{search:'?view=manage'},{blocked:true}]){const app=make(options);assert.equal(app.sent.length,0,'excluded visitors send no requests')}
 const app=make();await new Promise(r=>setImmediate(r));assert.equal(app.sent.length,1);const data=JSON.parse(app.sent[0].body);assert.deepEqual(Object.keys(data),['visitor','session']);assert.match(data.visitor,/^[a-f0-9]{64}$/);assert.match(data.session,/^[a-f0-9]{64}$/);assert.equal(app.sent[0].credentials,'omit');
 app.listeners.visibilitychange();assert.equal(app.sent.length,1,'successful requests are not repeated');const reload=make({browser:app.browser,session:app.session});assert.equal(reload.sent.length,0,'reload is deduplicated');
 const second=make({browser:app.browser});await new Promise(r=>setImmediate(r));const another=JSON.parse(second.sent[0].body);assert.equal(another.visitor,data.visitor);assert.notEqual(another.session,data.session,'separate visits share only a daily browser id');
 const old=JSON.stringify({day:'2000-01-01',id:'a'.repeat(64),sent:true}),rotated=make({browser:new Map([['np-visit-day-v1',old]]),session:new Map([['np-visit-session-v1',old]])});assert.notEqual(JSON.parse(rotated.sent[0].body).visitor,'a'.repeat(64),'old daily ids are replaced');
 const retry=make({ok:false});await new Promise(r=>setImmediate(r));assert.equal(JSON.parse(retry.session.get('np-visit-session-v1')).sent,false);retry.listeners.visibilitychange();assert.equal(retry.sent.length,2,'a failed visit can retry the same id without double-counting');assert.equal(retry.sent[0].body,retry.sent[1].body);
 console.log('PASS visit statistics: privacy opt-out, owner/local/frame exclusion, reload/session deduplication, daily rotation and safe retry');
})().catch(error=>{console.error(error);process.exitCode=1});
