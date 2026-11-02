import {slotFromPuzzle,validCompletion} from './model.mjs';
export const KEY='np-gallery-key-v1',DRAFT='np-gallery-draft-v1';
export function ownerKey(){let k=localStorage.getItem(KEY);if(!/^[a-f0-9]{64}$/.test(k||'')){k=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');localStorage.setItem(KEY,k);}return k;}
export async function api(query='',data,key){
 const headers={};if(key)headers['X-Gallery-Key']=key;if(data)headers['Content-Type']='application/json';
 const origin=window.NPGalleryConfig?.apiOrigin||'https://puzzle-api.puzzle-hub-4826.workers.dev';
 let r;try{r=await fetch(origin+'/api/gallery'+query,{method:data?'POST':'GET',headers,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)})}catch{throw Error('展示室のサーバーに接続できませんでした。端末の下書きは残っています。通信を確認して再試行してください。');}
 let d;try{d=await r.json()}catch{throw Error('展示室のサーバーに接続できませんでした。下書きは端末に残っています。');}
 if(!r.ok)throw Object.assign(Error(d.error||'展示室を読み込めませんでした。'),{status:r.status});return d.gallery;
}
export function openExisting(name){return new Promise((resolve,reject)=>{let absent=false;const q=indexedDB.open(name);q.onupgradeneeded=()=>{absent=true;q.transaction.abort()};q.onsuccess=()=>{q.result.onversionchange=()=>q.result.close();resolve(q.result)};q.onerror=()=>absent?resolve(null):reject(q.error);});}
export async function decodeRecord(row){
 let p=row;
 if(row.compactVersion===1){
  const stream=new Blob([row.data]).stream().pipeThrough(new DecompressionStream('deflate')),reader=stream.getReader(),parts=[];let size=0;
  while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>800000){await reader.cancel();throw Error('この問題は大きすぎるため読み飛ばしました。');}parts.push(x.value);}
  p=JSON.parse(await new Blob(parts).text());if(p.uid!==row.uid)throw Error('保存した問題を照合できませんでした。');
 }
 for(const k of ['puzzle','solution','grid'])if(ArrayBuffer.isView(p[k]))p[k]=Array.from(p[k]);return p;
}
export async function savedPage(after=null){
 const db=await openExisting('nanpure-chou-data');if(!db||!db.objectStoreNames.contains('puzzles')){db?.close();let rows=[];try{rows=JSON.parse(localStorage.getItem('nanpure-chou-library-v2')||'[]')}catch{}return {rows:rows.slice(0,100),next:null};}
 const page=await new Promise((resolve,reject)=>{const rows=[],r=db.transaction('puzzles').objectStore('puzzles').openCursor(after?IDBKeyRange.lowerBound(after,true):null);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c)return resolve({rows,next:null});rows.push(c.value);if(rows.length===100)resolve({rows,next:c.key});else c.continue()};});db.close();
 const values=await Promise.allSettled(page.rows.map(decodeRecord));return {rows:values.filter(v=>v.status==='fulfilled').map(v=>v.value),next:page.next,skipped:values.filter(v=>v.status==='rejected').length};
}
export function recordSlot(p){if(!validCompletion(p))return null;try{return slotFromPuzzle(p,'clear',{at:p.video?.endedAt||p.completedAt||null})}catch{return null}}
export function journalDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('np-gallery-records-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('clears',{keyPath:'id'});r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>reject(r.error);});}
export async function addClear(data){
 if(data.game!=='sudoku'||data.valid!==true||data.auto||data.revealed||!data.puzzle)return;
 const p={...data.puzzle,solution:data.puzzle.solution||data.grid};let slot;try{slot=slotFromPuzzle(p,'clear',{elapsed:data.elapsed,at:Date.now(),hints:data.hints??null,errors:data.errors??null})}catch{return;}
 const shape=JSON.stringify([p.kind,p.n,p.puzzle,p.linked||null,p.regions||null]);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(shape)),id=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 const db=await journalDB();await new Promise((resolve,reject)=>{const tx=db.transaction('clears','readwrite'),store=tx.objectStore('clears');store.put({id,slot});const r=store.getAll();r.onsuccess=()=>{const rows=r.result.sort((a,b)=>b.slot.at-a.slot.at);for(const v of rows.slice(100))store.delete(v.id)};tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error)});db.close();
}
export async function clearRecords(){const db=await journalDB();try{return await new Promise((resolve,reject)=>{const r=db.transaction('clears').objectStore('clears').getAll();r.onsuccess=()=>resolve(r.result.map(v=>v.slot).sort((a,b)=>b.at-a.at));r.onerror=()=>reject(r.error)})}finally{db.close()}}
