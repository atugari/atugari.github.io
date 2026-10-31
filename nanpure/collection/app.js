import {readProblemPack,hashBytes,validCatalog} from './pack-reader.mjs?v=20261031-stock1';
import {lastPlayedTime,progressDate,nextProgress} from './progress-model.mjs?v=20261031-resume1';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const crossOnly=document.body?.dataset.collectionScope==='cross'||new URLSearchParams(location.search).get('scope')==='cross';
const selectCatalog=c=>({...c,configs:c.configs.filter(x=>crossOnly?x.kind==='cross':x.kind!=='cross')});
const scopeQuery=p=>{const q=new URLSearchParams();if(crossOnly)q.set('scope','cross');if(p)q.set('p',p);return location.pathname+(q.size?'?'+q:'')};
const labels={new:'未プレイ',playing:'途中',done:'クリア',revealed:'答えを確認'};
let catalog,db,progress=new Map(),page=0,active=null,bridge=null,busy=false,poll=null,epoch=0,renderEpoch=0,lastActivityAt=0,activityTimer=null,snapshotTail=Promise.resolve();
const indexes=new Map(),packs=new Map(),pending=new Map();
const idOf=n=>'P-'+String(n).padStart(6,'0'),numberOf=id=>/^P-\d{6}$/.test(id)?Number(id.slice(2)):0;
const cfgOf=n=>catalog.configs.find(c=>n>=c.start&&n<c.start+c.count),state=id=>progress.get(id)?.state||'new';
const kindKey=c=>c.kind,sizeKey=c=>[c.n,c.multiShape||c.linkedShape||'',c.complexity||''].join(':');
function say(text,player=false){$(player?'player-status':'notice').textContent=text;}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('nanpure-ready-100k-progress-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('progress',{keyPath:'id'});r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('別の問題集の画面を閉じてください。'))})}
function readProgress(){return new Promise((resolve,reject)=>{const r=db.transaction('progress').objectStore('progress').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function putProgress(value){return new Promise((resolve,reject)=>{const tx=db.transaction('progress','readwrite');tx.objectStore('progress').put(value);tx.oncomplete=()=>{progress.set(value.id,value);resolve()};tx.onerror=tx.onabort=()=>reject(tx.error||Error('進行状況を保存できませんでした。'))})}
function options(el,values,placeholder,empty=''){
 const old=el.value,previous=el.selectedOptions[0]?.textContent,available=values.some(([v])=>String(v)===old);
 // Keep an active condition when a search or progress update leaves no matches.
 // It stays selected but cannot be picked again from the list of valid choices.
 const unavailable=old&&old!==empty&&!available&&previous;
 el.innerHTML=`<option value="${esc(empty)}">${esc(placeholder)}</option>`+(unavailable?`<option value="${esc(old)}" disabled hidden>${esc(previous)}</option>`:'')+values.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');
 el.value=available||unavailable?old:empty;
}
const unique=rows=>[...new Map(rows).entries()];
function refreshFilters(){
 // Earlier steps always stay reachable. Only later steps depend on a choice.
 const kinds=unique(catalog.configs.map(c=>[kindKey(c),c.name]));
 options($('kind'),[['all','すべて'],...kinds],'ルールを選んでください');
 if(crossOnly&&!$('kind').value)$('kind').value='cross';
 const allKinds=$('kind').value==='all',rows=catalog.configs.filter(c=>allKinds||kindKey(c)===$('kind').value);
 const sizes=unique(rows.map(c=>[sizeKey(c),[...new Set([c.size,c.detail].filter(Boolean))].join(' · ')]));
 sizes.sort((a,b)=>Number(a[0].split(':')[0])-Number(b[0].split(':')[0])||a[1].localeCompare(b[1],'ja'));
 options($('size'),sizes,allKinds?'すべての大きさ・形':rows.length?'大きさ・形を選んでください':'先にルールを選んでください');
 if(!allKinds&&sizes.length===1&&!$('size').value)$('size').value=sizes[0][0];
 $('size').disabled=!rows.length;
 const sized=rows.filter(c=>allKinds&&!$('size').value||sizeKey(c)===$('size').value);
 options($('level'),unique(sized.map(c=>[String(c.level),allKinds?'Lv.'+String(c.level).padStart(2,'0'):c.difficulty])).sort((a,b)=>+a[0]-b[0]),sized.length?'すべての難易度':'先に大きさ・形を選んでください');
 $('level').disabled=!sized.length;
 options($('state'),Object.entries(labels),'すべて','all');
}
function scoped(){return catalog.configs.filter(c=>(!$('kind').value||$('kind').value==='all'||kindKey(c)===$('kind').value)&&(!$('size').value||sizeKey(c)===$('size').value)&&(!$('level').value||String(c.level)===$('level').value))}
function matching(){
 const q=$('search').value.trim().toUpperCase(),filter=$('state').value,result=[];
 for(const c of scoped())for(let n=c.start;n<c.start+c.count;n++){
  if(!q&&(!filter||filter==='all')){result.push(n);continue}
  const id=idOf(n);if((!q||id.includes(q))&&(!filter||filter==='all'||state(id)===filter))result.push(n);
 }
 if($('sort').value==='recent'){
  const times=new Map([...progress].map(([id,row])=>[numberOf(id),lastPlayedTime(row)]));
  result.sort((a,b)=>(times.get(b)||0)-(times.get(a)||0)||a-b);
 }
 return result;
}
function render(){if(!catalog)return;refreshFilters();const ready=$('kind').value==='all'||!!($('kind').value&&$('size').value),list=ready?matching():[];if(page*36>=list.length)page=0;$('summary').textContent=(crossOnly?'クロスてんびん':new Set(catalog.configs.map(c=>c.kind)).size+'ルール')+'・'+catalog.configs.reduce((n,c)=>n+c.count,0).toLocaleString()+'問。生成を待たずに遊べます。';$('count').textContent=ready?list.length.toLocaleString()+'問'+(list.length?' · '+(page*36+1)+'〜'+Math.min((page+1)*36,list.length)+'問目':''):'';$('cards').innerHTML=list.slice(page*36,(page+1)*36).map(n=>{const id=idOf(n),c=cfgOf(n),s=state(id),date=progressDate(progress.get(id));return `<button class="card" data-id="${id}" data-state="${s}"><span class="badge">${labels[s]}</span><strong class="title">${esc(c.name)}</strong><span>${esc([c.size,c.difficulty,c.detail].filter(Boolean).join(' · '))}</span><small>${id}</small>${date?`<time class="last-played" datetime="${date.iso}">${esc(date.text)}</time>`:s==='new'?'':'<small class="last-played">日時の記録なし</small>'}</button>`}).join('')||(ready?'<p>この条件の問題はありません。条件を変えて探してください。</p>':'<p class="choose-prompt">'+($('kind').value?'② 大きさ・形を選ぶと、問題が表示されます。':'① 遊びたいルールから選んでください。')+'</p>');$('more').hidden=list.length<=36;$('more').textContent=(page+1)*36<list.length?'次の36問':'最初の36問';$('quick').disabled=!ready||!list.length||busy;}
async function checkedJSON(file,meta){const r=await fetch(file,{cache:file==='catalog.json'?'no-cache':'default'});if(!r.ok)throw Error('問題一覧を取得できませんでした。通信を確認してください。');const bytes=await r.arrayBuffer();if(meta){const hash=await hashBytes(bytes);if(bytes.byteLength!==meta.bytes||hash!==meta.sha256)throw Error('問題一覧を照合できませんでした。')}return JSON.parse(new TextDecoder().decode(bytes));}
async function getIndex(c){if(!indexes.has(c.cid)){const task=checkedJSON(c.index.file,c.index).then(x=>{if(x.key!==c.key||!Array.isArray(x.packs)||x.packs.reduce((s,p)=>s+p.count,0)!==c.count)throw Error('問題一覧の内容が一致しません。');return x}).catch(e=>{indexes.delete(c.cid);throw e});indexes.set(c.cid,task);}return indexes.get(c.cid);}
async function getRecord(n){const c=cfgOf(n);if(!c)throw Error('問題番号が見つかりません。');const index=await getIndex(c),descriptor=index.packs.find(p=>n>=p.first&&n<p.first+p.count);if(!descriptor)throw Error('問題ファイルが見つかりません。');const file=descriptor.file;
 if(!packs.has(file)){if(!pending.has(file)){const task=(async()=>{const response=await fetch(file);if(!response.ok)throw Error('問題を取得できませんでした。通信を確認してください。');const bytes=Uint8Array.from(atob((await response.text()).trim()),x=>x.charCodeAt(0));const rows=await readProblemPack(bytes,{...descriptor,key:c.key,ids:Array.from({length:descriptor.count},(_,i)=>idOf(descriptor.first+i))});packs.set(file,rows);while(packs.size>3)packs.delete(packs.keys().next().value);return rows})();pending.set(file,task);task.finally(()=>pending.delete(file)).catch(()=>{});}const rows=await pending.get(file);return rows.find(x=>x.id===idOf(n));}
 const rows=packs.get(file);packs.delete(file);packs.set(file,rows);return rows.find(x=>x.id===idOf(n));
}
async function loadBridge(){if(bridge)return bridge;const frame=$('game');frame.src='player.html?v=20261101-comfort1';const start=Date.now();return new Promise((resolve,reject)=>{const timer=setInterval(()=>{try{const b=frame.contentWindow?.NPCollectionBridge;if(b){clearInterval(timer);const d=frame.contentDocument,css=d.createElement('link'),script=d.createElement('script');bindActivity(d);css.rel='stylesheet';css.href='/nanpure/collection/workspace.css?v=20261101-comfort1';script.src='/nanpure/collection/workspace.js?v=20261101-comfort1';const styled=new Promise((done,fail)=>{css.onload=done;css.onerror=()=>fail(Error('盤面の表示設定を読み込めませんでした。開き直してください。'))});script.onload=()=>styled.then(()=>{bridge=b;resolve(b)},reject);script.onerror=()=>reject(Error('盤面の表示機能を読み込めませんでした。開き直してください。'));d.head.append(css,script)}else if(Date.now()-start>30000){clearInterval(timer);reject(Error('プレイ画面を読み込めませんでした。通信と端末の空き容量を確認してください。'))}}catch(e){clearInterval(timer);reject(e)}},100)})}
function snapshot(flush=true){
 const n=active,b=bridge;if(!n||!b)return Promise.resolve();
 const work=async()=>{
  if(flush)await b.flush();if(active!==n||bridge!==b)return;
  const p=b.current();if(!p||p.id!=='ready100k-'+idOf(n))return;
  const s=p.revealed?'revealed':p.done?'done':'playing';
  const value=nextProgress(progress.get(idOf(n)),idOf(n),s,lastActivityAt);
  if(value)await putProgress(value);
 };
 const job=snapshotTail.then(work,work);snapshotTail=job.catch(()=>{});return job;
}
function recordActivity(event){
 if(!event.isTrusted||!active||!bridge)return;
 lastActivityAt=Date.now();clearTimeout(activityTimer);
 activityTimer=setTimeout(()=>snapshot(false).catch(e=>say(e.message,true)),250);
}
function bindActivity(doc){for(const type of ['pointerdown','keydown','input','change'])doc.addEventListener(type,recordActivity,{capture:true});}

function nextNumber(n){const c=cfgOf(n);if(!c)return null;const segments=catalog.configs.filter(x=>x.key===c.key).sort((a,b)=>a.start-b.start);for(const segment of segments)for(let k=Math.max(segment.start,n+1);k<segment.start+segment.count;k++)if(state(idOf(k))==='new')return k;for(const segment of segments)for(let k=segment.start;k<Math.min(segment.start+segment.count,n);k++)if(state(idOf(k))==='new')return k;return null;}
async function prefetch(token){if(!$('background').checked||!active||document.hidden)return;const n=nextNumber(active);if(!n)return;try{await getRecord(n);if(token===epoch&&active)say('次の問題も読み込み済みです。',true)}catch{if(token===epoch&&active)say('次の問題の先読みはできませんでした。今の問題は続けられます。',true)}}
async function play(n){if(busy)return;busy=true;const token=++epoch;clearInterval(poll);$('next').disabled=true;try{await snapshot();const record=await getRecord(n);$('library').hidden=true;$('player').hidden=false;say('問題を開いています…',true);const b=await loadBridge();await b.open(record.puzzle,'number');active=n;lastActivityAt=Date.now();await snapshot(false);const c=cfgOf(n);$('playing-title').textContent=idOf(n)+' · '+c.name+' · '+c.difficulty;history.replaceState(null,'',scopeQuery(idOf(n)));say('途中の状態は、このブラウザに保存します。',true);poll=setInterval(()=>snapshot(false).catch(e=>say(e.message,true)),5000);setTimeout(()=>prefetch(token),1000)}catch(e){say(e.message,true);if(!active){$('library').hidden=false;$('player').hidden=true;say(e.message)}}finally{busy=false;$('next').disabled=false;render()}}
async function leave(){if(busy)return;busy=true;try{await snapshot();epoch++;clearInterval(poll);clearTimeout(activityTimer);active=null;bridge=null;$('game').src='about:blank';$('player').hidden=true;$('library').hidden=false;history.replaceState(null,'',scopeQuery());say('途中の状態を保存しました。')}catch(e){say(e.message,true)}finally{busy=false;render()}}
$('cards').onclick=e=>{const b=e.target.closest('[data-id]');if(b)void play(numberOf(b.dataset.id))};
for(const id of ['kind','size','level','state','sort'])$(id).onchange=()=>{if(id==='kind'){$('size').value='';$('level').value=''}if(id==='size')$('level').value='';page=0;render()};
$('search').oninput=()=>{const token=++renderEpoch;setTimeout(()=>{if(token===renderEpoch){page=0;render()}},120)};
$('more').onclick=()=>{page=(page+1)*36<matching().length?page+1:0;render();$('cards').scrollIntoView({block:'start'})};
$('quick').onclick=()=>{const list=matching(),n=list.find(n=>state(idOf(n))==='playing')||list.find(n=>state(idOf(n))==='new')||list[0];if(n)void play(n)};
$('back').onclick=()=>void leave();$('next').onclick=async()=>{if(!active||busy)return;try{await snapshot();const n=nextNumber(active);if(n)void play(n);else say('この条件の未プレイ問題はありません。問題集で別の条件を選べます。',true)}catch(e){say(e.message,true)}};
$('background').onchange=()=>{try{localStorage.setItem('nanpure-ready100k-prefetch',String($('background').checked))}catch{}if($('background').checked)void prefetch(epoch)};
document.addEventListener('visibilitychange',()=>{if(document.hidden)void snapshot().catch(()=>{});else if(active){void snapshot(false).catch(()=>{});void prefetch(epoch)}});window.addEventListener('pagehide',()=>{try{$('game').contentWindow?.appPause?.()}catch{}void snapshot(false).catch(()=>{});});
try{const loaded=await Promise.all([openDB(),checkedJSON('catalog.json')]);db=loaded[0];catalog=loaded[1];if(!validCatalog(catalog))throw Error('問題一覧を読み込めませんでした。');catalog=selectCatalog(catalog);if(crossOnly){document.title='クロスてんびん問題集｜パレあそび';const home=document.querySelector('#library header a');if(home){home.href='/plaza.html';home.textContent='‹ パレあそび'}const title=document.querySelector('#library h1');if(title)title.textContent='クロスてんびん問題集';}progress=new Map((await readProgress()).map(p=>[p.id,p]));try{$('background').checked=localStorage.getItem('nanpure-ready100k-prefetch')!=='false'}catch{}render();const requested=new URLSearchParams(location.search).get('p');if(requested){const n=numberOf(requested);if(cfgOf(n))void play(n);else if(!crossOnly&&loaded[1].configs.some(c=>c.kind==='cross'&&n>=c.start&&n<c.start+c.count))location.replace('/puzzles/cross/stock/?p='+encodeURIComponent(requested));else say('その問題番号は見つかりませんでした。')}}catch(e){say(e.message);$('summary').textContent='問題集を開けませんでした';$('quick').disabled=true;}
