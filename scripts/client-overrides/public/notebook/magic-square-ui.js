(function(w){
 'use strict';
 const key='np-magic-square-v1',engine=w.NPMagicSquare,form=document.getElementById('magic-form'),list=document.getElementById('magic-list'),status=document.getElementById('magic-status'),error=document.getElementById('magic-error');
 const generate=document.getElementById('magic-generate'),stopButton=document.getElementById('magic-stop');
 let worker=null,queue=Promise.resolve(),saved=0,readFailed=false,epoch=0;
 const t=(message,...args)=>{const source=message.replace(/\{(\d+)\}/g,(_,i)=>String(args[Number(i)]));return w.NPI18n?.t(source)||source;};
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function read(){
  const value=localStorage.getItem(key);if(!value)return{version:1,items:[]};
  const data=JSON.parse(value);
  if(data?.version!==1||!Array.isArray(data.items)||data.items.length>2000)throw Error('MAGIC_STORAGE');
  for(const p of data.items)engine.validate(p);return data;
 }
 function fail(message){error.textContent=t(message);error.hidden=false;}
 function board(p,answer=false){
  const values=answer?p.solution:p.puzzle;
  return'<table class="magic-board" style="--magic-cell:'+100/p.n+'%" aria-label="'+esc(t(answer?'答え':'問題'))+'"><tbody>'+Array.from({length:p.n},(_,r)=>'<tr>'+values.slice(r*p.n,(r+1)*p.n).map(v=>'<td'+(v?'':' aria-label="'+esc(t('空白'))+'"')+'><span data-i18n-skip translate="no">'+(v||'&#160;')+'</span></td>').join('')+'</tr>').join('')+'</tbody></table>';
 }
 function item(p){
  const detail=document.createElement('details');detail.className='magic-question';
  detail.innerHTML='<summary><strong data-i18n-skip translate="no">'+p.n+'×'+p.n+'</strong><span>'+esc(t('空白'))+' <b data-i18n-skip translate="no">'+p.blanks+'</b></span></summary>';
  // Create the answer preview only after the player explicitly opens the item.
  detail.addEventListener('toggle',()=>{if(!detail.open||detail.querySelector('.magic-preview'))return;
   const preview=document.createElement('div');preview.className='magic-preview';preview.innerHTML='<p class="magic-meta"><span>'+esc(t('合計'))+' <b data-i18n-skip translate="no">'+p.target+'</b></span><span>'+esc(t('保存済み'))+'</span></p>'+board(p)+'<details class="magic-answer"><summary>'+esc(t('答えを見る'))+'</summary>'+board(p,true)+'</details>';
   detail.append(preview);
  });return detail;
 }
 function render(data){
  list.replaceChildren(...data.items.slice().reverse().map(item));document.getElementById('magic-saved-count').textContent=String(data.items.length);document.getElementById('magic-empty').hidden=!!data.items.length;
 }
 function setBusy(busy){for(const control of form.querySelectorAll('select'))control.disabled=busy;generate.disabled=busy||readFailed;stopButton.hidden=!busy;form.setAttribute('aria-busy',String(busy));}
 function stop(){if(worker)worker.terminate();worker=null;epoch++;setBusy(false);}
 function fingerprint(p){return p.n+':'+p.puzzle.join(',');}
 async function persist(p,token){
  const commit=()=>{
   if(token!==epoch)return;
   engine.validate(p);
   const data=read();
   if(data.items.some(old=>fingerprint(old)===fingerprint(p)))return;
   if(data.items.length>=2000)throw Error('MAGIC_FULL');
   data.items.push({...p,created:Date.now()});
   // Commit storage before showing the puzzle as saved. Read again for each
   // addition so another tab's completed questions are retained.
   localStorage.setItem(key,JSON.stringify(data));saved++;
   list.prepend(item(p));document.getElementById('magic-saved-count').textContent=String(data.items.length);document.getElementById('magic-empty').hidden=true;
  };
  if(navigator.locks?.request)await navigator.locks.request(key,commit);else commit();
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();if(worker||readFailed)return;
  const n=Number(form.elements.n.value),blankStyle=form.elements.blanks.value,count=Number(form.elements.count.value),token=++epoch;
  if(!engine.sizes.includes(n)||!engine.blankStyles.includes(blankStyle)||![1,3,5,10].includes(count))return;
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
 w.addEventListener('storage',event=>{if(event.key!==key)return;try{render(read());}catch{readFailed=true;generate.disabled=true;fail('保存データを読み込めませんでした。');}});
 w.appPause=stop;w.appBack=()=>{if(worker){stop();return;}location.replace('index.html#prototype');};
 try{render(read());}catch{readFailed=true;generate.disabled=true;fail('保存データを読み込めませんでした。');}
})(window);
