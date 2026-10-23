import{body,fail,hash,json,limit,newKey,validKey}from'./http.js';
const base='/owner/wado/',cookieName='__Secure-np-wado-owner',ttl=2*60*60*1000;
const assets=new Set(['player.js','player.css','wado-engine.js','wado-data.json','wado-licenses.txt']);
const cookie=(token,age)=>`${cookieName}=${token}; Path=${base}; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
function tokenOf(request){const entries=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));if(entries.length!==1)return null;const token=entries[0].slice(cookieName.length+1);return validKey(token)?token:null;}
async function session(request,env){const token=tokenOf(request);if(!token||!validKey(env.OWNER_KEY_HASH))return null;return env.DB.prepare('SELECT expires FROM wado_owner_sessions WHERE token_hash=? AND owner_hash=? AND expires>?').bind(await hash(token),env.OWNER_KEY_HASH,Date.now()).first();}
function secure(response,{inlineStyle=false}={}){const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Robots-Tag','noindex, nofollow, noarchive');headers.set('X-Frame-Options','DENY');headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'"+(inlineStyle?" 'unsafe-inline'":"")+"; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");return new Response(response.body,{status:response.status,headers});}
function login(message='',status=200){return secure(new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>漢字穴埋め・作者用試遊｜ナンプレ帳</title><style>body{margin:0;background:#f6f5ef;color:#20362d;font-family:system-ui,sans-serif;line-height:1.8}main{max-width:29rem;margin:9vh auto;padding:1.5rem}h1{font-size:1.7rem;line-height:1.4}small{color:#65716a}.card{background:#fffefa;border:1px solid #d8dfd5;border-radius:18px;padding:1.5rem;margin:1.5rem 0}label{display:block;font-weight:700}input,button{box-sizing:border-box;width:100%;font:inherit;border-radius:10px;padding:.8rem;margin:.5rem 0 1rem}input{border:1px solid #899b90}button{background:#285849;color:white;border:0;font-weight:700;cursor:pointer}a{color:#285849}#error{color:#a33422}input:focus,button:focus-visible,a:focus-visible{outline:3px solid #c17d26;outline-offset:3px}</style></head><body><main><small>ナンプレ帳 / 作者用試遊</small><h1>漢字穴埋めを試す</h1><p>作者だけが入れる試遊ページです。一般向けのプレイは、引き続き準備中です。</p><section class="card"><form method="post" action="${base}login"><label for="owner-key">管理用キー</label><input id="owner-key" name="key" type="password" autocomplete="off" spellcheck="false" required minlength="64" maxlength="64" aria-describedby="key-help" autocapitalize="none"><p id="key-help"><small>作者室で使っている管理用キーを入力してください。このページには保存しません。</small></p>${message?'<p id="error" role="alert">'+message+'</p>':''}<button type="submit">作者用の試遊を開く</button></form><small>認証は2時間で切れます。</small></section><a href="https://atugari.github.io/nanpure/">ナンプレ帳へ戻る</a></main></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8'}}),{inlineStyle:true});}
async function asset(env,url,path){if(!env.WADO_ASSETS)fail(503,'試遊ページの準備中です。少し待って開き直してください。');const assetURL=new URL('/'+path,url.origin),response=await env.WADO_ASSETS.fetch(new Request(assetURL));if(response.status!==200)fail(503,'試遊ページを読み込めませんでした。開き直してください。');return secure(response);}
export async function wadoOwner(request,env,url){
 const path=url.pathname;
 if(path==='/owner/wado'){if(request.method!=='GET')fail(405,'この操作は利用できません。');return secure(new Response(null,{status:303,headers:{Location:base}}));}
 if(request.method==='POST'){
  if(request.headers.get('origin')!==url.origin)fail(403,'作者用の試遊ページから操作してください。');
  if(path===base+'logout'){
   const token=tokenOf(request);if(token)await env.DB.prepare('DELETE FROM wado_owner_sessions WHERE token_hash=?').bind(await hash(token)).run();
   return secure(new Response(null,{status:303,headers:{Location:base,'Set-Cookie':cookie('',0)}}));
  }
  if(path!==base+'login')fail(405,'この操作は利用できません。');
  await limit(env.DB,request,'wado-owner-login',10,15*60*1000);
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))fail(400,'入力を確認してください。');
  const values=new URLSearchParams(new TextDecoder().decode(await body(request,512))),key=values.get('key');
  if(values.getAll('key').length!==1||!validKey(key)||!validKey(env.OWNER_KEY_HASH)||await hash(key)!==env.OWNER_KEY_HASH)return login('管理用キーを確認してください。',403);
  const token=newKey(),now=Date.now(),previous=tokenOf(request);
  await env.DB.batch([
   env.DB.prepare('DELETE FROM wado_owner_sessions WHERE expires<=? OR token_hash=?').bind(now,previous?await hash(previous):''),
   env.DB.prepare('INSERT INTO wado_owner_sessions(token_hash,owner_hash,created,expires) VALUES(?,?,?,?)').bind(await hash(token),env.OWNER_KEY_HASH,now,now+ttl)
  ]);
  return secure(new Response(null,{status:303,headers:{Location:base,'Set-Cookie':cookie(token,ttl/1000)}}));
 }
 const active=await session(request,env);
 if(path===base)return active?asset(env,url,'index.html'):login();
 if(!active)return secure(json({error:'作者認証が必要です。試遊ページを開き直してください。'},401));
 if(path===base+'session')return secure(json({ok:true,expires:active.expires}));
 const name=path.startsWith(base+'assets/')?path.slice((base+'assets/').length):'';
 if(!assets.has(name))fail(404,'ページがありません。');
 return asset(env,url,'assets/'+name);
}
