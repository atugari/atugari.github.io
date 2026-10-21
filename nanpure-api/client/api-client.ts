export const apiOrigin='https://puzzle-api.puzzle-hub-4826.workers.dev';
export const syncStorage='np-cloud-sync-key-v1';
const valid=(key:string|null):key is string=>!!key&&/^[a-f0-9]{64}$/.test(key);
export function randomKey(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')}
export function storedKey(name:string){let key=localStorage.getItem(name);if(!valid(key)){key=randomKey();localStorage.setItem(name,key)}return key}
export function useSyncCode(code:string){const key=code.trim().replace(/^NP1-/,'').replace(/\s/g,'').toLowerCase();if(!valid(key))throw Error('引き継ぎコードを確認してください。');localStorage.setItem(syncStorage,key)}
export async function apiFetch(path:string,init:RequestInit={}){
 if(!path.startsWith('/api/'))throw Error('Invalid API path');
 const headers=new Headers(init.headers);headers.set('X-Nanpure-Key',storedKey('np-api-device-v1'));
 if(path.startsWith('/api/cloud'))headers.set('X-Cloud-Key',storedKey(syncStorage));
 if(path.startsWith('/api/admin')||path.startsWith('/api/contact/image')){const owner=sessionStorage.getItem('np-owner-key');if(valid(owner))headers.set('Authorization','Bearer '+owner)}
 return fetch(apiOrigin+path,{...init,headers,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
}
export async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('')}
export async function apiJSON(path:string,data?:unknown){const r=await apiFetch(path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'通信できませんでした。'),{status:r.status});return d}
