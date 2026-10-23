(function(w){
 'use strict';
 const key='np-wado-v1',$=id=>document.getElementById(id),form=$('wado-form'),list=$('wado-list');
 const positions={top:'上',left:'左',right:'右',bottom:'下'},defaults={level:1,wordCount:4,batch:5,layout:2};
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let engine,worker=null,epoch=0,queue=Promise.resolve(),saved=0,failed=false,page=0,preferences={...defaults},selected=new Set();
 for(const [index,level] of NPWado.levels.entries()){$('wado-level').add(new Option(level.name,index+1));const li=document.createElement('li');li.textContent=level.help;$('wado-level-guide').append(li);}
 function fail(message){$('wado-error').textContent=message;$('wado-error').hidden=false;}
 function read(){const raw=localStorage.getItem(key);if(!raw)return{version:1,items:[],preferences:{...defaults}};const data=JSON.parse(raw);if(data?.version!==1||!Array.isArray(data.items)||data.items.length>500)throw Error('保存データを読み込めませんでした。上書きせず停止しています。');const seen=new Set();for(const p of data.items){engine.validate(p);const id=engine.fingerprint(p);if(seen.has(id))throw Error('保存データに重複があります。上書きせず停止しています。');seen.add(id);}return data;}
 function mutate(change){const commit=()=>{const data=read();if(change(data)===false)return null;localStorage.setItem(key,JSON.stringify(data));return data;};return navigator.locks?.request?navigator.locks.request(key,commit):Promise.resolve().then(commit);}
 function validPreferences(p={}){return{level:Number.isInteger(p.level)&&p.level>=1&&p.level<=10?p.level:1,wordCount:[2,3,4].includes(p.wordCount)?p.wordCount:4,batch:[1,3,5,10,20].includes(p.batch)?p.batch:5,layout:[1,2,4,6].includes(p.layout)?p.layout:2};}
 function updatePreferences(){preferences={level:Number(form.elements.level.value),wordCount:Number(form.elements.wordCount.value),batch:Number(form.elements.batch.value),layout:Number($('wado-layout').value)};$('wado-level-help').textContent=NPWado.levels[preferences.level-1].help;}
 function setBusy(busy){form.setAttribute('aria-busy',String(busy));for(const control of form.querySelectorAll('select'))control.disabled=busy||failed||!engine;$('wado-generate').disabled=busy||failed||!engine;$('wado-stop').hidden=!busy;}
 function stop(){if(worker)worker.terminate();worker=null;epoch++;setBusy(false);}
 function remember(){if(failed||!engine)return;const value={...preferences};void mutate(data=>{data.preferences=value;}).catch(()=>fail('設定を保存できませんでした。端末の空き容量を確認してください。'));}
 function board(p,answer=false,print=false){let html='<div class="wado-board" role="img" aria-label="'+escape(Object.keys(positions).filter(k=>p.arms[k]).map(k=>positions[k]+'：'+p.arms[k]).join('、')+'。中央：'+(answer?p.answer:'空白'))+'">';for(const [k,value] of Object.entries(p.arms)){html+='<span class="wado-cell wado-'+k+'" aria-hidden="true">'+value+'</span><span class="wado-arrow wado-arrow-'+k+'" aria-hidden="true">'+(['top','bottom'].includes(k)?'↓':'→')+'</span>';}return html+'<span class="wado-cell wado-center" aria-hidden="true">'+(answer?p.answer:print?'':'？')+'</span></div>';}
 function hints(p){return'<div class="wado-hints">'+engine.hints(p).map(h=>'<span><strong>'+positions[h.position]+'の熟語：</strong>'+escape(h.reading)+'</span>').join('')+'</div>';}
 function choices(p){return p.choices.length?'<div class="wado-choices" aria-label="選択肢">'+p.choices.map(c=>'<span>'+c+'</span>').join('')+'</div>':'';}
 function wordList(p){return'<ul class="wado-word-list">'+Object.keys(positions).filter(k=>p.arms[k]).map(k=>{const text=engine.word(p,k);return'<li><b>'+text+'</b><span>'+escape(engine.entry(text).reading)+'</span></li>';}).join('')+'</ul>';}
 function question(p,index){const node=document.createElement('article');node.className='wado-question';node.dataset.wadoKey=engine.fingerprint(p);node.innerHTML='<div class="wado-question-head"><label><input type="checkbox" data-wado-select aria-label="第'+(index+1)+'問を印刷に使う"><span>第'+(index+1)+'問</span></label><span class="wado-question-meta">難易度 '+p.level+' ／ 熟語 '+p.count+'個</span></div>'+board(p)+hints(p)+choices(p)+'<details class="wado-answer"><summary>答えと熟語の読みを見る</summary><p>答え：'+p.answer+'</p>'+wordList(p)+'</details>';node.querySelector('input').addEventListener('change',event=>{const id=engine.fingerprint(p);if(event.target.checked)selected.add(id);else selected.delete(id);updateSelection();});return node;}
 function updateSelection(){for(const node of list.children)node.querySelector('input').checked=selected.has(node.dataset.wadoKey);$('wado-selected').textContent=selected.size+'問を選択中';$('wado-print-questions').disabled=$('wado-print-answers').disabled=!selected.size;}
 function render(data){const ids=new Set(data.items.map(engine.fingerprint));selected=new Set([...selected].filter(id=>ids.has(id)));const pages=Math.max(1,Math.ceil(data.items.length/20));page=Math.max(0,Math.min(page,pages-1));const shown=data.items.map((p,index)=>({p,index})).reverse().slice(page*20,page*20+20),existing=new Map([...list.children].map(node=>[node.dataset.wadoKey,node])),active=document.activeElement;list.replaceChildren(...shown.map(({p,index})=>existing.get(engine.fingerprint(p))||question(p,index)));if(active!==document.body&&list.contains(active))active.focus({preventScroll:true});$('wado-saved-count').textContent=data.items.length;$('wado-empty').hidden=!!data.items.length;document.querySelector('.magic-pager').hidden=pages<=1;$('wado-page-number').textContent=(page+1)+' / '+pages;$('wado-previous').disabled=page===0;$('wado-next').disabled=page>=pages-1;updateSelection();}
 for(const control of [form,$('wado-layout')])control.addEventListener('change',()=>{updatePreferences();remember();});
 form.addEventListener('submit',event=>{
  event.preventDefault();if(worker||failed||!engine)return;updatePreferences();const token=++epoch;let data;try{data=read();if(data.items.length>=500)throw Error('保存上限は500問です。サイトのバックアップで保存できます。');}catch(e){fail(e.message);return;}
  selected.clear();saved=0;queue=Promise.resolve();$('wado-error').hidden=true;$('wado-status').textContent='生成中…';setBusy(true);
  try{worker=new Worker('wado-worker.js');const active=worker;
   active.onerror=()=>{if(worker!==active)return;stop();fail('生成を開始できませんでした。ページを再読み込みしてください。');};
   active.onmessage=({data:message})=>{
    if(worker!==active)return;
    if(message.type==='puzzle'){
     queue=queue.then(async()=>{if(worker!==active||token!==epoch)return;let added=false;const current=await mutate(data=>{if(worker!==active||token!==epoch)return false;const p=engine.validate(message.puzzle);if(data.items.some(old=>engine.fingerprint(old)===engine.fingerprint(p)))return false;if(data.items.length>=500)throw Error('保存上限は500問です。');data.items.push({...p,created:Date.now()});data.preferences={...preferences};added=true;});if(added&&current){saved++;selected.add(engine.fingerprint(message.puzzle));page=0;render(current);$('wado-status').textContent='生成中… '+saved+' / '+message.total+'問を保存しました。';}}).catch(error=>{if(worker!==active)return;stop();fail('保存できませんでした。'+(error.message.includes('上限')?error.message:'端末の空き容量を確認してください。'));});
    }else if(message.type==='done'||message.type==='error')queue.then(()=>{if(worker!==active)return;stop();$('wado-status').textContent=saved+'問をこの端末に保存しました。';if(message.type==='error')fail(message.message);});
   };
   active.postMessage({level:preferences.level,wordCount:preferences.wordCount,batch:Math.min(preferences.batch,500-data.items.length),seen:data.items.map(engine.fingerprint)});
  }catch{stop();fail('生成を開始できませんでした。ページを再読み込みしてください。');}
 });
 $('wado-stop').addEventListener('click',()=>{stop();$('wado-status').textContent=saved+'問をこの端末に保存しました。';});
 for(const [id,delta] of [['wado-previous',-1],['wado-next',1]])$(id).addEventListener('click',()=>{page+=delta;try{render(read());}catch(e){fail(e.message);}});
 $('wado-select-all').addEventListener('click',()=>{try{selected=new Set(read().items.map(engine.fingerprint));updateSelection();}catch(e){fail(e.message);}});$('wado-select-none').addEventListener('click',()=>{selected.clear();updateSelection();});
 function print(answers){
  try{
   const chosen=read().items.filter(p=>selected.has(engine.fingerprint(p)));if(!chosen.length)return;
   const perPage=Number($('wado-layout').value),columns=perPage<4?1:2,rows=Math.ceil(perPage/columns),sizes={1:['32mm','56pt','18pt','28pt'],2:['18mm','38pt','14pt','22pt'],4:['17mm','34pt','13pt','20pt'],6:['10mm','24pt','10pt','18pt']},[cell,font,small,choice]=sizes[perPage],root=$('wado-print-root');let html='';
   for(let start=0;start<chosen.length;start+=perPage){html+='<section class="wado-sheet" style="--print-columns:'+columns+';--print-rows:'+rows+';--print-cell:'+cell+';--print-font:'+font+';--print-small:'+small+';--print-choice:'+choice+'"><header class="wado-sheet-header"><h1>漢字穴埋め'+(answers?'【解答】':'')+'</h1><span>'+(answers?'':'名前：＿＿＿＿＿＿＿＿')+'</span></header><p class="wado-print-note">'+(answers?'矢印の向きに読む熟語と、その読みです。':'中央に漢字を1つ入れて、矢印の向きに読む熟語を作りましょう。')+'</p><div class="wado-print-grid">';
    for(const [offset,p] of chosen.slice(start,start+perPage).entries()){html+='<article class="wado-question"><div class="wado-question-head">第'+(start+offset+1)+'問<span class="wado-question-meta">難易度 '+p.level+' ／ 熟語 '+p.count+'個</span></div>'+board(p,answers,true)+(answers?wordList(p):hints(p)+choices(p))+'</article>';}
    html+='</div><footer class="wado-sheet-footer">ナンプレ帳 · '+(Math.floor(start/perPage)+1)+' / '+Math.ceil(chosen.length/perPage)+'</footer></section>';
   }
   root.innerHTML=html;w.print();
  }catch(e){fail('印刷を準備できませんでした。'+e.message);}
 }
 $('wado-print-questions').addEventListener('click',()=>print(false));$('wado-print-answers').addEventListener('click',()=>print(true));
 w.addEventListener('afterprint',()=>{$('wado-print-root').replaceChildren();});
 w.addEventListener('pagehide',stop);w.appPause=stop;w.appBack=()=>{if(worker){stop();return;}location.replace('index.html#prototype');};
 w.addEventListener('storage',event=>{if(event.key!==key||!engine)return;try{render(read());}catch(e){failed=true;stop();fail(e.message);}});
 fetch('wado-data.json').then(response=>{if(!response.ok)throw Error('熟語辞書を読み込めませんでした。通信を確認して再読み込みしてください。');return response.json();}).then(data=>{engine=NPWado.create(data);const stored=read();preferences=validPreferences(stored.preferences);form.elements.level.value=preferences.level;form.elements.wordCount.value=preferences.wordCount;form.elements.batch.value=preferences.batch;$('wado-layout').value=preferences.layout;updatePreferences();render(stored);$('wado-status').textContent='';$('wado-dictionary-date').textContent='辞書データの日付：'+engine.sourceDate;setBusy(false);}).catch(error=>{failed=true;setBusy(false);fail(error.message||'読み込みに失敗しました。再読み込みしてください。');});
})(window);
