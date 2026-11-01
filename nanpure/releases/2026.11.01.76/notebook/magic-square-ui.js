(function(w){
 'use strict';
 const key='np-magic-square-v1',engine=w.NPMagicSquare,form=document.getElementById('magic-form'),list=document.getElementById('magic-list'),status=document.getElementById('magic-status'),error=document.getElementById('magic-error');
 const generate=document.getElementById('magic-generate'),stopButton=document.getElementById('magic-stop');
 const defaults={generation:{n:3,blankStyle:'standard',count:1},library:{size:'all',sort:'newest',perPage:20}};
 let worker=null,queue=Promise.resolve(),saved=0,readFailed=false,epoch=0,generation={...defaults.generation},view={...defaults.library,page:0};
 const t=(message,...args)=>{const source=message.replace(/\{(\d+)\}/g,(_,i)=>String(args[Number(i)]));return w.NPI18n?.t(source)||source;};
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function read(){
  const value=localStorage.getItem(key);if(!value)return{version:1,items:[]};
  const data=JSON.parse(value);
  if(data?.version!==1||!Array.isArray(data.items)||data.items.length>2000)throw Error('MAGIC_STORAGE');
  for(const p of data.items)engine.validate(p);return data;
 }
 function fail(message){error.textContent=t(message);error.hidden=false;}
 function preferences(data){
  const g=data.preferences?.generation||{},l=data.preferences?.library||{};
  return{generation:{n:engine.sizes.includes(g.n)?g.n:3,blankStyle:engine.blankStyles.includes(g.blankStyle)?g.blankStyle:'standard',count:[1,3,5,10].includes(g.count)?g.count:1},library:{size:['all','3','4','5'].includes(l.size)?l.size:'all',sort:['newest','oldest','few','many'].includes(l.sort)?l.sort:'newest',perPage:[10,20,50].includes(l.perPage)?l.perPage:20}};
 }
 function remember(data){
  data.preferences={generation:{...generation},library:{size:view.size,sort:view.sort,perPage:view.perPage}};
 }
 function mutate(change){
  const commit=()=>{const data=read();if(change(data)===false)return;localStorage.setItem(key,JSON.stringify(data));return data;};
  return navigator.locks?.request?navigator.locks.request(key,commit):Promise.resolve().then(commit);
 }
 function savePreferences(){
  if(readFailed)return;
  // Capture this choice now; a later lock must not write another tab's stale
  // puzzle list or a partially changed generation form.
  const value={generation:{...generation},library:{size:view.size,sort:view.sort,perPage:view.perPage}};
  void mutate(data=>{data.preferences=value;}).catch(()=>fail('設定を保存できませんでした。'));
 }
 function board(p,answer=false){
  const values=answer?p.solution:p.puzzle;
  return'<table class="magic-board" style="--magic-cell:'+100/p.n+'%" aria-label="'+esc(t(answer?'答え':'問題'))+'"><tbody>'+Array.from({length:p.n},(_,r)=>'<tr>'+values.slice(r*p.n,(r+1)*p.n).map(v=>'<td'+(v?'':' aria-label="'+esc(t('空白'))+'"')+'><span data-i18n-skip translate="no">'+(v||'&#160;')+'</span></td>').join('')+'</tr>').join('')+'</tbody></table>';
 }
 function item(p,index){
  const detail=document.createElement('details');detail.className='magic-question';detail.dataset.magicKey=index+':'+fingerprint(p);
  detail.innerHTML='<summary><strong data-i18n-skip translate="no">'+p.n+'×'+p.n+'</strong><span>'+esc(t('空白'))+' <b data-i18n-skip translate="no">'+p.blanks+'</b></span></summary>';
  // Create the answer preview only after the player explicitly opens the item.
  detail.addEventListener('toggle',()=>{if(!detail.open||detail.querySelector('.magic-preview'))return;
   const preview=document.createElement('div');preview.className='magic-preview';preview.innerHTML='<p class="magic-meta"><span>'+esc(t('合計'))+' <b data-i18n-skip translate="no">'+p.target+'</b></span><span>'+esc(t('保存済み'))+'</span></p>'+board(p)+'<details class="magic-answer"><summary>'+esc(t('答えを見る'))+'</summary>'+board(p,true)+'</details>';
   detail.append(preview);
  });return detail;
 }
 function render(data){
  const matching=data.items.map((p,index)=>({p,index})).filter(({p})=>view.size==='all'||String(p.n)===view.size);
  matching.sort((a,b)=>view.sort==='oldest'?a.index-b.index:view.sort==='few'?a.p.blanks-b.p.blanks||b.index-a.index:view.sort==='many'?b.p.blanks-a.p.blanks||b.index-a.index:b.index-a.index);
  const pages=Math.max(1,Math.ceil(matching.length/view.perPage));view.page=Math.min(pages-1,Math.max(0,view.page));
  const start=view.page*view.perPage,shown=matching.slice(start,start+view.perPage),active=document.activeElement;
  const existing=new Map([...list.children].map(node=>[node.dataset.magicKey,node]));
  list.replaceChildren(...shown.map(({p,index})=>existing.get(index+':'+fingerprint(p))||item(p,index)));
  if(active!==document.body&&list.contains(active))active.focus({preventScroll:true});
  document.getElementById('magic-saved-count').textContent=String(data.items.length);document.getElementById('magic-empty').hidden=!!data.items.length;
  document.getElementById('magic-library-options').hidden=!data.items.length;
  document.getElementById('magic-no-matches').hidden=!data.items.length||!!matching.length;
  document.getElementById('magic-range').textContent=matching.length?(start+1)+'–'+Math.min(start+view.perPage,matching.length)+' / '+matching.length:'0 / 0';
  document.getElementById('magic-range-row').hidden=!data.items.length;
  for(const pager of document.querySelectorAll('.magic-pager'))pager.hidden=pages<=1;
  for(const label of document.querySelectorAll('[data-magic-page-label]'))label.textContent=(view.page+1)+' / '+pages;
  for(const button of document.querySelectorAll('[data-magic-page]'))button.disabled=button.dataset.magicPage==='previous'?view.page===0:view.page>=pages-1;
 }
 function setBusy(busy){for(const control of form.querySelectorAll('select'))control.disabled=busy||readFailed;generate.disabled=busy||readFailed;stopButton.hidden=!busy;form.setAttribute('aria-busy',String(busy));}
 function stop(){if(worker)worker.terminate();worker=null;epoch++;setBusy(false);}
 function fingerprint(p){return p.n+':'+p.puzzle.join(',');}
 async function persist(p,token){
  let added=false;
  const data=await mutate(data=>{
   if(token!==epoch)return false;
   engine.validate(p);
   if(data.items.some(old=>fingerprint(old)===fingerprint(p)))return false;
   if(data.items.length>=2000)throw Error('MAGIC_FULL');
   data.items.push({...p,created:Date.now()});remember(data);added=true;
   // Commit storage before showing the puzzle as saved. Read again for each
   // addition so another tab's completed questions are retained.
  });
  if(added&&data){saved++;render(data);}
 }
 form.addEventListener('change',()=>{generation={n:Number(form.elements.n.value),blankStyle:form.elements.blanks.value,count:Number(form.elements.count.value)};savePreferences();});
 document.getElementById('magic-library-options').addEventListener('change',()=>{
  view={size:document.getElementById('magic-filter-size').value,sort:document.getElementById('magic-sort').value,perPage:Number(document.getElementById('magic-per-page').value),page:0};
  try{render(read());savePreferences();}catch{fail('保存データを読み込めませんでした。');}
 });
 for(const button of document.querySelectorAll('[data-magic-page]'))button.addEventListener('click',()=>{view.page+=button.dataset.magicPage==='previous'?-1:1;try{render(read());}catch{fail('保存データを読み込めませんでした。');}});
 form.addEventListener('submit',event=>{
  event.preventDefault();if(worker||readFailed)return;
  const n=Number(form.elements.n.value),blankStyle=form.elements.blanks.value,count=Number(form.elements.count.value),token=++epoch;
  if(!engine.sizes.includes(n)||!engine.blankStyles.includes(blankStyle)||![1,3,5,10].includes(count))return;
  generation={n,blankStyle,count};
  error.hidden=true;saved=0;queue=Promise.resolve();status.textContent=t('生成中…');setBusy(true);
  try{
   worker=new Worker('magic-square-worker.js');const active=worker;
   const generationError=()=>{if(worker!==active)return;stop();fail('問題を作る準備ができませんでした。ページを再読み込みしてください。');};
   active.onerror=generationError;
   active.onmessage=({data})=>{
    if(worker!==active)return;
    if(data.type==='puzzle'){
     queue=queue.then(()=>persist(data.puzzle,token)).then(()=>{if(worker===active)status.textContent=t('生成中…')+' '+(data.index+1)+' / '+data.total;}).catch(()=>{if(worker===active){stop();fail('保存できませんでした。端末の空き容量を確認してください。');}});
    }else if(data.type==='done')queue.then(()=>{if(worker!==active)return;stop();status.textContent=t('この端末に {0} 問を保存しました。',saved);});
    else generationError();
   };
   const seed=crypto.getRandomValues(new Uint32Array(1))[0];active.postMessage({n,blankStyle,count,seed});
  }catch{stop();fail('問題を作る準備ができませんでした。ページを再読み込みしてください。');}
 });
 stopButton.addEventListener('click',()=>{stop();status.textContent=t('この端末に {0} 問を保存しました。',saved);});
 w.addEventListener('pagehide',stop);
 w.addEventListener('storage',event=>{if(event.key!==key)return;try{render(read());}catch{readFailed=true;stop();fail('保存データを読み込めませんでした。');}});
 w.appPause=stop;w.appBack=()=>{if(worker){stop();return;}location.replace('index.html#prototype');};
 try{const data=read(),pref=preferences(data);generation=pref.generation;view={...pref.library,page:0};form.elements.n.value=String(generation.n);form.elements.blanks.value=generation.blankStyle;form.elements.count.value=String(generation.count);document.getElementById('magic-filter-size').value=view.size;document.getElementById('magic-sort').value=view.sort;document.getElementById('magic-per-page').value=String(view.perPage);render(data);}catch{readFailed=true;setBusy(false);fail('保存データを読み込めませんでした。');}
})(window);
