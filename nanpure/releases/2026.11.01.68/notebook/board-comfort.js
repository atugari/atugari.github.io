/* Screen-only colors and highlight visibility; never modifies a puzzle or input. */
(function(w){
 'use strict';
 const model=w.NPBoardComfortModel;if(!model)return;
 let prefs=read(),revision=0,queued=false,timer=null,lastBoard=null,lastCell=null,lastPaint=null,dialog=null,opener=null;
 const t=s=>s,esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function current(){return w.NanpureAppTest?.getCurrent?.();}
 function read(){try{return model.normalize(JSON.parse(localStorage.getItem(model.key)||'null'));}catch{return model.normalize(null);}}
 function save(next){
  const normalized=model.normalize(next);localStorage.setItem(model.key,JSON.stringify(normalized));prefs=normalized;revision++;applyRoot();refresh();reveal();
  w.dispatchEvent(new CustomEvent('np-board-comfort-change'));return prefs;
 }
 function applyRoot(){
  const root=document.documentElement;root.dataset.npComfortColors=String(prefs.colorsEnabled);
  for(const k of ['selected','guide','same']){root.style.setProperty('--np-comfort-'+k,prefs[k]);root.style.setProperty('--np-comfort-'+k+'-ink',model.ink(prefs[k]));}
  root.style.setProperty('--np-comfort-canvas',prefs.template==='paper'?'#ece7da':prefs.template==='blue'?'#e7edf0':'#edf0e8');
 }
 function board(){return document.getElementById('board');}
 function reveal(){const b=board();if(!b)return;clearTimeout(timer);b.dataset.npHighlightHidden='false';if(['timer','both'].includes(prefs.hide))timer=setTimeout(()=>{if(b.isConnected)b.dataset.npHighlightHidden='true';},prefs.delay);}
 function hide(){clearTimeout(timer);const b=board();if(b)b.dataset.npHighlightHidden='true';}
 function paintRegions(b,p){
  const first=b.querySelector('.cell'),signature=p.uid||p.id||p;
  if(lastPaint?.board===b&&lastPaint.first===first&&lastPaint.signature===signature&&lastPaint.revision===revision)return;
  const data=model.groups(p),fills=new Map(data.regions.map((r,i)=>[r.key,model.fill(prefs,r,i)]));
  const cells=[...b.querySelectorAll('.cell[data-cell]')],rects=[...b.querySelectorAll('[data-linked-cell]')];
  const active=prefs.template!=='none'||Object.keys(prefs.regions).length>0;b.dataset.npRegionColors=String(active);
  for(const cell of cells){const i=Number(cell.dataset.cell),key=data.cellKeys[i]?.[0],fill=key&&fills.get(key);if(fill){cell.style.setProperty('--np-comfort-region',fill);cell.style.setProperty('--np-comfort-region-ink',model.ink(fill));cell.dataset.npDarkRegion=String(model.ink(fill)==='#f9fbf7');}else{cell.style.removeProperty('--np-comfort-region');cell.style.removeProperty('--np-comfort-region-ink');delete cell.dataset.npDarkRegion;}}
  for(const rect of rects){
   const i=Number(rect.getAttribute('data-linked-cell')),keys=data.cellKeys[i]||[],fill=keys.length===1&&fills.get(keys[0]);
   const owners=p.linked?.boards.flatMap((b,j)=>b.map.includes(i)?[j]:[])||[],base=owners.length>1?'#fff2ca':p.kind==='multi'?(w.NanpureMulti?.palette?.[owners[0]]?.tint||'#fff'):'#fff';
   rect.style.setProperty('--np-comfort-region',fill||base);if(fill)rect.dataset.npRegionColored='true';else delete rect.dataset.npRegionColored;
  }
  for(const text of b.querySelectorAll('[data-multi-digit],[data-linked-digit],[data-memo-cell]')){
   const i=Number(text.getAttribute('data-multi-digit')??text.getAttribute('data-linked-digit')??text.getAttribute('data-memo-cell')),rect=rects.find(r=>Number(r.getAttribute('data-linked-cell'))===i);
   const keys=data.cellKeys[i]||[],key=keys[0],fill=keys.length===1&&key&&fills.get(key);text.dataset.npDarkRegion=String(!!fill&&model.ink(fill)==='#f9fbf7');
   text.dataset.npComfortGuide=String(!!rect?.classList.contains('np-linked-guide'));text.dataset.npComfortSame=String(!!rect?.classList.contains('np-linked-same'));
  }
  lastPaint={board:b,first,signature,revision};
 }
 function show(){
  opener=document.activeElement;dialog?.remove();dialog=document.createElement('dialog');dialog.className='np-comfort-dialog';dialog.setAttribute('aria-label',t('枠の配色と選択色'));
  const data=model.groups(current()),selected=board()?.querySelector('.cell[aria-pressed="true"]'),selectedKey=data.cellKeys[Number(selected?.dataset.cell)]?.[0];
  dialog.innerHTML='<div class="np-comfort-heading"><h2>'+t('枠の配色と選択色')+'</h2><button type="button" data-comfort-close>'+t('閉じる')+'</button></div><p>'+t('配色は作った問題と問題集で共通です。数字や途中経過は変わりません。')+'</p><label>'+t('淡い配色のテンプレ')+'<select data-comfort="template" aria-label="淡い配色のテンプレ">'+Object.entries(model.templates).map(([id,v])=>'<option value="'+id+'" '+(prefs.template===id?'selected':'')+'>'+t(v.name)+'</option>').join('')+'</select></label><div class="np-comfort-sample" aria-label="'+t('配色の見本')+'">'+Array.from({length:36},(_,i)=>'<span data-sample="'+i+'">'+(i%6+1)+'</span>').join('')+'</div><fieldset><legend>'+t('枠ごとに色を変える')+'</legend><label>'+t('色を変える枠')+'<select data-comfort-region '+(!data.regions.length?'disabled':'')+'>'+data.regions.map(r=>'<option value="'+r.key+'" '+(r.key===selectedKey?'selected':'')+'>'+esc(r.label)+'</option>').join('')+'</select></label><label>'+t('この枠の色')+'<input type="color" data-comfort-region-color aria-label="'+t('この枠の色')+'" '+(!data.regions.length?'disabled':'')+'></label><button type="button" data-comfort-region-reset '+(!data.regions.length?'disabled':'')+'>'+t('この枠の色を戻す')+'</button><small>'+t('盤面でマスを選んでから開くと、そのマスを含む枠を選びます。')+'</small></fieldset><fieldset><legend>'+t('強調する色')+'</legend>'+[['selected','選択マス'],['guide','縦・横'],['same','同じ数字']].map(([k,label])=>'<label>'+t(label)+'<input type="color" data-comfort="'+k+'" aria-label="'+t(label+'の色')+'" value="'+prefs[k]+'"></label>').join('')+'</fieldset><fieldset><legend>'+t('強調表示を消す条件')+'</legend><label>'+t('消し方')+'<select data-comfort="hide" aria-label="消し方">'+[['never','消さない'],['timer','一定時間後'],['outside','盤面外を押したとき'],['both','時間＋盤面外']].map(([id,label])=>'<option value="'+id+'" '+(prefs.hide===id?'selected':'')+'>'+t(label)+'</option>').join('')+'</select></label><label data-comfort-delay-row>'+t('消えるまで')+'<select data-comfort="delay" aria-label="消えるまで">'+[1000,2000,3000,5000,10000,15000].map(ms=>'<option value="'+ms+'" '+(prefs.delay===ms?'selected':'')+'>'+ms/1000+' '+t('秒')+'</option>').join('')+'</select></label><p>'+t('色だけを消します。選択したマスと数字の入力先は保持します。マスを選び直すと色が戻ります。')+'</p></fieldset><p class="np-comfort-status" role="status"></p><div class="np-comfort-footer"><button type="button" data-comfort-reset>'+t('配色と強調を初期設定に戻す')+'</button><button type="button" data-comfort-close>'+t('完了')+'</button></div>';
  dialog.addEventListener('change',event=>{
   const input=event.target;try{
    if(input.matches('[data-comfort]')){const k=input.dataset.comfort,next={...prefs,[k]:k==='delay'?Number(input.value):input.value};if(k==='template'){const colors=model.templates[input.value];Object.assign(next,{selected:colors.selected,guide:colors.guide,same:colors.same,colorsEnabled:input.value!=='none',regions:{}});}else if(['selected','guide','same'].includes(k))next.colorsEnabled=true;save(next);}
    if(input.matches('[data-comfort-region-color]')){const key=dialog.querySelector('[data-comfort-region]').value;if(key)save({...prefs,regions:{...prefs.regions,[key]:input.value}});}
    syncDialog();reveal();dialog.querySelector('[role="status"]').textContent='';
   }catch{dialog.querySelector('[role="status"]').textContent=t('設定を保存できませんでした。');syncDialog();}
  });
  dialog.querySelectorAll('[data-comfort-close]').forEach(b=>b.onclick=()=>dialog.close());
  dialog.querySelector('[data-comfort-reset]').onclick=()=>{try{save(null);syncDialog();reveal();}catch{dialog.querySelector('[role="status"]').textContent=t('設定を保存できませんでした。');}};
  dialog.querySelector('[data-comfort-region-reset]').onclick=()=>{const regions={...prefs.regions};delete regions[dialog.querySelector('[data-comfort-region]').value];try{save({...prefs,regions});syncDialog();}catch{dialog.querySelector('[role="status"]').textContent=t('設定を保存できませんでした。');}};
  dialog.addEventListener('close',()=>opener?.isConnected&&opener.focus());document.body.append(dialog);syncDialog();dialog.showModal();
 }
 function syncDialog(){
  if(!dialog)return;
  for(const el of dialog.querySelectorAll('[data-comfort]'))el.value=String(prefs[el.dataset.comfort]);
  dialog.querySelector('[data-comfort-delay-row]').hidden=!['timer','both'].includes(prefs.hide);
  const regions=model.groups(current()).regions,key=dialog.querySelector('[data-comfort-region]').value,at=regions.findIndex(r=>r.key===key),r=regions[at];
  dialog.querySelector('[data-comfort-region-color]').value=r?(model.fill(prefs,r,at)||'#ffffff'):'#ffffff';
  const colors=model.templates[prefs.template].regions;
  for(const cell of dialog.querySelectorAll('[data-sample]')){const i=Number(cell.dataset.sample),region=Math.floor(i/18)*3+Math.floor(i%6/2);cell.style.background=i===14?prefs.selected:i%6===2||Math.floor(i/6)===2?prefs.guide:colors[region%colors.length]||'#ffffff';cell.style.color=model.ink(i===14?prefs.selected:i%6===2||Math.floor(i/6)===2?prefs.guide:colors[region%colors.length]||'#ffffff');}
 }
 function mountButton(){
  const b=board();if(!b)return;
  const screen=b.closest('.screen'),host=screen?.querySelector('.np-workspace-tools')||screen?.querySelector('.play-head');if(!host)return;
  for(const old of document.querySelectorAll('[data-board-comfort]'))if(!old.closest('#np-play-settings')&&old.parentElement!==host)old.remove();
  if(!host.querySelector('[data-board-comfort]')){const button=document.createElement('button');button.type='button';button.dataset.boardComfort='';button.setAttribute('aria-label','配色・強調');button.setAttribute('title','配色・強調');button.innerHTML='<span class="np-tool-full">配色・強調</span><span class="np-tool-short" aria-hidden="true">配色</span>';button.onclick=show;host.append(button);}
  const panel=document.querySelector('#np-play-settings [data-settings-panel="view"]');if(panel&&!panel.querySelector('[data-board-comfort]')){const button=document.createElement('button');button.type='button';button.dataset.boardComfort='';button.textContent=t('枠の配色と選択色');button.onclick=show;panel.append(button);}
  if(panel&&document.getElementById('np-language-open')&&!panel.querySelector('[data-workspace-language]')){const button=document.createElement('button');button.type='button';button.dataset.workspaceLanguage='';button.textContent='言語';button.onclick=()=>{document.getElementById('np-play-settings')?.close();document.getElementById('np-language-open')?.click();document.getElementById('np-language-dialog')?.addEventListener('close',()=>document.getElementById('np-play-settings-button')?.focus(),{once:true});};panel.append(button);}
 }
 function refresh(){
  queued=false;const b=board(),p=current();mountButton();
  if(!b||!p){clearTimeout(timer);lastBoard=null;lastCell=null;lastPaint=null;return;}
  paintRegions(b,p);const selected=b.querySelector('.cell[aria-pressed="true"]')?.dataset.cell;
  if(lastBoard!==b||lastCell!==selected){lastBoard=b;lastCell=selected;reveal();}
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(refresh);}}
 document.addEventListener('pointerdown',event=>{
  const b=board();if(!b)return;
  if(event.target.closest('#board .cell,#number-controls,.np-workspace-actions,.play-dock'))reveal();
  else if(['outside','both'].includes(prefs.hide)&&!event.target.closest('.np-comfort-dialog'))hide();
 },{capture:true,passive:true});
 document.addEventListener('keydown',event=>{if(event.target.closest('#board')&&!event.altKey&&!event.ctrlKey&&!event.metaKey)reveal();});
 w.addEventListener('storage',event=>{if(event.key===model.key||event.key===null){prefs=read();revision++;applyRoot();reveal();schedule();}});
 w.addEventListener('np-language-change',schedule);
 let parentDocument=null;const outsideParent=()=>{if(['outside','both'].includes(prefs.hide))hide();};
 try{if(w.parent&&w.parent!==w){parentDocument=w.parent.document;parentDocument.addEventListener('pointerdown',outsideParent,{capture:true,passive:true});}}catch{}
 w.addEventListener('pagehide',()=>{clearTimeout(timer);parentDocument?.removeEventListener('pointerdown',outsideParent,true);});
 new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.attributeName==='aria-pressed'))schedule();}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']});
 w.NPBoardComfort={read,save,show,hide,reveal,refresh,model};applyRoot();schedule();
})(window);
