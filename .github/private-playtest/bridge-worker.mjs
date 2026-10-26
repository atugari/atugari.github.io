// Temporary write-only inbox. It accepts authenticated encrypted files, never game source.
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
const encoder=new TextEncoder();
function reply(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});}
export default {
 async fetch(request,env){
  const url=new URL(request.url),parts=url.pathname.split('/');
  if(request.method!=='POST'||parts.length!==4||parts[1]!=='_release'||parts[2]!==env.RELEASE_ID)return reply({error:'準備中です。'},503);
  const key=request.headers.get('X-Upload-Key')||'';
  if(!/^[a-f0-9]{64}$/.test(key)||await digest(encoder.encode(key))!==env.UPLOAD_HASH)return reply({error:'Unauthorized'},401);
  const name=parts[3];if(!/^(payload-\d{3}\.bin|payload\.json|complete)$/.test(name))return reply({error:'Invalid path'},400);
  if(Number(request.headers.get('Content-Length'))>300000)return reply({error:'Too large'},413);
  const reader=request.body?.getReader();let length=0,chunks=[];
  if(reader)while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>300000){await reader.cancel();return reply({error:'Too large'},413);}chunks.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const sha=await digest(bytes);
  await env.DEPLOY_DB.prepare('INSERT INTO private_playtest_release_parts(release_id,path,data,sha) VALUES(?,?,?,?) ON CONFLICT(release_id,path) DO UPDATE SET data=excluded.data,sha=excluded.sha').bind(env.RELEASE_ID,name,btoa(binary),sha).run();
  return reply({ok:true,sha256:sha});
 }
};
