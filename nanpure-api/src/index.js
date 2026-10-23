import{Problem,json,siteOrigin,fail}from'./http.js';
import{daily,ranking,archive}from'./daily.js';
import{contact,contactImage,admin}from'./contact.js';
import{cloud}from'./cloud.js';
import{importLegacy}from'./import.js';
import{visit,overview,apiVersion}from'./owner.js';
import{wadoWeb}from'./wado-web.js';
import{wadoOwner}from'./wado-owner.js';
const tables=['attempts','daily_stock','daily_assignments','daily_maintenance','inquiries','cloud_saves','rate_limits','contact_images','cloud_uploads','cloud_chunks','visit_sessions','visit_browsers','visit_days','owner_usage_snapshots','wado_owner_sessions'];
export default {async fetch(request,env){let response;const url=new URL(request.url),origin=request.headers.get('origin');
 try{
  if(origin!==null&&origin!==siteOrigin&&origin!==url.origin)fail(403,'送信元を確認できません。');
  if(request.method==='OPTIONS'){
   const method=request.headers.get('access-control-request-method'),headers=(request.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
   if(!['GET','POST'].includes(method)||headers.some(h=>!['content-type','x-nanpure-key','x-cloud-key','x-contact-key','authorization'].includes(h)))fail(405,'この操作は利用できません。');
   response=new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Nanpure-Key, X-Cloud-Key, X-Contact-Key, Authorization','Access-Control-Max-Age':'600'}});
  }else{
   if(!['GET','POST'].includes(request.method))fail(405,'この操作は利用できません。');
   if(request.method==='POST'&&!origin)fail(403,'送信元を確認できません。');
   if(!env.DB)fail(503,'サーバーに接続できません。');
   if(url.pathname==='/owner/wado'||url.pathname.startsWith('/owner/wado/'))response=await wadoOwner(request,env,url);
   else if(url.pathname==='/'||url.pathname==='/api/health'){
    if(request.method!=='GET')fail(405,'この操作は利用できません。');
    const rows=await env.DB.prepare('SELECT name FROM sqlite_master WHERE type=?').bind('table').all();const names=new Set(rows.results.map(r=>r.name));
    response=json({ok:true,service:'puzzle-api',version:apiVersion,siteVersion:env.SITE_VERSION||null,database:'connected',schema:tables.every(t=>names.has(t))?'installed':'pending',gameApi:'ready'});
   }else if(url.pathname==='/api/wado/web-search')response=await wadoWeb(request,env);
   else if(url.pathname==='/api/daily')response=await daily(request,env.DB);
   else if(url.pathname==='/api/ranking'&&request.method==='GET')response=await ranking(url,env.DB,request);
   else if(url.pathname==='/api/daily/archive'&&request.method==='GET')response=await archive(url,env.DB);
   else if(url.pathname==='/api/contact')response=await contact(request,env,url);
   else if(url.pathname==='/api/contact/image'&&request.method==='GET')response=await contactImage(request,env,url);
   else if(url.pathname==='/api/cloud')response=await cloud(request,env.DB,url);
   else if(url.pathname==='/api/admin')response=await admin(request,env);
   else if(url.pathname==='/api/admin/import'&&request.method==='POST')response=await importLegacy(request,env);
   else if(url.pathname==='/api/visits')response=await visit(request,env);
   else if(url.pathname==='/api/owner/overview')response=await overview(request,env);
   else fail(404,'ページがありません。');
  }
 }catch(error){response=json({error:error instanceof Problem?error.message:'通信できませんでした。少し待って再試行してください。'},error instanceof Problem?error.status:503)}
 const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Vary','Origin');if(origin===siteOrigin)headers.set('Access-Control-Allow-Origin',siteOrigin);
 return new Response(response.body,{status:response.status,headers});
}};
