(function(){
 'use strict';
 const model=window.NPPatternModel,key='nanpure-pattern-draft-v1';let dialog=null,worker=null,timer=null,revision=0,result=null,mask=[],omit=0,brush='auto',view='paint',symmetry="none",adviceCells=new Set(),history=[],future=[],stroke=null,saveHandler=null,returnFocus=null,saving=false,layoutObserver=null,layoutFrame=null;
 const reasons={few:'作れません：初期数字は17マス以上必要です。',full:'空きマスを1つ以上残してください。',rows:'作れません：同じ3行の帯に、数字のない行が2本あるため答えが1つに定まりません。',cols:'作れません：同じ3列の帯に、数字のない列が2本あるため答えが1つに定まりません。',digit:'作れません：白いマスだけでは、抜く数字を各行・列・3×3の枠に1つずつ置けません。'};
 const $=selector=>dialog.querySelector(selector);
 function persist(){try{localStorage.setItem(key,JSON.stringify({mask:mask.map(Number),omit,symmetry}));}catch(_){$('[data-pattern-warning]').textContent='模様を端末に記憶できませんでした。この画面では続けて編集できます。';}}
 function stop(){revision++;clearTimeout(timer);timer=null;if(worker){worker.terminate();worker=null;}result=null;}
 function fitBoard(){
  layoutFrame=null;if(!dialog||stroke)return;
  const board=$('.pattern-grid'),footer=$('.pattern-footer'),available=footer.getBoundingClientRect().top-board.getBoundingClientRect().top-12;
  const size=Math.floor(Math.max(270,Math.min(530,$('.pattern-canvas').clientWidth,available)));
  if(board.style.width!==size+'px')board.style.width=size+'px';
 }
 function queueLayout(){if(layoutFrame===null)layoutFrame=requestAnimationFrame(fitBoard);}
 function status(state,message){if(!dialog)return;const el=$('[data-pattern-status]');el.dataset.state=state;el.textContent=message;$('[data-pattern-save]').disabled=state!=='ready'||saving;$('[data-pattern-view="preview"]').disabled=state!=='ready'||saving;$('[data-pattern-retry]').hidden=!['unknown','error','ready'].includes(state);queueLayout();}
 function showAdvice(data){
  adviceCells=new Set(data?.cells||[]);if(!dialog)return;
  const line=$('[data-pattern-advice]');let message='';
  if(data?.reason==='few')message='あと'+data.needed+'マス以上を塗る必要があります。17マス以上でも、配置によって答えが複数残ることがあります。';
  if(data?.reason==='rows'||data?.reason==='cols')message=data.indices.map(i=>i+1).join('・')+(data.reason==='rows'?'行':'列')+'のうち'+data.needed+'本以上に、数字を置くマスを作ってください。オレンジの点線で場所を示しています。';
  if(data?.reason==='digit'&&data.unit)message=(data.index+1)+(data.unit==='row'?'行目':data.unit==='col'?'列目':'番目の3×3の枠')+'に、抜く数字のための白いマスを1つ以上残してください。点線の場所を「消す」で白くできます。';
  if(data?.reason==='digit'&&!data.unit)message='白いマスの位置の組み合わせが条件を満たしません。「数字抜き用」の見本から描き直す方法もあります。';
  line.textContent=message;line.hidden=!message;
  for(const el of dialog.querySelectorAll('[data-pixel]'))el.classList.toggle('needs-work',adviceCells.has(Number(el.dataset.pixel)));
 }
 function draw(){
  if(!dialog)return;
  for(const el of dialog.querySelectorAll('[data-pixel]')){const i=Number(el.dataset.pixel);el.classList.toggle('painted',mask[i]);el.classList.toggle('needs-work',adviceCells.has(i));el.setAttribute('aria-pressed',String(mask[i]));el.setAttribute('aria-label',(Math.floor(i/9)+1)+'行'+(i%9+1)+'列・'+(mask[i]?'数字を置く':'空きマス')+(view==='preview'&&result?.puzzle[i]?'・'+result.puzzle[i]:''));el.setAttribute('aria-disabled',String(view==='preview'));el.textContent=view==='preview'?(result?.puzzle[i]||''):'';}
  dialog.dataset.view=view;
  for(const el of dialog.querySelectorAll('[data-pattern-view]'))el.setAttribute('aria-pressed',String(el.dataset.patternView===view));
  for(const el of dialog.querySelectorAll('[data-pattern-preset]'))el.setAttribute('aria-pressed',String(model.presets[el.dataset.patternPreset].every((v,i)=>!!v===!!mask[i])));
  $('[data-pattern-view-help]').textContent=view==='paint'?'塗ったマス＝数字が入る ／ 白いマス＝空欄':'塗った場所だけに数字が入った問題です。「マスを塗る」で描き直せます。';
  $('[data-pattern-count]').textContent=mask.filter(Boolean).length+' / 81マスに数字を配置';
  $('[data-pattern-undo]').disabled=!history.length;$('[data-pattern-redo]').disabled=!future.length;$('[data-pattern-omit]').value=String(omit);$('[data-pattern-symmetry]').value=symmetry;
 }
 function changed(){view='paint';stop();showAdvice(null);persist();draw();$('[data-pattern-rating]').textContent='難易度は模様に合わせて自動判定します。';status('checking','確認中… 塗ったマスだけで作れるか調べています。');const token=revision;timer=setTimeout(()=>check(token,2500),180);}
 function remember(){history.push(mask.slice());if(history.length>40)history.shift();future=[];}
 function replace(next){remember();mask=next.slice();changed();}
 function check(token,milliseconds){
  if(!dialog||token!==revision)return;
  const source=document.getElementById('core-normal');
  if(!source||typeof Worker==='undefined'){status('error','確認を開始できませんでした。もう一度調べるボタンで再試行できます。');return;}
  const code='var global=self;\n'+source.textContent+'\nself.NPPatternModel=('+model.create.toString()+')();self.onmessage=function(e){try{self.postMessage(NPPatternModel.search(e.data.mask,e.data.omit,{milliseconds:e.data.milliseconds,rate:Nanpure.ratePuzzle}));}catch(err){self.postMessage({state:"error"});}};';
  let url;
  try{url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);url=null;
   worker.onmessage=event=>{if(!dialog||token!==revision)return;const data=event.data;worker.terminate();worker=null;
    if(data.state==='ready'){result=data;draw();status('ready','作成できます：答えが1つに定まる問題を確認しました。');$('[data-pattern-rating]').textContent=data.rating?.humanSolvable?NP.levelText(data.rating.level,18)+'・模様に合わせて自動判定':'難易度未判定・答えは1つです。高度な推理が必要な場合があります。';}
    else if(data.state==='impossible'){showAdvice(data);status('impossible',reasons[data.reason]||'この条件では作れません。');}
    else if(data.state==='unknown'){status('unknown','未確認：今回の探索では見つかりませんでした。作れないと確定したわけではありません。');}
    else status('error','確認中にエラーが起きました。もう一度調べてください。');
   };
   worker.onerror=event=>{event.preventDefault();if(token!==revision)return;worker.terminate();worker=null;status('error','確認を開始できませんでした。もう一度調べてください。');};
   worker.postMessage({mask:mask.slice(),omit,milliseconds});
  }catch(_){if(url)URL.revokeObjectURL(url);if(worker)worker.terminate();worker=null;status('error','確認を開始できませんでした。もう一度調べてください。');}
 }
 function close(){if(saving)return;finish();stop();layoutObserver?.disconnect();layoutObserver=null;if(layoutFrame!==null)cancelAnimationFrame(layoutFrame);layoutFrame=null;window.removeEventListener("resize",queueLayout);dialog?.close();dialog?.remove();dialog=null;returnFocus?.focus();}
 function cellAt(x,y){const el=document.elementFromPoint(x,y)?.closest('[data-pixel]');return el&&dialog.contains(el)?Number(el.dataset.pixel):-1;}
 function paint(i){if(!stroke||i<0)return;const old=stroke.last,steps=old<0?0:Math.max(Math.abs(i%9-old%9),Math.abs(Math.floor(i/9)-Math.floor(old/9)));let edited=false;
  for(let s=0;s<=steps;s++){const f=steps?s/steps:1,c=old<0?i%9:Math.round(old%9+(i%9-old%9)*f),r=old<0?Math.floor(i/9):Math.round(Math.floor(old/9)+(Math.floor(i/9)-Math.floor(old/9))*f),at=r*9+c;for(const target of model.symmetricCells(at,symmetry))if(mask[target]!==stroke.value){mask[target]=stroke.value;edited=true;}}
  stroke.last=i;if(edited){stroke.edited=true;changed();}
 }
 function finish(){if(!stroke)return;const done=stroke;stroke=null;if(done.edited){history.push(done.before);if(history.length>40)history.shift();future=[];}const grid=dialog?.querySelector(".pattern-grid");if(grid?.hasPointerCapture(done.id))grid.releasePointerCapture(done.id);draw();queueLayout();}
 function open({save}){
  if(dialog)return;saveHandler=save;returnFocus=document.activeElement;history=[];future=[];view='paint';mask=model.presets.heart.slice();omit=0;symmetry="none";adviceCells=new Set();
  try{const draft=JSON.parse(localStorage.getItem(key));if(draft){mask=model.maskOf(draft.mask);omit=Number.isInteger(draft.omit)&&draft.omit>=0&&draft.omit<=9?draft.omit:0;symmetry=["none","horizontal","vertical","point","both"].includes(draft.symmetry)?draft.symmetry:"none";}}catch(_){}
  dialog=document.createElement('dialog');dialog.id='np-pattern-dialog';dialog.className='np-pattern-dialog';dialog.setAttribute('aria-labelledby','np-pattern-title');
  const mini=name=>'<span class="pattern-mini" aria-hidden="true">'+model.presets[name].map(v=>'<i'+(v?' class="on"':'')+'></i>').join('')+'</span>';
  dialog.innerHTML=`
   <header class="pattern-header"><div><small>ふつうのナンプレ・9×9</small><h1 id="np-pattern-title">模様を描いて作る</h1></div><button type="button" data-pattern-close aria-label="閉じる">閉じる</button></header>
   <p class="pattern-intro">数字の並びを、自分でデザイン。<br>マスを塗ると、その場所だけに数字が入ります。</p>
   <div class="pattern-layout">
    <section class="pattern-canvas" aria-label="模様を描く">
     <div class="pattern-view-switch" role="group" aria-label="編集と問題の表示"><button type="button" data-pattern-view="paint" aria-pressed="true">1 マスを塗る</button><button type="button" data-pattern-view="preview" aria-pressed="false" disabled>2 できた問題を見る</button></div>
     <p data-pattern-view-help class="pattern-view-help"></p>
     <div class="pattern-brushes" role="group" aria-label="描く道具"><button type="button" data-pattern-brush="auto" aria-pressed="true">塗る／消す</button><button type="button" data-pattern-brush="paint" aria-pressed="false">塗るだけ</button><button type="button" data-pattern-brush="erase" aria-pressed="false">消すだけ</button><button type="button" data-pattern-undo aria-label="元に戻す" title="元に戻す">↶</button><button type="button" data-pattern-redo aria-label="やり直す" title="やり直す">↷</button></div>
     <label class="pattern-symmetry-label">対称に描く<select data-pattern-symmetry><option value="none">使わない</option><option value="horizontal">左右対称</option><option value="vertical">上下対称</option><option value="point">点対称</option><option value="both">上下・左右対称</option></select></label>

     <div class="pattern-board-meta"><span data-pattern-count></span><span class="pattern-legend"><i></i>数字が入る　<span class="pattern-legend-empty"></span>空欄</span><button type="button" class="pattern-presets-link" data-pattern-show-presets>見本を選ぶ</button></div>
     <div class="pattern-grid" role="group" aria-label="数字を置くマスを選ぶ">${Array.from({length:81},(_,i)=>'<button type="button" data-pixel="'+i+'" tabindex="'+(i===0?'0':'-1')+'" class="'+(i%9===2||i%9===5?'block-right ':'')+(Math.floor(i/9)===2||Math.floor(i/9)===5?'block-bottom':'')+'"></button>').join('')}</div>
     <p class="pattern-footnote" data-pattern-paint-help>タップで塗る・消す。なぞるとまとめて変更できます。<br>キーボード：矢印で移動、Space・Enterで切り替え。</p>
    </section>
    <aside class="pattern-settings">
     <section class="pattern-starters"><h2>見本から始める</h2><p>形を選んで、自由に描き足せます。</p><div class="pattern-presets">${[['heart','ハート'],['diamond','ひし形'],['dots','市松模様'],['omit','数字抜き用']].map(([key,label])=>'<button type="button" data-pattern-preset="'+key+'" aria-pressed="false">'+mini(key)+'<span>'+label+'</span></button>').join('')}</div><button type="button" class="pattern-blank" data-pattern-clear>白紙から描く</button></section>
     <div class="pattern-transforms" role="group" aria-label="模様を回転・反転"><button type="button" data-pattern-transform="1">90°回転</button><button type="button" data-pattern-transform="4">左右反転</button><button type="button" data-pattern-transform="6">上下反転</button></div>
     <details class="pattern-digit-options" ${omit?'open':''}><summary>数字を1種類抜く</summary><label>初期数字に使わない数字<select data-pattern-omit><option value="0">抜かない</option>${Array.from({length:9},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')}</select></label><p>選んだ数字を初期配置から抜きます。解くときは通常どおり1〜9を使います。</p><p>「数字抜き用」の見本から始めると作りやすくなります。</p></details>
     <details class="pattern-math-guide"><summary>描き方・作成のコツ</summary><p>「塗る／消す」は、最初に触れたマスに合わせて、なぞったマスをまとめて塗る・消す道具です。「塗るだけ」「消すだけ」でも描けます。</p><p>模様を塗ると自動で確認します。作成できたら「できた問題を見る」で数字の並びを見て、最後に保存します。</p><p>9×9の問題は初期数字が17個以上必要です。数を満たしていても、配置によって答えが複数残ることがあります。</p><p>数字を抜く場合は、各行・列・3×3の枠に白いマスが必要です。</p><p>対称に描く設定は、これから塗るマスに適用します。模様の位置は勝手に増減しません。</p><p>答えが1つかどうかと、人にとって解きやすいかどうかは別々に評価します。</p><a href="https://arxiv.org/abs/1201.0749" target="_blank" rel="noopener noreferrer">17個以上の根拠</a> · <a href="https://arxiv.org/abs/2005.14098" target="_blank" rel="noopener noreferrer">模様指定の生成研究</a></details>
     <p data-pattern-warning role="status"></p>
    </aside>
   </div>
   <footer class="pattern-footer"><div class="pattern-check"><p data-pattern-status role="status" aria-live="polite"></p><p data-pattern-advice class="pattern-advice" hidden></p><p data-pattern-rating>難易度は模様に合わせて自動判定します。</p></div><div class="pattern-actions"><button type="button" data-pattern-retry hidden>もう一度調べる</button><button type="button" class="primary" data-pattern-save disabled>3 保存して遊ぶ</button></div></footer>`;
  document.body.appendChild(dialog);dialog.showModal();window.addEventListener('resize',queueLayout);if(typeof ResizeObserver!=='undefined'){layoutObserver=new ResizeObserver(queueLayout);layoutObserver.observe($('.pattern-footer'));layoutObserver.observe(dialog);}dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',async e=>{const el=e.composedPath().find(node=>node?.matches?.('button')&&dialog.contains(node));if(!el||saving)return;
   if(el.hasAttribute('data-pattern-close'))return close();
   if(el.hasAttribute('data-pattern-brush')){brush=el.dataset.patternBrush;for(const b of dialog.querySelectorAll('[data-pattern-brush]'))b.setAttribute('aria-pressed',String(b.dataset.patternBrush===brush));return;}
   if(el.hasAttribute('data-pattern-show-presets')){const body=$('.pattern-layout');body.scrollTo({top:$('.pattern-starters').getBoundingClientRect().top-body.getBoundingClientRect().top+body.scrollTop,behavior:'smooth'});$('.pattern-starters [data-pattern-preset]').focus({preventScroll:true});return;}
   if(el.hasAttribute('data-pattern-view')){if(el.dataset.patternView==='preview'&&!result)return;view=el.dataset.patternView;draw();queueLayout();return;}
   if(el.hasAttribute('data-pattern-transform'))return replace(model.transform(mask,Number(el.dataset.patternTransform)));
   if(el.hasAttribute('data-pattern-preset')){if(el.dataset.patternPreset==='omit')$('.pattern-digit-options').open=true;replace(model.presets[el.dataset.patternPreset]);$('.pattern-layout').scrollTo({top:0,behavior:'smooth'});return;}
   if(el.hasAttribute('data-pattern-clear')){replace(Array(81).fill(false));$('.pattern-layout').scrollTo({top:0,behavior:'smooth'});return;}
   if(el.hasAttribute('data-pattern-undo')){if(history.length){future.push(mask.slice());mask=history.pop();changed();}return;}
   if(el.hasAttribute('data-pattern-redo')){if(future.length){history.push(mask.slice());mask=future.pop();changed();}return;}
   if(el.hasAttribute('data-pixel')&&e.detail===0){if(view==='preview')return;remember();const i=Number(el.dataset.pixel);const value=!mask[i];for(const at of model.symmetricCells(i,symmetry))mask[at]=value;changed();return;}
   if(el.hasAttribute('data-pattern-retry')){stop();draw();status('checking','確認中… 模様を変えずに、もう一度探しています。');check(revision,10000);return;}
   if(el.hasAttribute('data-pattern-save')&&result){saving=true;const candidate=result,saveRevision=revision;status('ready','保存しています…');dialog.querySelectorAll('button,select').forEach(b=>b.disabled=true);
    try{model.validate(candidate);const rating=candidate.rating,p={id:Nanpure.randomId(),kind:'normal',n:9,level:rating?.humanSolvable?Math.max(1,rating.level):1,rating,patternVersion:1,patternUnrated:!rating?.humanSolvable,clueMask:candidate.mask.slice(),omittedDigit:candidate.omittedDigit,puzzle:candidate.puzzle.slice(),solution:candidate.solution.slice(),created:Date.now(),elapsed:0,completed:false,notes:{}};p.uid='pattern-9-'+p.id+'-'+p.created.toString(36);p.grid=p.puzzle.slice();await saveHandler(p);saving=false;if(saveRevision===revision)close();}
    catch(_){saving=false;dialog.querySelectorAll('button,select').forEach(b=>b.disabled=false);draw();status('ready','保存できませんでした。空き容量を確認して、もう一度保存してください。');}
   }
  });
  dialog.addEventListener('change',e=>{if(e.target.hasAttribute('data-pattern-omit')){omit=Number(e.target.value);changed();}if(e.target.hasAttribute('data-pattern-symmetry')){symmetry=e.target.value;persist();}});
  const grid=$('.pattern-grid');grid.addEventListener('pointerdown',e=>{const cell=e.target.closest('[data-pixel]');if(!cell||saving||view==='preview'||e.button!==0)return;e.preventDefault();for(const el of grid.querySelectorAll("[data-pixel]"))el.tabIndex=-1;cell.tabIndex=0;cell.focus();stroke={id:e.pointerId,before:mask.slice(),value:brush==='auto'?!mask[Number(cell.dataset.pixel)]:brush==='paint',last:-1,edited:false};grid.setPointerCapture(e.pointerId);paint(Number(cell.dataset.pixel));});
  grid.addEventListener('pointermove',e=>{if(stroke&&e.pointerId===stroke.id)paint(cellAt(e.clientX,e.clientY));});grid.addEventListener('pointerup',finish);grid.addEventListener('pointercancel',finish);grid.addEventListener('lostpointercapture',finish);
  grid.addEventListener('keydown',e=>{const cell=e.target.closest('[data-pixel]');if(!cell)return;const i=Number(cell.dataset.pixel),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[e.key];if(delta){e.preventDefault();const at=Math.max(0,Math.min(80,i+delta));cell.tabIndex=-1;const next=$('[data-pixel="'+at+'"]');next.tabIndex=0;next.focus();}});
  brush='auto';changed();$('[data-pattern-brush="auto"]').focus();
 }
 window.NPPattern={open,close,isOpen:()=>!!dialog};
})();
