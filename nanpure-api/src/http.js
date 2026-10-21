export const siteOrigin='https://atugari.github.io';
export class Problem extends Error {constructor(status,message){super(message);this.status=status}}
export const fail=(status,message)=>{throw new Problem(status,message)};
export const json=(data,status=200)=>Response.json(data,{status});
export async function body(request,limit=20000){
 if(Number(request.headers.get('content-length'))>limit)fail(413,'入力が長すぎます。');
 const reader=request.body?.getReader();if(!reader)fail(400,'入力を確認してください。');let total=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();fail(413,'入力が長すぎます。')}chunks.push(value)}
 const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}return bytes;
}
export async function input(request,limit){let v;try{v=JSON.parse(new TextDecoder().decode(await body(request,limit)))}catch(e){if(e instanceof Problem)throw e;fail(400,'入力を確認してください。')}if(!v||typeof v!=='object'||Array.isArray(v))fail(400,'入力を確認してください。');return v}
export async function hash(value){const data=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('')}
export const newKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const validKey=k=>typeof k==='string'&&/^[a-f0-9]{64}$/.test(k);
export async function identity(request,header='x-nanpure-key',required=true){const key=request.headers.get(header);if(!validKey(key)){if(required)fail(401,'この画面を開き直してください。');return null}return hash(header+':'+key)}
export async function owner(request,env){const token=request.headers.get('authorization')?.replace(/^Bearer /,'');return validKey(token)&&validKey(env.OWNER_KEY_HASH)&&await hash(token)===env.OWNER_KEY_HASH}
export async function limit(db,request,scope,max,windowMs){
 const ip=request.headers.get('cf-connecting-ip')||'local';const key=scope+':'+await hash(ip)+':'+Math.floor(Date.now()/windowMs);
 const r=await db.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(key,Date.now()+windowMs*2,max).first();
 if(!r)fail(429,'続けて操作する場合は少しお待ちください。');
}
export function camel(row){return Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]))}
