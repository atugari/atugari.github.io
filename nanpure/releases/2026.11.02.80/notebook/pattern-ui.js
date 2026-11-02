(function () {
 'use strict';
 const model=window.NPPatternModel, draftKey='nanpure-pattern-draft-v1', viewKey='nanpure-pattern-workspace-v1';
 const t=(text,params)=>window.NPI18n?.t(text,params)||text;
 let page=null, dialog=null, worker=null, revision=0, job=null, clock=null, saving=false;
 let mask=[], omit=0, symmetry='none', brush='auto', difficulty=0, workspace='fit', sizeStep=0;
 let view='paint', state='editing', result=null, history=[], future=[], stroke=null, advice=null, saveError=false;
 let saveHandler, savedHandler, backHandler;
 const $=selector=>page.querySelector(selector);
 const levelName=value=>value?NP.levelText(value,18):t('指定しない');
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
  try{localStorage.setItem(draftKey,JSON.stringify({mask:mask.map(Number),omit,symmetry,difficulty}));}
  catch(_){$('[data-pattern-warning]').textContent=t('模様を端末に記憶できませんでした。この画面では続けて編集できます。');}
 }
 function cancelSearch(){
  revision++;if(clock)clearInterval(clock);clock=null;
  if(worker)worker.terminate();worker=null;job=null;
 }
 function closeTools(){if(!dialog?.open)return false;dialog.close();return true;}
 function openTools(area){
  if(saving||view!=='paint')return;
  page.dataset.dialog=area;
  $('[data-pattern-dialog-title]').textContent=t(area==='presets'?'見本を選ぶ':'編集オプション');
  for(const section of dialog.querySelectorAll('[data-pattern-dialog-section]'))section.hidden=section.dataset.patternDialogSection!==area;
  if(!dialog.open)dialog.showModal();
 }
 function render(){
  if(!page)return;
  const checking=state==='checking', ready=state==='ready'&&!!result, paint=view==='paint';
  page.dataset.view=view;page.dataset.state=state;page.dataset.workspace=workspace;
  $('.pattern-footer').setAttribute('aria-busy',String(checking||saving));
  for(const el of page.querySelectorAll('[data-pixel]')){
   const i=Number(el.dataset.pixel);el.classList.toggle('painted',mask[i]);el.classList.toggle('needs-work',!!advice?.cells?.includes(i));
   el.setAttribute('aria-pressed',String(mask[i]));el.setAttribute('aria-disabled',String(!paint));
   el.setAttribute('aria-label',(Math.floor(i/9)+1)+'行'+(i%9+1)+'列・'+(mask[i]?'数字を置く':'空きマス')+(!paint&&ready&&result.puzzle[i]?'・'+result.puzzle[i]:''));
   el.textContent=!paint&&ready?(result.puzzle[i]||''):'';
  }
  for(const step of page.querySelectorAll('[data-pattern-step]')){
   if(step.dataset.patternStep===(paint?'paint':'preview'))step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');
  }
  $('[data-pattern-count]').textContent=mask.filter(Boolean).length+' / 81';
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
  $('[data-pattern-omit]').value=String(omit);$('[data-pattern-symmetry]').value=symmetry;$('[data-pattern-brush-select]').value=brush;
  $('[data-pattern-workspace-select]').value=workspace;
  const sizeControls=$('.pattern-size-options');sizeControls.hidden=workspace==='fit';
  $('[data-pattern-size="smaller"]').disabled=sizeStep<=-3;
  $('[data-pattern-size="larger"]').disabled=sizeStep>=5;
  for(const el of page.querySelectorAll('[data-pattern-preset]'))el.setAttribute('aria-pressed',String(model.presets[el.dataset.patternPreset].every((v,i)=>!!v===mask[i])));
  let title='',help='';
  if(saving){title='保存しています…';help='このままお待ちください';}
  else if(saveError){title='保存できませんでした';help='空き容量を確認して再保存';}
  else if(checking){title='条件に合う問題を探しています…';help='見つかるまで自動で続けます';}
  else if(ready&&!paint){title='問題ができました';help='保存して遊ぶか、画像で共有できます';}
  else if(state==='error'){title='作成を開始できませんでした';help='「もう一度作る」で再開できます';}
  else if(state==='stopped'){title='作成を停止しました';help='「もう一度作る」で続けられます';}
  else if(advice?.state==='impossible'){title='模様を少し直してください';help=reasonText(advice);}
  else{title='タップ・なぞって模様を描く';help='塗ったマスに数字が入ります';}
  $('[data-pattern-result-summary]').textContent=t(title);
  $('[data-pattern-next]').textContent=t(help);
  const indicator=$('[data-pattern-indicator]');indicator.dataset.state=state;
  $('[data-pattern-rating]').textContent=ready?((result.rating?.humanSolvable?NP.levelText(result.rating.level,18):t('難易度未判定'))+' · '+t('答えは1つです')):t('難易度')+'：'+levelName(difficulty);
  for(const el of page.querySelectorAll('button,select'))if(!el.closest('.pattern-grid')&&!el.hasAttribute('data-pattern-size'))el.disabled=saving;
  updateProgress();
 }
 function updateProgress(){
  if(!page)return;const progress=$('[data-pattern-progress]');progress.hidden=!job;
  if(!job)return;
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
  const max=Math.max(144,Math.floor(side?Math.min(height-16,width-(width>=980?364:264)):Math.min(width-12,height-328)));
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
  cancelSearch();view='paint';state='editing';result=null;saveError=false;
  advice=model.analyze(mask,omit);if(advice.state==='impossible')state='impossible';
  persist();render();
 }
 function remember(){history.push(mask.slice());if(history.length>40)history.shift();future=[];}
 function replace(next){remember();mask=next.slice();changed();closeTools();}
 function showPaint(){
  cancelSearch();view='paint';state='editing';saveError=false;advice=model.analyze(mask,omit);render();
 }
 function startSearch(){
  finish();closeTools();cancelSearch();result=null;saveError=false;advice=model.analyze(mask,omit);
  if(advice.state==='impossible'){view='paint';state='impossible';render();$('[data-pattern-result-summary]').focus({preventScroll:true});return;}
  view='preview';state='checking';job={attempts:0,started:Date.now()};const token=revision;
  render();clock=setInterval(updateProgress,1000);
  const source=document.getElementById('core-normal');
  function fail(){if(!page||token!==revision)return;cancelSearch();state='error';render();}
  if(!source||typeof Worker==='undefined'){fail();return;}
  const code='var global=self;\n'+source.textContent+'\nself.NPPatternModel=('+model.create.toString()+')();self.onmessage=function(e){try{self.postMessage(NPPatternModel.search(e.data.mask,e.data.omit,{milliseconds:900,maxAttempts:500,offset:e.data.offset,targetLevel:e.data.targetLevel,rate:Nanpure.ratePuzzle}));}catch(err){self.postMessage({state:"error"});}};';
  let url;
  try{
   url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);url=null;
   const next=()=>{if(page&&token===revision&&job)worker.postMessage({mask:mask.slice(),omit,targetLevel:difficulty,offset:job.attempts});};
   worker.onmessage=event=>{
    if(!page||token!==revision||!job)return;const data=event.data;
    job.attempts+=Math.max(0,Number(data.attempts)||0);
    if(data.state==='ready'){
     if(difficulty&&(!data.rating?.humanSolvable||data.rating.level!==difficulty)){fail();return;}
     cancelSearch();result=data;state='ready';render();
    }else if(data.state==='unknown'){
     updateProgress();next();
    }else if(data.state==='impossible'){
     cancelSearch();advice=data;view='paint';state='impossible';render();
    }else fail();
   };
   worker.onerror=event=>{event.preventDefault();fail();};next();
  }catch(_){if(url)URL.revokeObjectURL(url);fail();}
 }
 function stopSearch(){cancelSearch();state='stopped';render();}
 function back(){if(closeTools())return true;if(view!=='paint'){showPaint();return true;}return false;}
 function close(force=false){
  if(!page)return true;if(saving&&!force)return false;
  window.NPPatternShare?.close();finish();cancelSearch();closeTools();
  window.removeEventListener('resize',sizeBoard);window.removeEventListener('pagehide',leaveHost);hostLayout(false);
  page.remove();page=null;dialog=null;saving=false;
  document.body.classList.remove('np-pattern-page-open','np-pattern-fit');document.documentElement.classList.remove('np-pattern-page-open','np-pattern-fit');return true;
 }
 function cellAt(x,y){const el=document.elementFromPoint(x,y)?.closest('[data-pixel]');return el&&page.contains(el)?Number(el.dataset.pixel):-1;}
 function paint(i){
  if(!stroke||i<0)return;const old=stroke.last,steps=old<0?0:Math.max(Math.abs(i%9-old%9),Math.abs(Math.floor(i/9)-Math.floor(old/9)));let edited=false;
  for(let s=0;s<=steps;s++){
   const f=steps?s/steps:1,c=old<0?i%9:Math.round(old%9+(i%9-old%9)*f),r=old<0?Math.floor(i/9):Math.round(Math.floor(old/9)+(Math.floor(i/9)-Math.floor(old/9))*f);
   for(const target of model.symmetricCells(r*9+c,symmetry))if(mask[target]!==stroke.value){mask[target]=stroke.value;edited=true;}
  }
  stroke.last=i;if(edited){stroke.edited=true;changed();}
 }
 function finish(){
  if(!stroke)return;const done=stroke;stroke=null;
  if(done.edited){history.push(done.before);if(history.length>40)history.shift();future=[];}
  const grid=page?.querySelector('.pattern-grid');if(grid?.hasPointerCapture(done.id))grid.releasePointerCapture(done.id);render();
 }
 async function save(){
  if(!result||state!=='ready'||saving)return;
  const candidate=result,host=page,done=savedHandler;saving=true;saveError=false;render();
  try{
   model.validate(candidate);
   if(difficulty&&(!candidate.rating?.humanSolvable||candidate.rating.level!==difficulty))throw Error('Requested difficulty changed');
   const rating=candidate.rating,p={id:Nanpure.randomId(),kind:'normal',n:9,level:rating?.humanSolvable?Math.max(1,rating.level):1,rating,patternVersion:1,patternUnrated:!rating?.humanSolvable,requestedLevel:difficulty,clueMask:candidate.mask.slice(),omittedDigit:candidate.omittedDigit,puzzle:candidate.puzzle.slice(),solution:candidate.solution.slice(),created:Date.now(),elapsed:0,completed:false,notes:{}};
   p.uid='pattern-9-'+p.id+'-'+p.created.toString(36);p.grid=p.puzzle.slice();await saveHandler(p);
   if(page!==host)return;saving=false;close();done?.(p);
  }catch(_){if(page!==host)return;saving=false;saveError=true;render();}
 }
 function mount(container,{save:saver,saved,back:goBack}){
  if(page?.isConnected&&page.parentElement===container)return;if(page)close(true);
  saveHandler=saver;savedHandler=saved;backHandler=goBack;
  history=[];future=[];sizeStep=0;view='paint';state='editing';result=null;saveError=false;mask=model.presets.heart.slice();omit=0;symmetry='none';difficulty=0;brush='auto';workspace='fit';
  try{const savedView=localStorage.getItem(viewKey);if(['normal','pinned','fit'].includes(savedView))workspace=savedView;}catch(_){}
  try{
   const draft=JSON.parse(localStorage.getItem(draftKey));if(draft){mask=model.maskOf(draft.mask);omit=Number.isInteger(draft.omit)&&draft.omit>=0&&draft.omit<=9?draft.omit:0;symmetry=['none','horizontal','vertical','point','both'].includes(draft.symmetry)?draft.symmetry:'none';difficulty=Number.isInteger(draft.difficulty)&&draft.difficulty>=0&&draft.difficulty<=18?draft.difficulty:0;}
  }catch(_){}
  const mini=name=>'<span class="pattern-mini" aria-hidden="true">'+model.presets[name].map(v=>'<i'+(v?' class="on"':'')+'></i>').join('')+'</span>';
  page=document.createElement('section');page.id='np-pattern-page';page.className='np-pattern-page';page.setAttribute('aria-labelledby','np-pattern-title');
  page.innerHTML=`
   <header class="pattern-header"><div class="pattern-title"><h1 id="np-pattern-title" tabindex="-1">模様ナンプレ</h1><span data-pattern-count></span></div><button type="button" data-pattern-close>戻る</button><ol class="pattern-steps" aria-label="作成の流れ"><li data-pattern-step="paint">1 模様を描く</li><li data-pattern-step="preview">2 問題を作る</li></ol></header>
   <section class="pattern-canvas" aria-label="模様と問題の盤面"><div class="pattern-board-scroll"><div class="pattern-grid" role="group" aria-label="数字を置くマスを選ぶ">${Array.from({length:81},(_,i)=>'<button type="button" data-pixel="'+i+'" tabindex="'+(i===0?'0':'-1')+'" class="'+(i%9===2||i%9===5?'block-right ':'')+(Math.floor(i/9)===2||Math.floor(i/9)===5?'block-bottom':'')+'"></button>').join('')}</div></div><nav data-pattern-pan-controls hidden aria-label="盤面を横に移動"><button type="button" data-pattern-pan="left" aria-label="盤面を左に動かす">←</button><button type="button" data-pattern-pan="right" aria-label="盤面を右に動かす">→</button></nav></section>
   <nav class="pattern-quick" aria-label="模様の編集"><button type="button" data-pattern-undo hidden>元に戻す</button><button type="button" data-pattern-redo hidden>やり直す</button><button type="button" data-pattern-quick="presets">見本</button><button type="button" data-pattern-quick="draw">編集</button><button type="button" data-pattern-view="paint" hidden>模様を直す</button><button type="button" data-pattern-retry hidden>もう一度作る</button></nav>
   <footer class="pattern-footer"><div class="pattern-feedback"><p data-pattern-result-summary role="status" tabindex="-1" aria-live="polite"></p><p data-pattern-next></p><span data-pattern-indicator hidden></span><p data-pattern-progress hidden></p></div>
    <label class="pattern-difficulty" data-pattern-difficulty-label>難易度<select data-pattern-difficulty><option value="0">指定しない</option>${Array.from({length:18},(_,i)=>'<option value="'+(i+1)+'">'+levelName(i+1)+'</option>').join('')}</select></label><p data-pattern-rating hidden></p>
    <div class="pattern-actions"><button type="button" class="primary" data-pattern-view="preview">2 問題を作る</button><button type="button" data-pattern-stop hidden>作成を止める</button><button type="button" class="primary" data-pattern-save hidden>保存して遊ぶ</button><button type="button" data-pattern-share hidden>画像で共有</button></div>
   </footer>
   <dialog class="pattern-tools-dialog" aria-labelledby="pattern-dialog-title"><header><h2 id="pattern-dialog-title" data-pattern-dialog-title></h2><button type="button" data-pattern-tools-close>閉じる</button></header>
    <section data-pattern-dialog-section="presets" hidden><p>形を選んで、自由に描き足せます。</p><div class="pattern-presets">${[['heart','ハート'],['diamond','ひし形'],['dots','市松模様'],['omit','数字抜き用']].map(([key,label])=>'<button type="button" data-pattern-preset="'+key+'" aria-pressed="false">'+mini(key)+'<span>'+label+'</span></button>').join('')}</div><button type="button" data-pattern-clear>白紙から描く</button></section>
    <section data-pattern-dialog-section="draw" hidden>
     <label>描く道具<select data-pattern-brush-select><option value="auto">塗る／消す</option><option value="paint">塗るだけ</option><option value="erase">消すだけ</option></select></label>
     <label>対称に描く<select data-pattern-symmetry><option value="none">使わない</option><option value="horizontal">左右対称</option><option value="vertical">上下対称</option><option value="point">点対称</option><option value="both">上下・左右対称</option></select></label>
     <details><summary>回転・反転</summary><div class="pattern-transforms"><button type="button" data-pattern-transform="1">90°回転</button><button type="button" data-pattern-transform="4">左右反転</button><button type="button" data-pattern-transform="6">上下反転</button></div></details>
     <details class="pattern-display-options"><summary>表示・大きさ</summary><label>画面の表示方法<select data-pattern-workspace-select><option value="fit">一画面に収める</option><option value="pinned">盤面を固定</option><option value="normal">通常表示</option></select></label><div class="pattern-size-options"><div class="pattern-size-tools"><button type="button" data-pattern-size="smaller" aria-label="盤面を小さく">−</button><output data-pattern-size-label></output><button type="button" data-pattern-size="larger" aria-label="盤面を大きく">＋</button></div><button type="button" data-pattern-size="reset">標準の大きさ</button></div></details>
     <details class="pattern-digit-options"><summary>数字を1種類抜く</summary><label>初期数字に使わない数字<select data-pattern-omit><option value="0">抜かない</option>${Array.from({length:9},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')}</select></label><p>選んだ数字を初期配置から抜きます。解くときは通常どおり1〜9を使います。</p></details>
     <details class="pattern-math-guide"><summary>描き方・作成のコツ</summary><p>タップで塗る・消す。なぞるとまとめて変更できます。</p><p>矢印キーで移動、Space・Enterで塗る・消す。</p><p>数字を置くマスを17個以上塗ってください。</p><p>模様によっては希望の難易度を作れない場合があります。難易度か模様を変えて試せます。</p><a href="https://arxiv.org/abs/1201.0749" target="_blank" rel="noopener noreferrer">17個以上の根拠</a><a href="https://arxiv.org/abs/2005.14098" target="_blank" rel="noopener noreferrer">模様指定の生成研究</a></details>
    </section><p data-pattern-warning role="status"></p>
   </dialog>`;
  container.replaceChildren(page);dialog=$('.pattern-tools-dialog');dialog.addEventListener('cancel',event=>{event.preventDefault();closeTools();});
  document.documentElement.classList.add('np-pattern-page-open');document.body.classList.add('np-pattern-page-open');
  window.addEventListener('resize',sizeBoard);window.addEventListener('pagehide',leaveHost);setWorkspace(workspace);changed();
  page.addEventListener('click',event=>{
   const el=event.composedPath().find(node=>node?.matches?.('button')&&page.contains(node));if(!el||saving)return;
   if(el.hasAttribute('data-pattern-close')){if(!back())backHandler?.();return;}
   if(el.hasAttribute('data-pattern-tools-close'))return void closeTools();
   if(el.hasAttribute('data-pattern-quick'))return openTools(el.dataset.patternQuick);
   if(el.hasAttribute('data-pattern-view'))return el.dataset.patternView==='paint'?showPaint():startSearch();
   if(el.hasAttribute('data-pattern-retry'))return startSearch();
   if(el.hasAttribute('data-pattern-stop'))return stopSearch();
   if(el.hasAttribute('data-pattern-save'))return void save();
   if(el.hasAttribute('data-pattern-share')&&result)return void window.NPPatternShare?.open(result.puzzle);
   if(el.hasAttribute('data-pattern-preset'))return replace(model.presets[el.dataset.patternPreset]);
   if(el.hasAttribute('data-pattern-clear'))return replace(Array(81).fill(false));
   if(el.hasAttribute('data-pattern-transform'))return replace(model.transform(mask,Number(el.dataset.patternTransform)));
   if(el.hasAttribute('data-pattern-undo')&&history.length){future.push(mask.slice());mask=history.pop();changed();return;}
   if(el.hasAttribute('data-pattern-redo')&&future.length){history.push(mask.slice());mask=future.pop();changed();return;}
   if(el.hasAttribute('data-pattern-size')){const action=el.dataset.patternSize;sizeStep=action==='reset'?0:action==='larger'?Math.min(5,sizeStep+1):Math.max(-3,sizeStep-1);sizeBoard();render();return;}
   if(el.hasAttribute('data-pattern-pan')){const area=$('.pattern-board-scroll');area.scrollBy({left:(el.dataset.patternPan==='left'?-1:1)*Math.max(100,area.clientWidth*.6),behavior:'auto'});updatePan();return;}
   if(el.hasAttribute('data-pixel')&&event.detail===0&&view==='paint'){
    remember();const i=Number(el.dataset.pixel),value=brush==='auto'?!mask[i]:brush==='paint';for(const at of model.symmetricCells(i,symmetry))mask[at]=value;changed();
   }
  });
  page.addEventListener('change',event=>{
   if(saving)return;const el=event.target;
   if(el.hasAttribute('data-pattern-difficulty')){difficulty=Number(el.value);persist();return;}
   if(el.hasAttribute('data-pattern-brush-select')){brush=el.value;return;}
   if(el.hasAttribute('data-pattern-symmetry')){symmetry=el.value;persist();return;}
   if(el.hasAttribute('data-pattern-omit')){omit=Number(el.value);changed();return;}
   if(el.hasAttribute('data-pattern-workspace-select')){setWorkspace(el.value);closeTools();}
  });
  $('.pattern-board-scroll').addEventListener('scroll',updatePan);
  const grid=$('.pattern-grid');
  grid.addEventListener('pointerdown',event=>{
   const cell=event.target.closest('[data-pixel]');if(!cell||saving||view!=='paint'||event.button!==0)return;
   event.preventDefault();for(const el of grid.querySelectorAll('[data-pixel]'))el.tabIndex=-1;cell.tabIndex=0;cell.focus({preventScroll:true});
   stroke={id:event.pointerId,before:mask.slice(),value:brush==='auto'?!mask[Number(cell.dataset.pixel)]:brush==='paint',last:-1,edited:false};grid.setPointerCapture(event.pointerId);paint(Number(cell.dataset.pixel));
  });
  grid.addEventListener('pointermove',event=>{if(stroke&&event.pointerId===stroke.id)paint(cellAt(event.clientX,event.clientY));});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])grid.addEventListener(type,finish);
  grid.addEventListener('keydown',event=>{
   const cell=event.target.closest('[data-pixel]');if(!cell)return;const i=Number(cell.dataset.pixel),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[event.key];
   if(delta){event.preventDefault();cell.tabIndex=-1;const next=$('[data-pixel="'+Math.max(0,Math.min(80,i+delta))+'"]');next.tabIndex=0;next.focus();}
  });
  $('#np-pattern-title').focus({preventScroll:true});
 }
 window.NPPattern={mount,close,closeTools,back,isOpen:()=>!!page,isSaving:()=>saving};
})();
