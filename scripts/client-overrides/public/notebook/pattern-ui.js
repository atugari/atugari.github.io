(function () {
 'use strict';
 const model=window.NPPatternModel, draftKey='nanpure-pattern-draft-v1', viewKey='nanpure-pattern-workspace-v1';
 const t=(text,params)=>window.NPI18n?.t(text,params)||text;
 let page=null, dialog=null, jobsDialog=null, job=null, clock=null, saving=false, selectedId=null;
 let levelPolicy='exact',required=[],excluded=[],techniqueConditions=false;
 let storage;try{storage=window.localStorage;}catch(_){}
 const queue=window.NPPatternQueue||(window.NPPatternQueue=window.NPPatternJobsFactory.create({model,engine:(document.getElementById('core-normal')?.textContent||'')+'\n'+(document.getElementById('core-unique-solver')?.textContent||''),storage,Worker:window.Worker,Blob:window.Blob,URL:window.URL,setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window)}));
 let mask=[], omit=0, symmetry='none', brush='auto', difficulty=0, workspace='fit', sizeStep=0;
 let drawTool='pen',toolsTab='drawing',shapeStart=null;
 const drawTools=[['pen','なぞって描く'],['line','直線を描く'],['rectangle','四角の枠を描く'],['solid','四角を塗る'],['fill','囲みの中を塗る']];
 let view='paint', state='editing', result=null, history=[], future=[], stroke=null, advice=null, saveError=false;
 let saveHandler, savedHandler, backHandler;
 const $=selector=>page.querySelector(selector);
 const levelName=value=>value?NP.levelText(value,18):t('難易度の指定なし');
 const reasonText=data=>{
  if(data?.reason==='few')return t('数字を置くマスを17個以上塗ってください。');
  if(data?.reason==='full')return t('空きマスを1つ以上残してください。');
  if(data?.reason==='rows')return t('数字のない行が同じ帯に2本あります。点線の行にも塗ってください。');
  if(data?.reason==='cols')return t('数字のない列が同じ帯に2本あります。点線の列にも塗ってください。');
  if(data?.reason==='digit')return t('数字を抜くには、各行・列・枠に白いマスが必要です。');
  return '';
 };
 function hostLayout(enabled) {
  try {
   const frame=window.frameElement;if(!frame?.classList.contains('notebook'))return;
   const doc=frame.ownerDocument;
   if(enabled&&!doc.getElementById('np-pattern-host-style')){
    const style=doc.createElement('style');style.id='np-pattern-host-style';
    style.textContent='body.np-pattern-host{overflow:hidden!important}iframe.notebook.np-pattern-host-frame{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;min-height:0!important;max-height:none!important;max-width:none!important;border:0!important;margin:0!important;padding:0!important;z-index:2147482000!important;display:block!important}';doc.head.append(style);
   }
   frame.classList.toggle('np-pattern-host-frame',enabled);doc.body.classList.toggle('np-pattern-host',enabled);
  }catch(_){}
 }
 function leaveHost(){hostLayout(false);}
 function persist(){
  try{localStorage.setItem(draftKey,JSON.stringify({mask:mask.map(Number),omit,symmetry,brush,drawTool,difficulty,levelPolicy,required,excluded,techniqueConditions}));}
  catch(_){$('[data-pattern-warning]').textContent=t('模様を端末に記憶できませんでした。この画面では続けて編集できます。');}
 }
 function closeTools(){if(jobsDialog?.open){jobsDialog.close();return true;}if(!dialog?.open)return false;dialog.close();return true;}
 function openTools(area){
  if(saving||view!=='paint')return;
  page.dataset.dialog=area;
  $('[data-pattern-dialog-title]').textContent=t(area==='presets'?'見本を見る':'道具と条件');
  for(const section of dialog.querySelectorAll('[data-pattern-dialog-section]'))section.hidden=section.dataset.patternDialogSection!==area;
  if(!dialog.open)dialog.showModal();
 }
 function render(){
  if(!page)return;
  job=view==='preview'?queue.get(selectedId):null;
  if(job){state=job.state==='queued'?'checking':job.state;result=job.result;}
  const checking=state==='checking', ready=state==='ready'&&!!result, paint=view==='paint',boardMask=paint?mask:job?.mask||mask;
  page.dataset.view=view;page.dataset.state=state;page.dataset.workspace=workspace;
  $('.pattern-footer').setAttribute('aria-busy',String(checking||saving));
  for(const el of page.querySelectorAll('[data-pixel]')){
   const i=Number(el.dataset.pixel);el.classList.toggle('painted',boardMask[i]);el.classList.toggle('needs-work',paint&&!!advice?.cells?.includes(i));
   el.setAttribute('aria-pressed',String(boardMask[i]));el.setAttribute('aria-disabled',String(!paint));
   el.setAttribute('aria-label',(Math.floor(i/9)+1)+'行'+(i%9+1)+'列・'+(boardMask[i]?'数字を置く':'空きマス')+(!paint&&ready&&result.puzzle[i]?'・'+result.puzzle[i]:''));
   el.classList.toggle('draw-start',paint&&shapeStart===i);
   el.textContent=!paint&&ready?(result.puzzle[i]||''):'';
  }
  for(const step of page.querySelectorAll('[data-pattern-step]')){
   if(step.dataset.patternStep===(paint?'paint':'preview'))step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');
  }
  $('[data-pattern-count]').textContent=boardMask.filter(Boolean).length+' / 81';
  $('[data-pattern-undo]').hidden=!paint||!history.length;
  $('[data-pattern-redo]').hidden=!paint||!future.length;
  $('[data-pattern-quick="presets"]').hidden=!paint;
  $('[data-pattern-quick="draw"]').hidden=!paint;
  $('[data-pattern-view="paint"]').hidden=paint;
  $('[data-pattern-view="preview"]').hidden=!paint;
  $('[data-pattern-retry]').hidden=paint||checking||saving;
  $('[data-pattern-stop]').hidden=!checking;
  $('[data-pattern-save]').hidden=!ready||paint;
  $('[data-pattern-share]').hidden=!ready||paint;
  $('[data-pattern-difficulty-label]').hidden=!paint;
  $('[data-pattern-rating]').hidden=paint;
  $('[data-pattern-difficulty]').value=String(difficulty);
  $('[data-pattern-policy-label]').hidden=!difficulty;
  for(const el of page.querySelectorAll('[data-pattern-policy]'))el.checked=el.value===levelPolicy;
  $('[data-pattern-techniques-enabled]').checked=techniqueConditions;
  $('[data-pattern-techniques-state]').textContent=t(techniqueConditions?'使う':'使わない');
  $('[data-pattern-technique-panel]').hidden=!techniqueConditions;
  for(const el of page.querySelectorAll('[data-pattern-technique]'))el.checked=el.value===(required.includes(el.dataset.patternTechnique)?'required':excluded.includes(el.dataset.patternTechnique)?'excluded':'any');
  $('[data-pattern-omit]').value=String(omit);
  for(const [selector,value]of [['[data-pattern-symmetry]',symmetry],['[data-pattern-brush]',brush],['[data-pattern-draw-tool]',drawTool]])for(const el of page.querySelectorAll(selector))el.checked=el.value===value;
  for(const el of page.querySelectorAll('[data-pattern-tools-tab]'))el.setAttribute('aria-pressed',String(el.dataset.patternToolsTab===toolsTab));
  for(const el of page.querySelectorAll('[data-pattern-draw-panel]'))el.hidden=el.dataset.patternDrawPanel!==toolsTab;
  $('[data-pattern-workspace-select]').value=workspace;
  const sizeControls=$('.pattern-size-options');sizeControls.hidden=workspace==='fit';
  $('[data-pattern-size="smaller"]').disabled=sizeStep<=-3;
  $('[data-pattern-size="larger"]').disabled=sizeStep>=5;
  for(const el of page.querySelectorAll('[data-pattern-preset]'))el.setAttribute('aria-pressed',String(model.presets[el.dataset.patternPreset].every((v,i)=>!!v===mask[i])));
  let title='',help='';
  if(saving){title='保存しています…';help='このままお待ちください';}
  else if(saveError){title='保存できませんでした';help='空き容量を確認して、もう一度保存してください。';}
  else if(checking){title='条件に合う問題を探しています…';help='戻っても作成は続きます';}
  else if(ready&&!paint){title='問題ができました';help='保存して遊ぶか、画像で共有できます';}
  else if(state==='error'){title='作成を開始できませんでした';help='「再開する」で続けられます';}
  else if(state==='stopped'){title='作成を停止しました';help='「再開する」で続けられます';}
  else if(shapeStart!==null){title='終点を選んでください';help='Escキーで始点の指定を取り消せます';}
  else if(advice?.state==='impossible'){title='模様を少し直してください';help=reasonText(advice);}
  else if(drawTool==='fill'){title='塗る場所をタップする';help='同じ色でつながるマスをまとめて塗ります';}
  else if(drawTool!=='pen'){title=drawTools.find(([id])=>id===drawTool)[1];help='始点から終点までなぞって、指を離すと確定します';}
  else{title='タップ・なぞって模様を描く';help='塗ったマスに数字が入ります';}
  $('[data-pattern-result-summary]').textContent=t(title);
  $('[data-pattern-next]').textContent=t(help);
  const indicator=$('[data-pattern-indicator]');indicator.dataset.state=state;
  const target=job?.options.targetLevel??difficulty;
  const lowered=ready&&target&&result.rating?.level<target;
  $('[data-pattern-rating]').textContent=ready?(lowered?t('完成：{actual}（希望：{requested}）',{actual:NP.levelText(result.rating.level,18),requested:NP.levelText(target,18)}):(result.rating?.humanSolvable?NP.levelText(result.rating.level,18):t('難易度未判定'))+' · '+t('答えは1つです')):target?t('難易度')+'：'+levelName(target):levelName(0);
  $('[data-pattern-rating]').title=lowered?t('指定より簡単な問題'):'';
  $('[data-pattern-save]').textContent=t(job?.savedUid?'保存した問題を開く':'保存して遊ぶ');
  for(const el of page.querySelectorAll('button,select,input'))if(!el.closest('.pattern-grid')&&!el.hasAttribute('data-pattern-size'))el.disabled=saving;
  updateProgress();renderJobs();
 }
 function updateProgress(){
  if(!page)return;const progress=$('[data-pattern-progress]');progress.hidden=!job||state!=='checking';
  if(!job||state!=='checking')return;
  const seconds=Math.floor((Date.now()-job.started)/1000);
  progress.textContent=t('{attempts}通り確認・{seconds}秒',{attempts:job.attempts,seconds}).replace('{attempts}',job.attempts.toLocaleString()).replace('{seconds}',String(seconds));
  if(seconds>=15)$('[data-pattern-next]').textContent=t('希望の難易度を作れない模様もあります');
 }
 function sizeBoard(){
  if(!page)return;
  const width=document.documentElement.clientWidth,height=window.innerHeight;
  const side=width>=980||(width>=620&&height<600),fit=workspace!=='normal';
  page.dataset.side=String(side);page.dataset.docked=String(fit);
  document.documentElement.classList.toggle('np-pattern-fit',fit);document.body.classList.toggle('np-pattern-fit',fit);
  const max=Math.max(144,Math.floor(side?Math.min(height-(width>=980?16:96),width-(width>=980?364:264)):Math.min(width-12,height-398)));
  const size=workspace==='fit'?max:workspace==='pinned'?Math.max(144,Math.min(max,max+Math.min(0,sizeStep)*48)):Math.max(width>=980?600:330,Math.min(1080,(width>=980?max:width-24)+sizeStep*72));
  page.style.setProperty('--pattern-board-size',size+'px');
  $('[data-pattern-size-label]').textContent=size+' × '+size;
  updatePan();
 }
 function setWorkspace(next){
  finish();workspace=next;sizeStep=0;
  try{localStorage.setItem(viewKey,next);}catch(_){}
  hostLayout(next!=='normal');sizeBoard();render();
 }
 function updatePan(){
  if(!page)return;const scroller=$('.pattern-board-scroll'),max=scroller.scrollWidth-scroller.clientWidth;
  $('[data-pattern-pan-controls]').hidden=max<1;
  $('[data-pattern-pan="left"]').disabled=scroller.scrollLeft<1;
  $('[data-pattern-pan="right"]').disabled=scroller.scrollLeft>=max-1;
 }
 function changed(){
  shapeStart=null;
  view='paint';selectedId=null;state='editing';result=null;saveError=false;job=null;
  advice=model.analyze(mask,omit);if(advice.state==='impossible')state='impossible';
  persist();render();
 }
 function remember(){history.push(mask.slice());if(history.length>40)history.shift();future=[];}
 function replace(next){finish();shapeStart=null;if(next.every((v,i)=>!!v===mask[i])){closeTools();render();return;}remember();mask=next.slice();changed();closeTools();}
 function showPaint(){
  view='paint';selectedId=null;job=null;result=null;state='editing';saveError=false;shapeStart=null;advice=model.analyze(mask,omit);render();
 }
 function startSearch(){
  finish();closeTools();result=null;saveError=false;advice=model.analyze(mask,omit);
  if(advice.state==='impossible'){view='paint';state='impossible';render();$('[data-pattern-result-summary]').focus({preventScroll:true});return;}
  const added=queue.add({mask:mask.slice(),omit,options:{targetLevel:difficulty,levelPolicy,required:techniqueConditions?required.slice():[],excluded:techniqueConditions?excluded.slice():[]}});
  selectedId=added.id;view='preview';render();
 }
 function retrySearch(){const current=queue.get(selectedId);if(!current)return;if(['error','stopped'].includes(current.state))queue.resume(current.id);else selectedId=queue.add({mask:current.mask,omit:current.omit,options:current.options}).id;render();}
 function stopSearch(){queue.stop(selectedId);render();}
 function back(){if(closeTools())return true;if(view!=='paint'){showPaint();return true;}return false;}
 function close(force=false){
  if(!page)return true;if(saving&&!force)return false;
  window.NPPatternShare?.close();finish();closeTools();queue.persist();if(clock)clearInterval(clock);clock=null;
  window.removeEventListener('resize',sizeBoard);window.removeEventListener('pagehide',leaveHost);hostLayout(false);
  page.remove();page=null;dialog=null;jobsDialog=null;saving=false;updateDock();
  document.body.classList.remove('np-pattern-page-open','np-pattern-fit');document.documentElement.classList.remove('np-pattern-page-open','np-pattern-fit');return true;
 }
 function cellAt(x,y){const el=document.elementFromPoint(x,y)?.closest('[data-pixel]');return el&&page.contains(el)?Number(el.dataset.pixel):-1;}
 function paint(i){
  if(!stroke||i<0||(stroke.tool==='fill'&&stroke.last>=0))return;
  const from=stroke.tool==='pen'?(stroke.last<0?stroke.start:stroke.last):stroke.start;
  const next=model.draw(stroke.tool==='pen'?mask:stroke.before,from,i,{tool:stroke.tool,value:stroke.value,symmetry:stroke.symmetry});
  stroke.last=i;stroke.edited=next.some((v,at)=>v!==stroke.before[at]);
  if(next.some((v,at)=>v!==mask[at])){mask=next;changed();}
 }
 function finish(){
  if(!stroke)return;const done=stroke;stroke=null;
  if(done.edited){history.push(done.before);if(history.length>40)history.shift();future=[];}
  const grid=page?.querySelector('.pattern-grid');if(grid?.hasPointerCapture(done.id))grid.releasePointerCapture(done.id);render();
 }
 async function save(){
  if(!result||state!=='ready'||saving)return;
  const current=queue.get(selectedId);if(current?.savedUid){const done=savedHandler,uid=current.savedUid;close();done?.({uid});return;}
  const candidate=result,host=page,done=savedHandler,jobId=selectedId,options=current.options;saving=true;saveError=false;render();
  try{
   model.validate(candidate);
   if(!model.matchesRating(candidate.rating,options))throw Error('Requested conditions changed');
   const rating=candidate.rating,p={id:Nanpure.randomId(),kind:'normal',n:9,level:rating?.humanSolvable?Math.max(1,rating.level):1,rating,patternVersion:1,patternUnrated:!rating?.humanSolvable,requestedLevel:options.targetLevel,patternConditions:options,patternJobId:jobId,clueMask:candidate.mask.slice(),omittedDigit:candidate.omittedDigit,puzzle:candidate.puzzle.slice(),solution:candidate.solution.slice(),created:Date.now(),elapsed:0,completed:false,notes:{}};
   p.uid='pattern-9-'+p.id+'-'+p.created.toString(36);p.grid=p.puzzle.slice();await saveHandler(p);
   queue.markSaved(jobId,p.uid);if(page!==host)return;saving=false;close();done?.(p);
  }catch(_){if(page!==host)return;saving=false;saveError=true;render();}
 }
 const jobStateLabel=job=>t(({queued:'待機中',checking:'作成中',ready:job.savedUid?'保存済み':'完成',stopped:'停止中',error:'再開できます',impossible:'模様の確認が必要'})[job.state]||'待機中');
 function actionLabels(count=queue.list().length){
  if(!page)return;
  for(const [selector,label]of [
   ['[data-pattern-undo]',t('元に戻す')],['[data-pattern-redo]',t('取り消しを戻す')],
   ['[data-pattern-quick="presets"]',t('見本を見る')],['[data-pattern-quick="draw"]',t('道具と条件')],
   ['[data-pattern-view="paint"]',t('別の模様を描く')],
   ['[data-pattern-retry]',t(['stopped','error'].includes(state)?'再開する':'同じ条件で作る')],
   ['[data-pattern-jobs]',t('作成一覧を見る')+' '+count]
  ]){const button=$(selector);if(button.dataset.patternActionLabel===label)continue;button.dataset.patternActionLabel=label;button.textContent=label;button.setAttribute('aria-label',label);button.title=label;}
 }
 function renderJobs(){
  if(!page)return;const all=queue.list(),button=$('[data-pattern-jobs]');
  button.hidden=!all.length;
  const list=$('[data-pattern-job-list]');
  for(const item of all){
   let row=[...list.children].find(el=>el.dataset.jobRow===item.id);
   if(!row){
    row=document.createElement('article');row.className='pattern-job-row';row.dataset.jobRow=item.id;
    row.innerHTML='<span class="pattern-mini" aria-hidden="true">'+item.mask.map(v=>'<i'+(v?' class="on"':'')+'></i>').join('')+'</span><div class="pattern-job-copy"><strong data-job-title></strong><p data-job-state></p><p data-job-conditions></p><p data-job-progress></p></div><div class="pattern-job-actions"><button type="button" data-job-open></button><button type="button" data-job-stop></button><button type="button" data-job-resume></button></div>';
    for(const action of ['open','stop','resume'])row.querySelector('[data-job-'+action+']').dataset.jobId=item.id;
    list.append(row);
   }
   row.querySelector('[data-job-title]').textContent=t('模様')+' '+item.number+' · '+levelName(item.options.targetLevel);
   row.querySelector('[data-job-state]').textContent=jobStateLabel(item)+(item.state==='ready'&&item.result.rating?.humanSolvable?' · '+NP.levelText(item.result.rating.level,18):'');
   row.querySelector('[data-job-conditions]').textContent=(item.options.targetLevel?t(item.options.levelPolicy==='easier'?'難易度を下げてもよい':'難易度を下げない'):'')+((item.options.required.length||item.options.excluded.length)?' · '+t('解き方の指定あり'):'');
   row.querySelector('[data-job-progress]').textContent=item.attempts.toLocaleString()+' '+t('通り確認');
   const open=row.querySelector('[data-job-open]');open.textContent=t(item.state==='ready'?'問題を見る':'状況を見る');
   const stop=row.querySelector('[data-job-stop]');stop.hidden=!['checking','queued'].includes(item.state);stop.textContent=t('停止する');
   const resume=row.querySelector('[data-job-resume]');resume.hidden=!['stopped','error'].includes(item.state);resume.textContent=t('再開する');
   for(const control of row.querySelectorAll('button'))control.disabled=saving;
  }
  $('[data-pattern-warning]').textContent=queue.hasStorageError()?t('作成状況を端末に記録できませんでした。このページを開いたまま結果を保存してください。'):'';
  actionLabels(all.length);updateDock();
 }
 function openJobs(){if(!page||saving)return;finish();closeTools();renderJobs();jobsDialog.showModal();}
 function selectJob(id){if(!queue.get(id))return;finish();closeTools();selectedId=id;view='preview';saveError=false;render();}
 let dock=null;
 function updateDock(){
  const all=queue.list(),attention=all.filter(j=>!j.savedUid);
  if(!dock){dock=document.createElement('button');dock.type='button';dock.className='pattern-jobs-dock';dock.dataset.patternJobsDock='';dock.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('np-pattern-open-jobs')));document.body.append(dock);}
  dock.hidden=!!page||!attention.length;dock.textContent=t('作成一覧を見る')+' '+attention.length;
 }
 queue.subscribe(()=>{if(page)render();else updateDock();});
 window.addEventListener('pagehide',()=>queue.persist());updateDock();
 function mount(container,{save:saver,saved,back:goBack}){
  if(page?.isConnected&&page.parentElement===container)return;if(page)close(true);
  saveHandler=saver;savedHandler=saved;backHandler=goBack;
  history=[];future=[];sizeStep=0;view='paint';selectedId=null;job=null;state='editing';result=null;saveError=false;mask=model.presets.heart.slice();omit=0;symmetry='none';difficulty=0;brush='auto';workspace='fit';levelPolicy='exact';required=[];excluded=[];techniqueConditions=false;
  drawTool='pen';toolsTab='drawing';shapeStart=null;
  try{const savedView=localStorage.getItem(viewKey);if(['normal','pinned','fit'].includes(savedView))workspace=savedView;}catch(_){}
  try{
   const draft=JSON.parse(localStorage.getItem(draftKey));if(draft){mask=model.maskOf(draft.mask);omit=Number.isInteger(draft.omit)&&draft.omit>=0&&draft.omit<=9?draft.omit:0;symmetry=['none','horizontal','vertical','point','both'].includes(draft.symmetry)?draft.symmetry:'none';difficulty=Number.isInteger(draft.difficulty)&&draft.difficulty>=0&&draft.difficulty<=18?draft.difficulty:0;const options=model.optionsOf({targetLevel:difficulty,levelPolicy:draft.levelPolicy,required:draft.required,excluded:draft.excluded});({levelPolicy,required,excluded}=options);techniqueConditions=typeof draft.techniqueConditions==='boolean'?draft.techniqueConditions:!!(required.length||excluded.length);}
  }catch(_){}
  try{const draft=JSON.parse(localStorage.getItem(draftKey));if(draft){if(drawTools.some(([id])=>id===draft.drawTool))drawTool=draft.drawTool;if(['auto','paint','erase'].includes(draft.brush))brush=draft.brush;}}catch(_){}
  const mini=name=>'<span class="pattern-mini" aria-hidden="true">'+model.presets[name].map(v=>'<i'+(v?' class="on"':'')+'></i>').join('')+'</span>';
  page=document.createElement('section');page.id='np-pattern-page';page.className='np-pattern-page';page.setAttribute('aria-labelledby','np-pattern-title');
  page.innerHTML=`
   <header class="pattern-header"><div class="pattern-title"><h1 id="np-pattern-title" tabindex="-1">模様ナンプレ</h1><span data-pattern-count></span></div><button type="button" data-pattern-close>戻る</button><ol class="pattern-steps" aria-label="作成の流れ"><li data-pattern-step="paint">1 模様を描く</li><li data-pattern-step="preview">2 問題を作る</li></ol></header>
   <section class="pattern-canvas" aria-label="模様と問題の盤面"><div class="pattern-board-scroll"><div class="pattern-grid" role="group" aria-label="数字を置くマスを選ぶ">${Array.from({length:81},(_,i)=>'<button type="button" data-pixel="'+i+'" tabindex="'+(i===0?'0':'-1')+'" class="'+(i%9===2||i%9===5?'block-right ':'')+(Math.floor(i/9)===2||Math.floor(i/9)===5?'block-bottom':'')+'"></button>').join('')}</div></div><nav data-pattern-pan-controls hidden aria-label="盤面を横に移動"><button type="button" data-pattern-pan="left">左へ動かす</button><button type="button" data-pattern-pan="right">右へ動かす</button></nav></section>
   <nav class="pattern-quick" aria-label="模様の編集"><button type="button" data-pattern-undo hidden>元に戻す</button><button type="button" data-pattern-redo hidden>取り消しを戻す</button><button type="button" data-pattern-quick="presets">見本を見る</button><button type="button" data-pattern-quick="draw">道具と条件</button><button type="button" data-pattern-view="paint" hidden>別の模様を描く</button><button type="button" data-pattern-retry hidden>同じ条件で作る</button><button type="button" data-pattern-jobs hidden>作成一覧を見る</button></nav>
   <footer class="pattern-footer"><div class="pattern-feedback"><p data-pattern-result-summary role="status" tabindex="-1" aria-live="polite"></p><p data-pattern-next></p><span data-pattern-indicator hidden></span><p data-pattern-progress hidden></p></div>
    <label class="pattern-difficulty" data-pattern-difficulty-label>難易度<select data-pattern-difficulty><option value="0">指定しない</option>${Array.from({length:18},(_,i)=>'<option value="'+(i+1)+'">'+levelName(i+1)+'</option>').join('')}</select></label><p data-pattern-rating hidden></p>
    <div class="pattern-actions"><button type="button" class="primary" data-pattern-view="preview">2 問題を作る</button><button type="button" data-pattern-stop hidden>生成を停止する</button><button type="button" class="primary" data-pattern-save hidden>保存して遊ぶ</button><button type="button" data-pattern-share aria-label="問題を投稿・共有" hidden>共有する</button></div>
   </footer>
   <dialog class="pattern-tools-dialog" aria-labelledby="pattern-dialog-title"><header><h2 id="pattern-dialog-title" data-pattern-dialog-title></h2><button type="button" data-pattern-tools-close>閉じる</button></header>
    <section data-pattern-dialog-section="presets" hidden><p>形を選んで、自由に描き足せます。</p><div class="pattern-presets">${[['heart','ハート'],['diamond','ひし形'],['dots','市松模様'],['omit','数字抜き用']].map(([key,label])=>'<button type="button" data-pattern-preset="'+key+'" aria-pressed="false">'+mini(key)+'<span>'+label+'</span></button>').join('')}</div><button type="button" data-pattern-clear>白紙から描く</button></section>
    <section data-pattern-dialog-section="draw" hidden>
     <nav class="pattern-tools-tabs" aria-label="道具と条件の切り替え"><button type="button" data-pattern-tools-tab="drawing" aria-pressed="true">描く道具</button><button type="button" data-pattern-tools-tab="conditions" aria-pressed="false">作成条件</button></nav>
     <section data-pattern-draw-panel="drawing">
      <div class="pattern-drawing-actions"><button type="button" data-pattern-fill="white">すべて白くする</button><button type="button" data-pattern-fill="black">すべて黒くする</button><button type="button" data-pattern-fill="invert">白黒を反転する</button></div>
      <fieldset class="pattern-choice-field"><legend>対称に描く</legend><div class="pattern-choices pattern-draw-choices">${[['none','使わない'],['horizontal','左右対称'],['vertical','上下対称'],['both','上下・左右対称'],['point','点対称']].map(([id,label])=>'<label><input type="radio" name="pattern-symmetry" data-pattern-symmetry value="'+id+'"><span>'+t(label)+'</span></label>').join('')}</div></fieldset>
      <fieldset class="pattern-choice-field"><legend>描き方</legend><div class="pattern-choices pattern-draw-choices">${drawTools.map(([id,label])=>'<label><input type="radio" name="pattern-draw-tool" data-pattern-draw-tool value="'+id+'"><span>'+t(label)+'</span></label>').join('')}</div></fieldset>
      <fieldset class="pattern-choice-field"><legend>描く道具</legend><div class="pattern-choices">${[['auto','塗る／消す'],['paint','塗るだけ'],['erase','消すだけ']].map(([id,label])=>'<label><input type="radio" name="pattern-brush" data-pattern-brush value="'+id+'"><span>'+t(label)+'</span></label>').join('')}</div></fieldset>
      <details><summary>模様を移動する</summary><div class="pattern-move-tools"><button type="button" data-pattern-shift="up">上へ動かす</button><button type="button" data-pattern-shift="left">左へ動かす</button><button type="button" data-pattern-shift="center">中央へ寄せる</button><button type="button" data-pattern-shift="right">右へ動かす</button><button type="button" data-pattern-shift="down">下へ動かす</button></div><p>端から出るマスは消えます。元に戻せます。</p></details>
      <details><summary>模様を回す・反転する</summary><div class="pattern-transforms"><button type="button" data-pattern-transform="1">右に90°回す</button><button type="button" data-pattern-transform="4">左右を反転する</button><button type="button" data-pattern-transform="6">上下を反転する</button></div></details>
     <details class="pattern-display-options"><summary>表示・大きさ</summary><label>画面の表示方法<select data-pattern-workspace-select><option value="fit">一画面に収める</option><option value="pinned">盤面を固定</option><option value="normal">通常表示</option></select></label><div class="pattern-size-options"><div class="pattern-size-tools"><button type="button" data-pattern-size="smaller">小さくする</button><output data-pattern-size-label></output><button type="button" data-pattern-size="larger">大きくする</button></div><button type="button" data-pattern-size="reset">標準に戻す</button></div></details>
      <p>まとめて変更した操作も、元に戻せます。</p>
     </section>
     <section data-pattern-draw-panel="conditions" hidden>
     <fieldset class="pattern-choice-field" data-pattern-policy-label><legend>難易度の扱い</legend><div class="pattern-choices pattern-policy-choices"><label><input type="radio" name="pattern-level-policy" data-pattern-policy value="exact"><span>難易度を下げない</span></label><label><input type="radio" name="pattern-level-policy" data-pattern-policy value="easier"><span>難易度を下げてもよい</span></label></div></fieldset>
     <section class="pattern-technique-options"><label class="pattern-condition-switch"><span>解き方の条件</span><input type="checkbox" role="switch" data-pattern-techniques-enabled aria-label="解き方の条件を使う"><strong data-pattern-techniques-state>使わない</strong></label><div data-pattern-technique-panel hidden><p>「使う」は検査時の解答手順に必ず含めます。「使わない」は手順から除きます。「指定しない」は、どちらでもかまいません。</p><div class="pattern-technique-list">${model.techniques.map(([id,name])=>'<fieldset class="pattern-choice-field"><legend>'+t(name)+'</legend><div class="pattern-choices">'+[['any','指定しない'],['required','使う'],['excluded','使わない']].map(([value,label])=>'<label><input type="radio" name="pattern-technique-'+id+'" data-pattern-technique="'+id+'" value="'+value+'"><span>'+t(label)+'</span></label>').join('')+'</div></fieldset>').join('')}</div></div></section>
     <details class="pattern-digit-options"><summary>数字を1種類抜く</summary><label>初期数字に使わない数字<select data-pattern-omit><option value="0">抜かない</option>${Array.from({length:9},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')}</select></label><p>選んだ数字を初期配置から抜きます。解くときは通常どおり1〜9を使います。</p></details>
     <details class="pattern-math-guide"><summary>描き方・作成のコツ</summary><p>タップで塗る・消す。なぞるとまとめて変更できます。</p><p>矢印キーで移動、Space・Enterで塗る・消す。</p><p>数字を置くマスを17個以上塗ってください。</p><p>模様によっては希望の難易度を作れない場合があります。難易度か模様を変えて試せます。</p><a href="https://arxiv.org/abs/1201.0749" target="_blank" rel="noopener noreferrer">17個以上の根拠</a><a href="https://arxiv.org/abs/2005.14098" target="_blank" rel="noopener noreferrer">模様指定の生成研究</a></details>
     </section>
    </section><p data-pattern-warning role="status"></p>
   </dialog><dialog class="pattern-tools-dialog pattern-jobs-dialog" aria-labelledby="pattern-jobs-title"><header><h2 id="pattern-jobs-title">作成一覧</h2><button type="button" data-pattern-jobs-close>閉じる</button></header><p>戻る・編集では作成は止まりません。止めたい模様の「停止する」を押してください。</p><div data-pattern-job-list></div></dialog>`;
  container.replaceChildren(page);dialog=$('.pattern-tools-dialog');jobsDialog=$('.pattern-jobs-dialog');for(const el of [dialog,jobsDialog])el.addEventListener('cancel',event=>{event.preventDefault();closeTools();});
  document.documentElement.classList.add('np-pattern-page-open');document.body.classList.add('np-pattern-page-open');
  window.addEventListener('resize',sizeBoard);window.addEventListener('pagehide',leaveHost);setWorkspace(workspace);changed();clock=setInterval(()=>{updateProgress();renderJobs();},1000);
  page.addEventListener('click',event=>{
   const el=event.composedPath().find(node=>node?.matches?.('button')&&page.contains(node));if(!el||saving)return;
   if(el.hasAttribute('data-pattern-close')){if(!back())backHandler?.();return;}
   if(el.hasAttribute('data-pattern-tools-close'))return void closeTools();
   if(el.hasAttribute('data-pattern-jobs-close'))return void closeTools();
   if(el.hasAttribute('data-pattern-jobs'))return openJobs();
   if(el.hasAttribute('data-job-open'))return selectJob(el.dataset.jobId);
   if(el.hasAttribute('data-job-stop'))return queue.stop(el.dataset.jobId);
   if(el.hasAttribute('data-job-resume'))return queue.resume(el.dataset.jobId);
   if(el.hasAttribute('data-pattern-quick'))return openTools(el.dataset.patternQuick);
   if(el.hasAttribute('data-pattern-tools-tab')){toolsTab=el.dataset.patternToolsTab;render();return;}
   if(el.hasAttribute('data-pattern-view'))return el.dataset.patternView==='paint'?showPaint():startSearch();
   if(el.hasAttribute('data-pattern-retry'))return retrySearch();
   if(el.hasAttribute('data-pattern-stop'))return stopSearch();
   if(el.hasAttribute('data-pattern-save'))return void save();
   if(el.hasAttribute('data-pattern-share')&&result)return void window.NPPatternShare?.open(result.puzzle);
   if(el.hasAttribute('data-pattern-preset'))return replace(model.presets[el.dataset.patternPreset]);
   if(el.hasAttribute('data-pattern-clear'))return replace(Array(81).fill(false));
   if(el.hasAttribute('data-pattern-fill'))return replace(el.dataset.patternFill==='invert'?mask.map(v=>!v):Array(81).fill(el.dataset.patternFill==='black'));
   if(el.hasAttribute('data-pattern-shift')){const action=el.dataset.patternShift,[dx,dy]={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1],center:[0,0]}[action];return replace(action==='center'?model.center(mask):model.shift(mask,dx,dy));}
   if(el.hasAttribute('data-pattern-transform'))return replace(model.transform(mask,Number(el.dataset.patternTransform)));
   if(el.hasAttribute('data-pattern-undo')&&history.length){future.push(mask.slice());mask=history.pop();changed();return;}
   if(el.hasAttribute('data-pattern-redo')&&future.length){history.push(mask.slice());mask=future.pop();changed();return;}
   if(el.hasAttribute('data-pattern-size')){const action=el.dataset.patternSize;sizeStep=action==='reset'?0:action==='larger'?Math.min(5,sizeStep+1):Math.max(-3,sizeStep-1);sizeBoard();render();return;}
   if(el.hasAttribute('data-pattern-pan')){const area=$('.pattern-board-scroll');area.scrollBy({left:(el.dataset.patternPan==='left'?-1:1)*Math.max(100,area.clientWidth*.6),behavior:'auto'});updatePan();return;}
   if(el.hasAttribute('data-pixel')&&event.detail===0&&view==='paint'){
    const i=Number(el.dataset.pixel);if(!['pen','fill'].includes(drawTool)&&shapeStart===null){shapeStart=i;render();return;}
    const from=shapeStart??i,value=brush==='auto'?!mask[from]:brush==='paint';return replace(model.draw(mask,from,i,{tool:drawTool,value,symmetry}));
   }
  });
  page.addEventListener('change',event=>{
   if(saving)return;const el=event.target;
   if(el.hasAttribute('data-pattern-difficulty')){difficulty=Number(el.value);persist();render();return;}
   if(el.hasAttribute('data-pattern-policy')){levelPolicy=el.value;persist();return;}
   if(el.hasAttribute('data-pattern-techniques-enabled')){techniqueConditions=el.checked;persist();render();return;}
   if(el.hasAttribute('data-pattern-technique')){required=[...page.querySelectorAll('[data-pattern-technique]:checked')].filter(e=>e.value==='required').map(e=>e.dataset.patternTechnique);excluded=[...page.querySelectorAll('[data-pattern-technique]:checked')].filter(e=>e.value==='excluded').map(e=>e.dataset.patternTechnique);persist();return;}
   if(el.hasAttribute('data-pattern-draw-tool')){finish();drawTool=el.value;shapeStart=null;persist();render();return;}
   if(el.hasAttribute('data-pattern-brush')){brush=el.value;persist();return;}
   if(el.hasAttribute('data-pattern-symmetry')){symmetry=el.value;persist();return;}
   if(el.hasAttribute('data-pattern-omit')){omit=Number(el.value);changed();return;}
   if(el.hasAttribute('data-pattern-workspace-select')){setWorkspace(el.value);closeTools();}
  });
  $('.pattern-board-scroll').addEventListener('scroll',updatePan);
  const grid=$('.pattern-grid');
  grid.addEventListener('pointerdown',event=>{
   const cell=event.target.closest('[data-pixel]');if(!cell||saving||view!=='paint'||event.button!==0)return;
   event.preventDefault();for(const el of grid.querySelectorAll('[data-pixel]'))el.tabIndex=-1;cell.tabIndex=0;cell.focus({preventScroll:true});
   const start=Number(cell.dataset.pixel);shapeStart=null;stroke={id:event.pointerId,before:mask.slice(),start,tool:drawTool,symmetry,value:brush==='auto'?!mask[start]:brush==='paint',last:-1,edited:false};grid.setPointerCapture(event.pointerId);paint(start);
  });
  grid.addEventListener('pointermove',event=>{if(stroke&&event.pointerId===stroke.id)paint(cellAt(event.clientX,event.clientY));});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])grid.addEventListener(type,finish);
  grid.addEventListener('keydown',event=>{
   const cell=event.target.closest('[data-pixel]');if(!cell)return;const i=Number(cell.dataset.pixel),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[event.key];
   if(event.key==='Escape'&&shapeStart!==null){event.preventDefault();event.stopPropagation();shapeStart=null;render();return;}
   if(delta){event.preventDefault();cell.tabIndex=-1;const next=$('[data-pixel="'+Math.max(0,Math.min(80,i+delta))+'"]');next.tabIndex=0;next.focus();}
  });
  page.addEventListener('keydown',event=>{
   if(view!=='paint'||saving||(!event.ctrlKey&&!event.metaKey)||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
   const key=event.key.toLowerCase(),redo=key==='y'||(key==='z'&&event.shiftKey);if(key!=='z'&&key!=='y')return;event.preventDefault();finish();shapeStart=null;
   if(redo&&future.length){history.push(mask.slice());mask=future.pop();changed();}else if(!redo&&history.length){future.push(mask.slice());mask=history.pop();changed();}
  });
  $('#np-pattern-title').focus({preventScroll:true});
 }
 window.NPPattern={mount,close,closeTools,back,openJobs,isOpen:()=>!!page,isSaving:()=>saving};
})();
