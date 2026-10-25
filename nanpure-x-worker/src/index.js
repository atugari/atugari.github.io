import {Buffer} from 'node:buffer';
// Only authenticated CI can prepare posts. Cron is the sole publication path.
export const SLOTS=['08:00','12:00','18:00','21:00'];
export const MAX_LATENESS=15*60*1000;
const encode=s=>encodeURIComponent(String(s)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
const bytes=s=>new TextEncoder().encode(s);
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',typeof s==='string'?bytes(s):s));
const japan=ms=>new Date(ms+9*3600000).toISOString();
export function dueFor(day,slot){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!SLOTS.includes(slot))throw Error('Invalid slot');
 const due=Date.parse(day+'T'+slot+':00+09:00');
 if(!Number.isFinite(due)||japan(due).slice(0,10)!==day)throw Error('Invalid date');return due;
}
export function windowFor(scheduledTime,now){
 const local=japan(scheduledTime),day=local.slice(0,10),slot=local.slice(11,16);
 if(!SLOTS.includes(slot)||now<scheduledTime||now-scheduledTime>MAX_LATENESS||japan(now).slice(0,10)!==day)return null;
 return {day,slot,key:day+'@'+slot,due:dueFor(day,slot)};
}
export async function queueToken(env){
 if(!env.X_API_SECRET||!env.X_ACCESS_TOKEN_SECRET)throw Error('Missing credentials');
 return sha('nanpure-x-queue-v1\0'+env.X_API_SECRET+'\0'+env.X_ACCESS_TOKEN_SECRET);
}
export async function oauthHeader(method,url,env,{nonce=crypto.randomUUID().replaceAll('-',''),timestamp=Math.floor(Date.now()/1000)}={}){
 const oauth={oauth_consumer_key:env.X_API_KEY,oauth_nonce:nonce,oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(timestamp),oauth_token:env.X_ACCESS_TOKEN,oauth_version:'1.0'};
 const u=new URL(url),params=[...u.searchParams,...Object.entries(oauth)].map(([k,v])=>[encode(k),encode(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0);
 const normalized=params.map(([k,v])=>k+'='+v).join('&'),canonical=u.origin+u.pathname,base=[method.toUpperCase(),encode(canonical),encode(normalized)].join('&');
 const key=await crypto.subtle.importKey('raw',bytes(encode(env.X_API_SECRET)+'&'+encode(env.X_ACCESS_TOKEN_SECRET)),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 oauth.oauth_signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(base)))));
 return 'OAuth '+Object.entries(oauth).sort(([a],[b])=>a<b?-1:1).map(([k,v])=>encode(k)+'="'+encode(v)+'"').join(', ');
}
class Failure extends Error {constructor(status,message){super(message);this.status=status}}
const fail=(code,message)=>{throw new Failure(code,message)};
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function input(request,limit=800000){
 if(Number(request.headers.get('content-length'))>limit)fail(413,'Payload too large');
 const reader=request.body?.getReader();if(!reader)fail(400,'Missing JSON');const chunks=[];let total=0;
 while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();fail(413,'Payload too large')}chunks.push(value)}
 const all=new Uint8Array(total);let at=0;for(const c of chunks){all.set(c,at);at+=c.length}
 let v;try{v=JSON.parse(new TextDecoder().decode(all))}catch{fail(400,'Invalid JSON')}
 if(!v||typeof v!=='object'||Array.isArray(v))fail(400,'Invalid JSON');return v;
}
export function validateMeta(post,now){
 const due=dueFor(post.date,post.slot),key=post.date+'@'+post.slot;
 if(post.publication_id!==key||due<=now||due>now+4*86400000)fail(400,'Only future slots within four days can be prepared');
 const [year,month,day]=post.date.split('-').map(Number);
 if(typeof post.text!=='string'||!post.text.startsWith('【今日の4問｜'+month+'/'+day+'】\n')||post.text.length>25000)fail(400,'Post date and text do not match');
 if(post.plan_version!==1||!Array.isArray(post.questions)||post.questions.length!==4||new Set(post.questions.map(q=>q.rule)).size!==4)fail(400,'Four different verified rules are required');
 if(!Array.isArray(post.fingerprints)||post.fingerprints.length!==4||new Set(post.fingerprints).size!==4||post.fingerprints.some(h=>! /^[a-f0-9]{64}$/.test(h)))fail(400,'Invalid fingerprints');
 if(!Array.isArray(post.images)||post.images.length!==4||post.images.some((i,n)=>i.file!==post.questions[n].file||! /^[a-f0-9]{64}$/.test(i.sha256)||typeof i.alt!=='string'||!i.alt.length||i.alt.length>1000))fail(400,'Invalid image manifest');
 return{key,due};
}
async function state(db){
 const [p,h,setting]=await Promise.all([db.prepare('SELECT key,day,slot,status,post_id,due,sent_at,error FROM x_four_posts ORDER BY due').all(),db.prepare('SELECT hash,post_key FROM x_four_fingerprints').all(),db.prepare('SELECT enabled FROM x_four_settings WHERE id=1').first()]);
 const posts=Object.fromEntries(p.results.map(r=>[r.key,{...r,date:r.day,fingerprints:[]} ]));for(const r of h.results)posts[r.post_key]?.fingerprints.push(r.hash);
 return{version:1,enabled:!!setting?.enabled,posts};
}
async function controls(v,db,now){
 if(typeof v.enabled!=='boolean')fail(400,'Invalid switch');
 // Preserve both sent and uncertain legacy attempts. Never release a used fingerprint.
 const statements=[];
 for(const [key,p]of Object.entries(v.history?.posts||{})){
  if(!/^\d{4}-\d{2}-\d{2}(@(08|12|18|21):00)?$/.test(key)||!Array.isArray(p.fingerprints)||p.fingerprints.some(h=>! /^[a-f0-9]{64}$/.test(h)))fail(400,'Invalid history');
  const day=key.slice(0,10),slot=key.includes('@')?key.slice(11):'',due=slot?dueFor(day,slot):Date.parse(day+'T00:00:00+09:00');
  if(due>=now)continue;
  statements.push(db.prepare('INSERT OR IGNORE INTO x_four_posts(key,day,slot,due,status,meta,created,post_id) VALUES(?,?,?,?,?,?,?,?)').bind(key,day,slot,due,p.status==='sent'?'sent':'archived','{}',now,p.post_id||null));
  for(const h of p.fingerprints)statements.push(db.prepare('INSERT OR IGNORE INTO x_four_fingerprints(hash,post_key) VALUES(?,?)').bind(h,key));
 }
 for(let n=0;n<statements.length;n+=100)await db.batch(statements.slice(n,n+100));
 await db.prepare('UPDATE x_four_settings SET enabled=? WHERE id=1').bind(v.enabled?1:0).run();return{ok:true,enabled:v.enabled};
}
async function prepare(post,db,now){
 const {key,due}=validateMeta(post,now),old=await db.prepare('SELECT status FROM x_four_posts WHERE key=?').bind(key).first();
 if(old){
  if(old.status==='assembling'){
   for(const hash of post.fingerprints){const used=await db.prepare('SELECT post_key FROM x_four_fingerprints WHERE hash=?').bind(hash).first();if(used&&used.post_key!==key)fail(409,'Puzzle already reserved');}
   await db.batch([db.prepare("UPDATE x_four_posts SET meta=? WHERE key=? AND status='assembling'").bind(JSON.stringify(post),key),db.prepare("DELETE FROM x_four_images WHERE post_key=? AND EXISTS(SELECT 1 FROM x_four_posts WHERE key=? AND status='assembling')").bind(key,key),...post.fingerprints.map(h=>db.prepare('INSERT OR IGNORE INTO x_four_fingerprints(hash,post_key) VALUES(?,?)').bind(h,key))]);
  }return{key,status:old.status};
 }
 const statements=[db.prepare('INSERT INTO x_four_posts(key,day,slot,due,status,meta,created) VALUES(?,?,?,?,?,?,?)').bind(key,post.date,post.slot,due,'assembling',JSON.stringify(post),now),...post.fingerprints.map(h=>db.prepare('INSERT INTO x_four_fingerprints(hash,post_key) VALUES(?,?)').bind(h,key))];
 try{await db.batch(statements)}catch{fail(409,'Slot or puzzle already reserved')};return{key,status:'assembling'};
}
async function image(v,db,now){
 const p=await db.prepare('SELECT status,meta,due FROM x_four_posts WHERE key=?').bind(v.key).first();
 if(!p||p.status!=='assembling'||p.due<=now||!Number.isInteger(v.position)||v.position<0||v.position>3)fail(409,'Image cannot be replaced');
 const meta=JSON.parse(p.meta),expected=meta.images[v.position];
 if(typeof v.media!=='string'||v.media.length>1866668||! /^[A-Za-z0-9+/]+={0,2}$/.test(v.media))fail(400,'Invalid media');
 let raw;try{raw=Buffer.from(v.media,'base64')}catch{fail(400,'Invalid base64')}
 const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);if(raw.length<24||hex(raw.slice(0,8))!=='89504e470d0a1a0a'||view.getUint32(16)!==2048||view.getUint32(20)!==2048||await sha(raw)!==expected.sha256)fail(400,'Image validation failed');
 await db.prepare("INSERT INTO x_four_images(post_key,position,media,sha256) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM x_four_posts WHERE key=? AND status='assembling') ON CONFLICT(post_key,position) DO UPDATE SET media=excluded.media,sha256=excluded.sha256").bind(v.key,v.position,v.media,expected.sha256,v.key).run();return{ok:true};
}
async function ready(v,db,now){
 const p=await db.prepare('SELECT status,meta,due FROM x_four_posts WHERE key=?').bind(v.key).first();if(!p||p.due<=now)fail(409,'Slot expired');if(p.status==='ready')return{ok:true};if(p.status!=='assembling')fail(409,'Slot cannot be replaced');
 const images=await db.prepare('SELECT position,sha256 FROM x_four_images WHERE post_key=? ORDER BY position').bind(v.key).all(),meta=JSON.parse(p.meta);
 if(images.results.length!==4||images.results.some((r,n)=>r.position!==n||r.sha256!==meta.images[n].sha256))fail(409,'Four validated images are required');
 await db.prepare("UPDATE x_four_posts SET status='ready' WHERE key=? AND status='assembling'").bind(v.key).run();return{ok:true};
}
export function xClient(env,fetcher=fetch){return{async request(method,route,body){
 const url='https://api.x.com'+route;let response;
 try{response=await fetcher(url,{method,headers:{Authorization:await oauthHeader(method,url,env),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})}catch{throw Error('X connection failed; no automatic retry')}
 if(!response.ok)throw Error('X API '+response.status+' '+new URL(url).pathname);
 const data=await response.json();if(data.errors?.length)throw Error('X rejected the request');return data;
}}}
export async function runScheduled(scheduledTime,env,{now=()=>Date.now(),client=xClient(env)}={}){
 const slot=windowFor(scheduledTime,now());if(!slot)return{status:'skipped-stale-event'};
 const db=env.DB,setting=await db.prepare('SELECT enabled FROM x_four_settings WHERE id=1').first();if(!setting?.enabled)return{status:'paused'};
 const record=await db.prepare("UPDATE x_four_posts SET status='posting' WHERE key=? AND status='ready' AND due=? RETURNING meta").bind(slot.key,slot.due).first();if(!record)return{key:slot.key,status:'not-ready-or-already-attempted'};
 const post=JSON.parse(record.meta),checkTime=()=>{if(!windowFor(scheduledTime,now()))throw Error('Publication window expired')};
 try{
  checkTime();const user=await client.request('GET','/2/users/me');if(user.data?.username?.toLowerCase()!==(env.X_EXPECTED_USERNAME||'parade166').toLowerCase())throw Error('Wrong X posting account');
  const ids=[];
  for(let n=0;n<4;n++){
   checkTime();const image=await db.prepare('SELECT media,sha256 FROM x_four_images WHERE post_key=? AND position=?').bind(slot.key,n).first();if(!image||image.sha256!==post.images[n].sha256)throw Error('Prepared image is missing');
   let data=(await client.request('POST','/2/media/upload',{media:image.media,media_category:'tweet_image'})).data;
   for(let i=0;data.processing_info&&data.processing_info.state!=='succeeded';i++){
    if(i>=3||data.processing_info.state==='failed')throw Error('Image processing did not finish');
    await new Promise(r=>setTimeout(r,Math.min(10000,Math.max(1,data.processing_info.check_after_secs||1)*1000)));checkTime();
    data=(await client.request('GET','/2/media/upload?media_id='+encode(data.id)+'&command=STATUS')).data;
   }
   const id=String(data.id);if(!/^\d+$/.test(id))throw Error('Invalid media response');
   await client.request('POST','/2/media/metadata',{id,metadata:{alt_text:{text:post.images[n].alt}}});ids.push(id);
  }
  checkTime();const result=await client.request('POST','/2/tweets',{text:post.text,media:{media_ids:ids}}),id=String(result.data?.id);if(!/^\d+$/.test(id))throw Error('Uncertain post result');
  await db.prepare("UPDATE x_four_posts SET status='sent',sent_at=?,post_id=? WHERE key=? AND status='posting'").bind(now(),id,slot.key).run();
  await db.prepare('DELETE FROM x_four_images WHERE post_key=?').bind(slot.key).run();return{key:slot.key,status:'sent',post_id:id};
 }catch(error){const message=/^(X API \d{3} \/2\/[a-z/]+|X connection failed; no automatic retry|X rejected the request|Wrong X posting account|Publication window expired|Prepared image is missing|Image processing did not finish|Invalid media response|Uncertain post result)$/.test(error.message)?error.message:'Publication failed; review before retrying';await db.prepare("UPDATE x_four_posts SET status='failed',error=? WHERE key=? AND status='posting'").bind(message,slot.key).run();throw Error(message)}
}
export async function dryRun(key,env){
 const post=await env.DB.prepare("SELECT due,meta FROM x_four_posts WHERE key=? AND status='ready'").bind(key).first();if(!post||post.due<=Date.now())fail(409,'Choose a future ready slot');
 // Exercise the real publisher and signature path without a database write or any X request.
 const db={prepare(sql){
  if(sql.startsWith("UPDATE x_four_posts SET status='posting'"))return env.DB.prepare("SELECT meta FROM x_four_posts WHERE key=? AND status='ready' AND due=?");
  if(/^(UPDATE|DELETE)/.test(sql))return{bind(){return this},async run(){return{}}};return env.DB.prepare(sql);
 }};
 const calls=[],ids=[],expected=JSON.parse(post.meta);
 const client=xClient(env,async(url,init)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(!init.headers.Authorization.startsWith('OAuth '))throw Error('No signature');
  const body=init.body?JSON.parse(init.body):null;
  if(path==='/2/media/upload'){
   if(typeof body?.media!=='string'||body.media_category!=='tweet_image')throw Error('Invalid serialized image upload');
   const id=String(calls.length);ids.push(id);return Response.json({data:{id}});
  }
  if(path==='/2/tweets'){
   if(body?.text!==expected.text||ids.length!==4||JSON.stringify(body.media)!==JSON.stringify({media_ids:ids})||Object.keys(body).length!==2)throw Error('Invalid serialized Post payload');
   return Response.json({data:{id:'0'}});
  }
  return Response.json({data:path==='/2/users/me'?{username:env.X_EXPECTED_USERNAME||'parade166'}:{}});
 });
 const result=await runScheduled(post.due,{...env,DB:db},{now:()=>post.due,client});if(result.status!=='sent'||calls.length!==10)throw Error('Dry run failed');return{ok:true,dry_run:true,key,images:4,x_requests:0};
}
export default{
 async fetch(request,env){try{
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET'){await env.DB.prepare('SELECT enabled FROM x_four_settings WHERE id=1').first();return json({ok:true,service:'nanpure-x-scheduler',version:2,configured:['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_TOKEN_SECRET'].every(k=>!!env[k])})}
  const expected=await queueToken(env),provided=request.headers.get('authorization')||'';
  if(await sha(provided)!==await sha('Bearer '+expected))fail(403,'Forbidden');
  const now=Date.now();
  if(path==='/state'&&request.method==='GET')return json(await state(env.DB));
  if(path==='/check'&&request.method==='POST'){const data=await xClient(env).request('GET','/2/users/me');if(data.data?.username?.toLowerCase()!==(env.X_EXPECTED_USERNAME||'parade166').toLowerCase())fail(409,'Wrong X posting account');return json({ok:true,username:data.data.username})}
  if(request.method!=='POST')fail(405,'Method not allowed');
  const v=await input(request,path==='/image'?1900000:800000);
  if(path==='/control')return json(await controls(v,env.DB,now));
  if(path==='/prepare')return json(await prepare(v,env.DB,now));
  if(path==='/image')return json(await image(v,env.DB,now));
  if(path==='/dry-run')return json(await dryRun(v.key,env));
  if(path==='/ready')return json(await ready(v,env.DB,now));
  fail(404,'Not found');
 }catch(e){return json({error:e instanceof Failure?e.message:'Scheduler request failed'},e instanceof Failure?e.status:503)}},
 async scheduled(controller,env){
  try{const result=await runScheduled(controller.scheduledTime,env);console.log(JSON.stringify(result))}
  finally{
   const now=Date.now();await env.DB.prepare("UPDATE x_four_posts SET status='expired' WHERE status IN ('ready','assembling') AND due<?").bind(now-MAX_LATENESS).run();
   await env.DB.prepare('DELETE FROM x_four_images WHERE post_key IN (SELECT key FROM x_four_posts WHERE due<?)').bind(now-7*86400000).run();
  }
 }
};
