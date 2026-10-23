import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {hash} from '../src/http.js';
const ownerKey='c'.repeat(64),base='/owner/wado/',origin='https://worker.test',name='__Secure-np-wado-owner';
async function setup(t){
 const DB=database();t.after(()=>DB.raw.close());const calls=[],env={DB,OWNER_KEY_HASH:await hash(ownerKey),WADO_ASSETS:{fetch:async request=>{calls.push(new URL(request.url).pathname);return new Response('PROTECTED ASSET',{headers:{'Content-Type':'text/plain'}});}}};
 async function call(path=base,{method='GET',key,headers={},body}={}){if(key!==undefined){method='POST';body=new URLSearchParams({key}).toString();headers={Origin:origin,'Content-Type':'application/x-www-form-urlencoded',...headers};}const r=await worker.fetch(new Request(origin+path,{method,headers,...(body===undefined?{}:{body})}),env);return{status:r.status,headers:r.headers,text:await r.text()};}
 async function login(){const r=await call(base+'login',{key:ownerKey});assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];}
 return{DB,env,calls,call,login};
}
test('anonymous requests cannot obtain any Wado play asset, even using the public owner hash',async t=>{
 const {call,env,calls}=await setup(t);const page=await call();assert.equal(page.status,200);assert.match(page.text,/管理用キー/);assert(!page.text.includes('wado-engine.js'));assert.match(page.headers.get('x-robots-tag'),/noindex/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 for(const path of ['session','assets/player.js','assets/wado-data.json','assets/wado-engine.js','assets/player.css'])for(const token of ['',env.OWNER_KEY_HASH,'a'.repeat(64)]){const r=await call(base+path,{headers:token?{Cookie:name+'='+token}:{}});assert.equal(r.status,401);assert(!r.text.includes('PROTECTED ASSET'));}
 for(const path of ['/assets/player.js','/index.html','/.wado-assets/assets/wado-data.json'])assert.equal((await call(path)).status,404);
 assert.equal(calls.length,0);
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));assert.equal(config.assets.run_worker_first,true);assert.equal(config.assets.not_found_handling,'none');
});
test('login accepts only the actual owner key and stores a hashed opaque two-hour session',async t=>{
 const {call,login,DB,calls}=await setup(t);
 assert.equal((await call(base+'login',{key:'a'.repeat(64)})).status,403);
 const cookie=await login(),token=cookie.slice(name.length+1),row=DB.raw.prepare('SELECT * FROM wado_owner_sessions').get();
 assert.equal(row.token_hash,await hash(token));assert.equal(row.expires-row.created,7200000);assert(!JSON.stringify(row).includes(token));assert(!JSON.stringify(row).includes(ownerKey));
 const r=await call(base,{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.equal(r.text,'PROTECTED ASSET');assert.equal(calls[0],'/index.html');assert.equal(r.headers.get('cache-control'),'no-store');
 const asset=await call(base+'assets/wado-data.json',{headers:{Cookie:cookie}});assert.equal(asset.status,200);assert.equal(calls.at(-1),'/assets/wado-data.json');
 const session=await call(base+'session',{headers:{Cookie:cookie}});assert.deepEqual(JSON.parse(session.text),{ok:true,expires:row.expires});
 assert.equal((await call(base+'assets/unlisted.js',{headers:{Cookie:cookie}})).status,404);
 assert.equal((await call(base+'assets/wado-data.json',{headers:{Cookie:cookie+'; '+cookie}})).status,401);
});
test('session cookie is secure, host-only, HttpOnly and scoped to Wado; it does not grant admin access',async t=>{
 const {call}=await setup(t);const r=await call(base+'login',{key:ownerKey}),full=r.headers.get('set-cookie'),cookie=full.split(';')[0];
 for(const flag of ['Path=/owner/wado/','Max-Age=7200','HttpOnly','Secure','SameSite=Strict'])assert(full.includes(flag));assert(!full.includes('Domain='));assert(!full.includes(ownerKey));
 assert.equal((await call('/api/admin',{headers:{Cookie:cookie}})).status,403);
 assert.equal((await call('/api/owner/overview',{headers:{Cookie:cookie}})).status,403);
});
test('expiry, owner-key rotation and logout each revoke access before serving an asset',async t=>{
 const {call,login,DB,env,calls}=await setup(t);let cookie=await login();
 DB.raw.prepare('UPDATE wado_owner_sessions SET expires=0').run();assert.equal((await call(base+'assets/player.js',{headers:{Cookie:cookie}})).status,401);
 cookie=await login();const previous=env.OWNER_KEY_HASH;env.OWNER_KEY_HASH=await hash('d'.repeat(64));assert.equal((await call(base+'session',{headers:{Cookie:cookie}})).status,401);env.OWNER_KEY_HASH=previous;
 const result=await call(base+'logout',{method:'POST',headers:{Origin:origin,Cookie:cookie}});assert.equal(result.status,303);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM wado_owner_sessions').get().n,0);assert.equal((await call(base+'session',{headers:{Cookie:cookie}})).status,401);assert.equal(calls.length,0);
});
test('login and logout reject cross-site form submission, malformed bodies and oversized input',async t=>{
 const {call,login,DB}=await setup(t);
 for(const site of ['https://evil.test','https://atugari.github.io',null]){const r=await call(base+'login',{method:'POST',headers:{...(site?{Origin:site}:{}),'Content-Type':'application/x-www-form-urlencoded'},body:'key='+ownerKey});assert.equal(r.status,403);}
 assert.equal((await call(base+'login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,400);
 assert.equal((await call(base+'login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'key='+ownerKey+'&key='+ownerKey})).status,403);
 assert.equal((await call(base+'login',{key:'x'.repeat(600)})).status,413);
 const cookie=await login();assert.equal((await call(base+'logout',{method:'POST',headers:{Origin:'https://atugari.github.io',Cookie:cookie}})).status,403);assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM wado_owner_sessions').get().n,1);
});
test('login rate limits guesses and migration is additive and repeatable',async t=>{
 const {call,DB}=await setup(t);for(let i=0;i<10;i++)assert.equal((await call(base+'login',{key:'a'.repeat(64)})).status,403);assert.equal((await call(base+'login',{key:ownerKey})).status,429);
 DB.raw.exec(readFileSync(new URL('../migrations/0004_wado_owner_sessions.sql',import.meta.url),'utf8'));assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM inquiries').get().n,0);assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM wado_owner_sessions').get().n,0);
});
