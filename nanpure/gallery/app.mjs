import {emptyRoom,cleanRoom,cleanSlot,slotFromPuzzle,duration,MAX_BYTES} from './model.mjs';
import {api,ownerKey,KEY,DRAFT,savedPage,recordSlot,clearRecords} from './data.mjs';
const $=id=>document.getElementById(id),roomId=new URLSearchParams(location.search).get('room'),visitor=!!roomId;
let room=emptyRoom(),published=false,revision=0,savedId='',busy=false,dirty=false,slotIndex=0,saved=[],next=null,pageLoaded=false,tab='saved',records=[],titles=[],opener=null,pendingCandidate=null,loadToken=0;
function say(s){$('status').textContent=s}
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el}
function button(text,fn,cls){const b=node('button',text,cls);b.type='button';b.onclick=fn;return b}
function show(dialog){opener=document.activeElement;dialog.showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{if(opener?.isConnected)opener.focus()}));
function persist(){if(visitor)return;try{localStorage.setItem(DRAFT,JSON.stringify({room,published,revision,id:savedId,dirty}));return true}catch{say('端末の下書きを保存できませんでした。引き継ぎファイルを保存してください。');return false}}
function changed(){dirty=true;persist();render()}
const kindNames={normal:'ナンプレ',jigsaw:'ジグソー',killer:'キラー',multi:'マルチ',samurai:'サムライ',linked:'マルチ',diagonal:'対角線',hyper:'ハイパー',antiknight:'アンチナイト',neighbor:'おとなり',nonconsecutive:'おとなり',thermo:'温度計',arrow:'矢印',renban:'連番',sandwich:'サンドイッチ',kropki:'クロプキ',clone:'クローン',doubleArrow:'ダブル矢印',doubleSandwich:'ダブルサンドイッチ',palindrome:'回文',skyscraper:'ビルディング',slowThermo:'スロー温度計',step:'ステップ',twinKiller:'双子キラー',whisper:'ウィスパー'};
function description(s){if(s.type==='title')return '獲得した称号 · '+s.titleId;const p=s.record;return `${kindNames[p.kind]||p.kind} · ${p.n}×${p.n}${p.level?' · 難易度 '+p.level:''}`;}
function board(canvas,p,complete=false,large=false){
 const dim=large?1800:420;canvas.width=dim;canvas.height=dim;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${p.n}×${p.n}の${complete?'完成した盤面':'問題の見本'}`);const c=canvas.getContext('2d');if(!c)return;
 c.fillStyle='#fff';c.fillRect(0,0,dim,dim);const linked=p.linked?.cells&&p.linked?.boards?p.linked:null,W=linked?.width||p.n,H=linked?.height||p.n,unit=(dim-16)/Math.max(W,H),ox=(dim-unit*W)/2,oy=(dim-unit*H)/2,values=complete?p.solution:p.puzzle;
 const cells=linked?.cells||Array.from({length:values.length},(_,i)=>({x:i%p.n,y:Math.floor(i/p.n)}));
 c.textAlign='center';c.textBaseline='middle';c.font=`${Math.max(2,unit*.57)}px system-ui`;
 for(let i=0;i<cells.length;i++){const pos=cells[i],x=ox+pos.x*unit,y=oy+pos.y*unit;c.fillStyle=i%2?'#fff':'#fdfcf7';c.fillRect(x,y,unit,unit);c.strokeStyle='#c8c8bd';c.lineWidth=Math.max(.35,unit*.012);c.strokeRect(x,y,unit,unit);if(values[i]){c.fillStyle=complete&&!p.puzzle[i]?'#316752':'#303b32';c.fillText(String(values[i]),x+unit/2,y+unit*.53);}}
 c.strokeStyle='#444c42';c.lineWidth=Math.max(.8,unit*.045);
 if(linked){for(const b of linked.boards)c.strokeRect(ox+b.x*unit,oy+b.y*unit,b.n*unit,b.n*unit)}else{
  const br=p.blockRows||Math.floor(Math.sqrt(p.n)),bc=p.blockCols||(p.n/br);
  if(p.regions?.length===values.length){for(let i=0;i<values.length;i++){const x=i%p.n,y=Math.floor(i/p.n);if(x===0||p.regions[i]!==p.regions[i-1]){c.beginPath();c.moveTo(ox+x*unit,oy+y*unit);c.lineTo(ox+x*unit,oy+(y+1)*unit);c.stroke()}if(y===0||p.regions[i]!==p.regions[i-p.n]){c.beginPath();c.moveTo(ox+x*unit,oy+y*unit);c.lineTo(ox+(x+1)*unit,oy+y*unit);c.stroke()}}}
  else if(Number.isInteger(bc)&&br*bc===p.n){for(let r=0;r<=p.n;r+=br){c.beginPath();c.moveTo(ox,oy+r*unit);c.lineTo(ox+p.n*unit,oy+r*unit);c.stroke()}for(let col=0;col<=p.n;col+=bc){c.beginPath();c.moveTo(ox+col*unit,oy);c.lineTo(ox+col*unit,oy+p.n*unit);c.stroke()}}
  c.strokeRect(ox,oy,p.n*unit,p.n*unit);
 }
}
function drawTitle(host,s){const el=node('div',undefined,'title-emblem');el.append(node('div','✦'),node('strong',s.title));el.style.fontSize='18px';host.append(el)}
function render(){
 document.body.dataset.theme=room.theme;document.body.dataset.frame=room.frame;$('room-name').textContent=room.name;$('room-bio').textContent=room.bio;
 document.title=room.name+'｜展示室（制作中）・ナンプレ帳';$('room-state').textContent=visitor?'公開されている展示室':(published?'URLで公開':'自分だけの展示室')+(dirty?' · 未保存の変更あり':'');
 $('owner-tools').hidden=visitor;$('owner-notes').hidden=visitor;$('unpublish').disabled=busy||!savedId;$('save').disabled=busy;$('share').disabled=busy||!savedId||!published||dirty;
 $('main').setAttribute('aria-busy',String(busy));$('wall').replaceChildren();
 room.slots.forEach((s,i)=>{
  const item=node('article',undefined,'exhibit'+(i===0?' featured':'')+(!s?' empty':''));if(i===0)item.append(node('div','MY FAVORITE · 特別なひと枠','spotlight'));
  const frame=node('div',undefined,'frame');item.append(frame);
  if(!s){frame.append(node('span','＋','plus'),node('span',i===0?'一番のお気に入りを飾る':'好きなものを飾る'));if(!visitor){frame.role='button';frame.tabIndex=0;frame.setAttribute('aria-label',`${i+1}番目の枠に飾る`);frame.onclick=()=>pick(i);frame.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();pick(i)}}}}
  else{
   if(s.type==='title')drawTitle(frame,s);else{const canvas=node('canvas');frame.append(canvas);board(canvas,s.record,s.type==='clear');}
   frame.role='button';frame.tabIndex=0;frame.setAttribute('aria-label',s.title+'を見る');frame.onclick=()=>details(i);frame.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();details(i)}};
   const plaque=node('div',undefined,'plaque');plaque.append(node('strong',s.title),node('span',description(s),'meta'));
   if(s.type==='clear')plaque.append(node('span',duration(s.elapsed)+' · 端末のクリア記録','meta'));
   else if(s.type==='puzzle')plaque.append(node('span',s.origin==='created'?'自作・保存した問題':'お気に入りの問題','meta'));
   if(s.caption)plaque.append(node('p',s.caption));if(s.credit){const a=node('a',s.credit.name+'の展示室');a.href='?room='+s.credit.id;plaque.append(a)}item.append(plaque);
   if(!visitor){const actions=node('div',undefined,'slot-controls');actions.append(button('飾り方を変える',()=>details(i)),button('入れ替える',()=>pick(i)));if(i>0)actions.append(button('中央に飾る',()=>swap(i,0)));if(i>1)actions.append(button('前へ',()=>swap(i,i-1)));if(i<6&&i>0)actions.append(button('次へ',()=>swap(i,i+1)));item.append(actions);}
  }
  $('wall').append(item);
 });
 if(visitor)$('room-note').textContent='気になる問題は、作品を押して遊べます。';
}
function swap(a,b){[room.slots[a],room.slots[b]]=[room.slots[b],room.slots[a]];changed()}
function choose(s){room.slots[slotIndex]=cleanSlot(s);$('picker').close();pendingCandidate=null;changed();say('枠に飾りました。「展示室を保存する」で反映できます。')}
async function pick(i){slotIndex=i;show($('picker'));await pickTab(pendingCandidate?'incoming':tab)}
async function loadSaved(){const page=await savedPage(next);saved.push(...page.rows);next=page.next;pageLoaded=true;if(page.skipped)$('pick-status').textContent=page.skipped+'件の問題を読み飛ばしました。元の保存データは変更していません。';}
async function loadTitles(){if(titles.length)return;const state=JSON.parse(localStorage.getItem('np-achievements-v1')||'null');if(!state?.earned)return;const version=await fetch('/nanpure/version.json',{cache:'no-cache'}).then(r=>r.json());if(!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version.version))throw Error('称号の一覧を読み込めませんでした。');await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`/nanpure/releases/${version.version}/achievements-catalog.js`;s.onload=resolve;s.onerror=reject;document.head.append(s)});titles=(window.NPAchievementCatalog?.rows||[]).filter(v=>state.earned[v.id]).map(v=>({type:'title',title:v.name,titleId:v.id,caption:''}));}
async function pickTab(value){
 tab=value;const token=++loadToken;$('pick-list').replaceChildren();$('pick-status').textContent='飾れるものを読み込んでいます…';$('more').hidden=true;
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===tab)));
 try{
  if(['saved','favorites','clears'].includes(tab)&&!pageLoaded)await loadSaved();
  if(tab==='clears')records=await clearRecords();if(tab==='titles')await loadTitles();if(token!==loadToken)return;
  let options=tab==='incoming'?[pendingCandidate]:tab==='titles'?titles:tab==='clears'?[...records,...saved.map(recordSlot).filter(Boolean)]:saved.filter(p=>tab!=='favorites'||p.favorite).map(p=>{try{return slotFromPuzzle(p,tab==='favorites'?'favorite':'created')}catch{return null}}).filter(Boolean);
  options=options.filter(Boolean);const dedup=new Set();options=options.filter(s=>{const key=JSON.stringify([s.type,s.titleId,s.record?.kind,s.record?.puzzle,s.elapsed]);if(dedup.has(key))return false;dedup.add(key);return true});
  $('pick-status').textContent=options.length?`${options.length}件から選べます。`:(tab==='titles'?'この端末に獲得済みの称号がありません。':tab==='clears'?'飾れるクリア記録はまだありません。問題をクリアすると追加されます。':'この範囲に問題がありません。ナンプレ帳で作成・保存するか、次の100件を読み込んでください。');
  for(const s of options){const b=button('',()=>choose(s),'pick-item');if(s.record){const canvas=node('canvas');b.append(canvas);board(canvas,s.record,s.type==='clear');}const text=node('span');text.append(node('strong',s.title),node('small',description(s)+(s.type==='clear'?' · '+duration(s.elapsed):'')));b.append(text);$('pick-list').append(b);}
  $('more').hidden=!next||!['saved','favorites','clears'].includes(tab);
 }catch(e){$('pick-status').textContent=e.message||'読み込めませんでした。もう一度お試しください。';}
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>pickTab(b.dataset.tab));
$('more').onclick=async()=>{const b=$('more');b.disabled=true;try{await loadSaved();await pickTab(tab)}catch(e){$('pick-status').textContent=e.message}finally{b.disabled=false}};
function details(i){
 const s=room.slots[i],body=$('detail-body');$('detail-title').textContent=s.title;body.replaceChildren();
 if(s.record){const box=node('div'),canvas=node('canvas',undefined,'detail-preview');box.append(canvas);board(canvas,s.record,s.type==='clear',true);body.append(box);body.append(button('盤面を大きく見る',()=>{const expanded=canvas.style.width==='1800px';canvas.style.width=expanded?'':'1800px';canvas.style.maxWidth=expanded?'':'none';box.style.overflow=expanded?'':'auto';}));}
 const table=node('table',undefined,'preview-table');for(const [k,v] of [['種類',description(s)],...(s.type==='clear'?[['タイム',duration(s.elapsed)],['クリア日時',s.at?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(s.at)+'（日本時間）':'日時の記録なし'],['ヒント',s.hints===null?'記録なし':s.hints+'回'],['間違い',s.errors===null?'記録なし':s.errors+'回']]:[])]){const tr=node('tr');tr.append(node('td',k),node('td',v));table.append(tr)}body.append(table);
 if(s.type==='clear')body.append(node('p','この端末に記録されたクリアです。公式ランキングの認定記録ではありません。','hint'));
 if(s.record)body.append(node('p','見本は数字と枠を中心に表示しています。追加ルールの印はプレイ画面で確認できます。','hint'));
 if(!visitor){
  const title=node('label','作品の題名'),name=node('input');name.value=s.title;name.maxLength=60;name.required=true;title.append(name);const caption=node('label','添えるひと言'),input=node('textarea');input.value=s.caption;input.maxLength=180;caption.append(input);body.append(title,caption);
  const actions=node('div',undefined,'detail-actions');actions.append(button('題名とひと言を変更する',()=>{if(!name.value.trim())return name.reportValidity();s.title=name.value.trim();s.caption=input.value.trim();changed();$('detail').close()}));actions.append(button('この枠から外す',()=>{room.slots[i]=null;changed();$('detail').close()}));body.append(actions);
 }else if(s.record)body.append(button('この問題を自分の展示室に飾る',()=>{const pick={...s,type:'puzzle',origin:'favorite',caption:'',credit:{id:roomId,name:room.name}};sessionStorage.setItem('np-gallery-pick-v1',JSON.stringify(cleanSlot(pick)));location.href='/nanpure/gallery/';}));
 if(s.record)body.append(button('この問題を遊ぶ',()=>play(s.record),'primary'));
 show($('detail'));
}
$('edit-room').onclick=()=>{const f=$('room-form');for(const key of ['name','bio','theme','frame'])f.elements[key].value=room[key];f.elements.published.checked=published;show($('editor'))};
$('room-form').onsubmit=e=>{e.preventDefault();const f=e.target;room={...room,name:f.elements.name.value.trim(),bio:f.elements.bio.value.trim(),theme:f.elements.theme.value,frame:f.elements.frame.value};published=f.elements.published.checked;$('editor').close();changed()};
async function save(){if(busy)return;let clean;try{clean=cleanRoom(room)}catch(e){say(e.message);return}busy=true;render();say('展示室を保存しています…');try{const value=await api('',{action:'save',expected:revision,published,room:clean},ownerKey());room=value.room;revision=value.revision;savedId=value.id;published=value.published;dirty=false;persist();say(published?'展示室を保存して公開しました。共有ボタンから紹介できます。':'展示室を非公開で保存しました。');}catch(e){say(e.message||'保存できませんでした。下書きは端末に残っています。')}finally{busy=false;render()}}
$('save').onclick=save;
$('unpublish').onclick=async()=>{if(busy||!savedId)return;busy=true;render();try{const value=await api('',{action:'unpublish',expected:revision},ownerKey());revision=value.revision;published=false;dirty=true;persist();say('公開を取り下げました。編集中の内容は端末に残しています。');}catch(e){say(e.message)}finally{busy=false;render()}};
$('reload').onclick=async()=>{if(busy)return;busy=true;render();try{const value=await api('?mine=1',null,ownerKey());if(!value){say('サーバーにはまだ展示室がありません。');return;}if(dirty){download('展示室_編集中の下書き.json',{format:'nanpure-gallery-draft',room,published});}room=value.room;revision=value.revision;savedId=value.id;published=value.published;dirty=false;persist();say('最新の展示室を読み込みました。変更があった下書きはファイルとして保存しました。');}catch(e){say(e.message)}finally{busy=false;render()}};
$('share').onclick=()=>{if(!savedId||!published||dirty)return;const url=new URL('?room='+savedId,location.href).href,body=$('detail-body');$('detail-title').textContent='展示室を共有する';body.replaceChildren();const input=node('input');input.value=url;input.readOnly=true;input.setAttribute('aria-label','公開する展示室のURL');body.append(input);const actions=node('div',undefined,'detail-actions');for(const [label,href]of [['Xで紹介する','https://x.com/intent/tweet?text='+encodeURIComponent(room.name)+'&url='+encodeURIComponent(url)],['LINEで紹介する','https://line.me/R/share?text='+encodeURIComponent(room.name+'\n'+url)]]){const a=node('a',label,'file-button');a.href=href;a.target='_blank';a.rel='noopener noreferrer';actions.append(a)}const status=node('p',undefined,'hint');actions.append(button('URLをコピーする',async()=>{try{await navigator.clipboard.writeText(url);status.textContent='URLをコピーしました。'}catch{input.select();status.textContent='URLを選択しました。コピーして貼り付けてください。'}}));if(navigator.share)actions.append(button('ほかのアプリへ共有する',async()=>{try{await navigator.share({title:room.name,url})}catch(e){if(e.name!=='AbortError')status.textContent='共有できませんでした。URLのコピーをお試しください。'}}));body.append(actions,status);show($('detail'));};
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=node('a');a.download=name;a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('recovery').onclick=()=>show($('transfer'));
$('export').onclick=()=>{try{download('ナンプレ帳_展示室の引き継ぎ.json',{format:'nanpure-gallery-transfer',version:1,key:ownerKey(),room,published,revision,id:savedId,dirty});$('transfer-status').textContent='引き継ぎファイルを保存しました。秘密のキーが含まれるので、大切に保管してください。';}catch(e){$('transfer-status').textContent=e.message}};
$('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>MAX_BYTES+12000)throw Error('ファイルが大きすぎます。');const value=JSON.parse(await file.text());if(value.format!=='nanpure-gallery-transfer'||value.version!==1||!/^[a-f0-9]{64}$/.test(value.key||''))throw Error('展示室の引き継ぎファイルを選んでください。');const draft=cleanRoom(value.room),current=await api('?mine=1',null,value.key);download('展示室_引き継ぎ前の控え.json',{format:'nanpure-gallery-transfer',version:1,key:ownerKey(),room,published,revision,id:savedId,dirty});localStorage.setItem(KEY,value.key);room=value.dirty?draft:current?.room||draft;revision=current?.revision||0;savedId=current?.id||'';published=value.dirty?!!value.published:current?.published||false;dirty=!!value.dirty||!current;persist();render();$('transfer-status').textContent='展示室を引き継ぎました。元の展示室の控えもファイルに保存しました。';}catch(err){$('transfer-status').textContent=err.message}finally{e.target.value=''}};
$('puzzle-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>MAX_BYTES)throw Error('問題ファイルは256KB以内にしてください。');const value=JSON.parse(await f.text());pendingCandidate=value.format==='nanpure-gallery-draft'?value.room?.slots?.find(Boolean):slotFromPuzzle(value.puzzle&&typeof value.puzzle==='object'&&!Array.isArray(value.puzzle)?value.puzzle:value,'created');if(!pendingCandidate)throw Error('問題が見つかりません。');pendingCandidate=cleanSlot(pendingCandidate);const index=room.slots.findIndex(s=>!s);await pick(index<0?0:index)}catch(err){say(err.message)}finally{e.target.value=''}};
async function play(record){
 const dialog=$('play-dialog');if($('detail').open)$('detail').close();show(dialog);$('play-status').textContent='問題を読み込んでいます…';const frame=$('play-frame');frame.src='/nanpure/collection/player.html';
 try{const start=Date.now();let bridge;while(dialog.open&&Date.now()-start<30000){try{bridge=frame.contentWindow?.NPCollectionBridge}catch{}if(bridge)break;await new Promise(r=>setTimeout(r,150));}if(!dialog.open)return;if(!bridge)throw Error('プレイ画面を読み込めませんでした。通信を確認して開き直してください。');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(record))),id=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');const p={...structuredClone(record),uid:'gallery-'+id,created:Date.now(),grid:record.puzzle.slice(),notes:{},elapsed:0,completed:false};await bridge.open(p,'number');$('play-status').textContent='途中の状態はこの端末に保存します。閉じるときも保存します。';}catch(e){$('play-status').textContent=e.message;}
}
$('close-play').onclick=async()=>{try{await $('play-frame').contentWindow?.NPCollectionBridge?.flush();$('play-dialog').close();$('play-frame').src='about:blank';}catch(e){$('play-status').textContent='保存できませんでした。画面を開いたまま再試行してください。'}};
$('play-dialog').addEventListener('cancel',e=>{e.preventDefault();$('close-play').click()});
async function boot(){
 busy=true;render();
 try{if(visitor){const value=await api('?room='+encodeURIComponent(roomId));room=cleanRoom(value.room);published=true;savedId=value.id;revision=value.revision;}
 else{
  let local;try{local=JSON.parse(localStorage.getItem(DRAFT)||'null');if(local?.room){room=cleanRoom(local.room);published=!!local.published;revision=local.revision||0;savedId=local.id||'';dirty=!!local.dirty;}}catch{say('端末の下書きを読み込めませんでした。引き継ぎファイルがあれば復元できます。');}
  const value=await api('?mine=1',null,ownerKey());if(value&&!dirty){room=cleanRoom(value.room);revision=value.revision;savedId=value.id;published=value.published;persist();}else if(value&&dirty&&value.revision!==revision)say('別の画面で更新されています。端末の下書きは残しています。最新の展示室を確認してから保存してください。');
  try{const incoming=sessionStorage.getItem('np-gallery-pick-v1');if(incoming){pendingCandidate=cleanSlot(JSON.parse(incoming));sessionStorage.removeItem('np-gallery-pick-v1');const index=room.slots.findIndex(s=>!s);setTimeout(()=>pick(index<0?0:index),0);}}catch{}
 }
 }catch(e){say(e.message||'サーバーに接続できませんでした。端末の下書きで編集を続けられます。');if(visitor){$('wall').hidden=true;$('room-note').textContent='公開URLを確認するか、ナンプレ帳から遊んでみてください。';}}
 finally{busy=false;render()}
}
window.NPGallery={getRoom:()=>structuredClone(room),pick,save};boot();
