(function(){
 'use strict';
 const model=window.NPPatternModel,key='nanpure-pattern-draft-v1';let dialog=null,worker=null,timer=null,revision=0,result=null,mask=[],omit=0,brush=true,history=[],stroke=null,saveHandler=null,returnFocus=null,saving=false;
 const reasons={few:'作れません：初期数字は17マス以上必要です。',full:'空きマスを1つ以上残してください。',rows:'作れません：同じ3行の帯に、数字のない行が2本あるため答えが1つに定まりません。',cols:'作れません：同じ3列の帯に、数字のない列が2本あるため答えが1つに定まりません。',digit:'作れません：白いマスだけでは、抜く数字を各行・列・3×3の枠に1つずつ置けません。'};
 const $=selector=>dialog.querySelector(selector);
 function persist(){try{localStorage.setItem(key,JSON.stringify({mask:mask.map(Number),omit}));}catch(_){$('[data-pattern-warning]').textContent='模様を端末に記憶できませんでした。この画面では続けて編集できます。';}}
 function stop(){revision++;clearTimeout(timer);timer=null;if(worker){worker.terminate();worker=null;}result=null;}
 function status(state,message){if(!dialog)return;const el=$('[data-pattern-status]');el.dataset.state=state;el.textContent=message;$('[data-pattern-save]').disabled=state!=='ready'||saving;$('[data-pattern-retry]').hidden=!['unknown','error','ready'].includes(state);}
 function draw(){
  if(!dialog)return;
  for(const el of dialog.querySelectorAll('[data-pixel]')){const i=Number(el.dataset.pixel);el.classList.toggle('painted',mask[i]);el.setAttribute('aria-pressed',String(mask[i]));el.setAttribute('aria-label',(Math.floor(i/9)+1)+'行'+(i%9+1)+'列・'+(mask[i]?'数字を置く':'空きマス'));el.textContent=result?.puzzle[i]||'';}
  $('[data-pattern-count]').textContent=mask.filter(Boolean).length+' / 81マスに数字を配置';
  $('[data-pattern-undo]').disabled=!history.length;$('[data-pattern-omit]').value=String(omit);
 }
 function changed(){stop();persist();draw();$('[data-pattern-rating]').textContent='難易度は模様に合わせて自動判定します。';status('checking','確認中… 塗ったマスだけで作れるか調べています。');const token=revision;timer=setTimeout(()=>check(token,2500),180);}
 function remember(){history.push(mask.slice());if(history.length>40)history.shift();}
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
    else if(data.state==='impossible'){status('impossible',reasons[data.reason]||'この条件では作れません。');}
    else if(data.state==='unknown'){status('unknown','未確認：今回の探索では見つかりませんでした。作れないと確定したわけではありません。');}
    else status('error','確認中にエラーが起きました。もう一度調べてください。');
   };
   worker.onerror=event=>{event.preventDefault();if(token!==revision)return;worker.terminate();worker=null;status('error','確認を開始できませんでした。もう一度調べてください。');};
   worker.postMessage({mask:mask.slice(),omit,milliseconds});
  }catch(_){if(url)URL.revokeObjectURL(url);if(worker)worker.terminate();worker=null;status('error','確認を開始できませんでした。もう一度調べてください。');}
 }
 function close(){if(saving)return;stop();dialog?.close();dialog?.remove();dialog=null;returnFocus?.focus();}
 function cellAt(x,y){const el=document.elementFromPoint(x,y)?.closest('[data-pixel]');return el&&dialog.contains(el)?Number(el.dataset.pixel):-1;}
 function paint(i){if(!stroke||i<0)return;const old=stroke.last,steps=old<0?0:Math.max(Math.abs(i%9-old%9),Math.abs(Math.floor(i/9)-Math.floor(old/9)));let edited=false;
  for(let s=0;s<=steps;s++){const f=steps?s/steps:1,c=old<0?i%9:Math.round(old%9+(i%9-old%9)*f),r=old<0?Math.floor(i/9):Math.round(Math.floor(old/9)+(Math.floor(i/9)-Math.floor(old/9))*f),at=r*9+c;if(mask[at]!==stroke.value){mask[at]=stroke.value;edited=true;}}
  stroke.last=i;if(edited){stroke.edited=true;changed();}
 }
 function finish(){if(!stroke)return;if(stroke.edited){history.push(stroke.before);if(history.length>40)history.shift();}stroke=null;draw();}
 function open({save}){
  if(dialog)return;saveHandler=save;returnFocus=document.activeElement;history=[];mask=model.presets.heart.slice();omit=0;
  try{const draft=JSON.parse(localStorage.getItem(key));if(draft){mask=model.maskOf(draft.mask);omit=Number.isInteger(draft.omit)&&draft.omit>=0&&draft.omit<=9?draft.omit:0;}}catch(_){}
  dialog=document.createElement('dialog');dialog.id='np-pattern-dialog';dialog.className='np-pattern-dialog';dialog.setAttribute('aria-labelledby','np-pattern-title');
  dialog.innerHTML='<header class="pattern-header"><div><small>ふつうのナンプレ・9×9</small><h1 id="np-pattern-title">模様を描いて作る</h1></div><button type="button" data-pattern-close aria-label="閉じる">閉じる</button></header><p>数字を置きたいマスを、ドット絵のように塗ってください。白いマスは空欄になります。</p><div class="pattern-layout"><section class="pattern-canvas"><div class="pattern-brushes" role="group" aria-label="描く道具"><button type="button" data-pattern-brush="paint" aria-pressed="true">塗る</button><button type="button" data-pattern-brush="erase" aria-pressed="false">消す</button><button type="button" data-pattern-undo>元に戻す</button><button type="button" data-pattern-clear>すべて消す</button></div><div class="pattern-grid" role="group" aria-label="数字を置くマスを選ぶ">'+Array.from({length:81},(_,i)=>'<button type="button" data-pixel="'+i+'" tabindex="'+(i===0?'0':'-1')+'" class="'+(i%9===2||i%9===5?'block-right ':'')+(Math.floor(i/9)===2||Math.floor(i/9)===5?'block-bottom':'')+'"></button>').join('')+'</div><p class="pattern-footnote">なぞって連続で塗れます。キーボードは矢印で移動、Space・Enterで切り替え。</p></section><aside class="pattern-settings"><h2>模様の見本</h2><div class="pattern-presets"><button type="button" data-pattern-preset="heart">ハート</button><button type="button" data-pattern-preset="diamond">ひし形</button><button type="button" data-pattern-preset="dots">市松模様</button><button type="button" data-pattern-preset="omit">数字抜き用</button></div><h2>数字を1種類抜く</h2><label>初期数字に使わない数字<select data-pattern-omit><option value="0">抜かない</option>'+Array.from({length:9},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label><p>選んだ数字は最初の盤面に1つも出ません。解くときは通常どおり1〜9を使います。</p><p>抜く数字が入る白いマスも必要です。「数字抜き用」の見本から始められます。</p><h2>この模様の確認</h2><p data-pattern-count></p><p data-pattern-rating>難易度は模様に合わせて自動判定します。</p><p>塗った場所を増減せず、答えが1つに定まる問題を探します。模様によっては確認に時間がかかります。</p><p data-pattern-warning role="status"></p></aside></div><footer class="pattern-footer"><p data-pattern-status role="status" aria-live="polite"></p><div class="pattern-actions"><button type="button" data-pattern-retry hidden>もう一度調べる</button><button type="button" class="primary" data-pattern-save disabled>この問題を保存して遊ぶ</button></div></footer>';
  document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',async e=>{const el=e.target.closest('button');if(!el||saving)return;
   if(el.hasAttribute('data-pattern-close'))return close();
   if(el.hasAttribute('data-pattern-brush')){brush=el.dataset.patternBrush==='paint';for(const b of dialog.querySelectorAll('[data-pattern-brush]'))b.setAttribute('aria-pressed',String((b.dataset.patternBrush==='paint')===brush));return;}
   if(el.hasAttribute('data-pattern-preset'))return replace(model.presets[el.dataset.patternPreset]);
   if(el.hasAttribute('data-pattern-clear'))return replace(Array(81).fill(false));
   if(el.hasAttribute('data-pattern-undo')){if(history.length){mask=history.pop();changed();}return;}
   if(el.hasAttribute('data-pixel')&&e.detail===0){remember();const i=Number(el.dataset.pixel);mask[i]=!mask[i];changed();return;}
   if(el.hasAttribute('data-pattern-retry')){stop();draw();status('checking','確認中… 模様を変えずに、もう一度探しています。');check(revision,10000);return;}
   if(el.hasAttribute('data-pattern-save')&&result){saving=true;const candidate=result,saveRevision=revision;status('ready','保存しています…');dialog.querySelectorAll('button,select').forEach(b=>b.disabled=true);
    try{model.validate(candidate);const rating=candidate.rating,p={id:Nanpure.randomId(),kind:'normal',n:9,level:rating?.humanSolvable?Math.max(1,rating.level):1,rating,patternVersion:1,patternUnrated:!rating?.humanSolvable,clueMask:candidate.mask.slice(),omittedDigit:candidate.omittedDigit,puzzle:candidate.puzzle.slice(),solution:candidate.solution.slice(),created:Date.now(),elapsed:0,completed:false,notes:{}};p.uid='pattern-9-'+p.id+'-'+p.created.toString(36);p.grid=p.puzzle.slice();await saveHandler(p);saving=false;if(saveRevision===revision)close();}
    catch(_){saving=false;dialog.querySelectorAll('button,select').forEach(b=>b.disabled=false);draw();status('ready','保存できませんでした。空き容量を確認して、もう一度保存してください。');}
   }
  });
  dialog.addEventListener('change',e=>{if(e.target.hasAttribute('data-pattern-omit')){omit=Number(e.target.value);changed();}});
  const grid=$('.pattern-grid');grid.addEventListener('pointerdown',e=>{const cell=e.target.closest('[data-pixel]');if(!cell||saving||e.button!==0)return;e.preventDefault();cell.focus();stroke={id:e.pointerId,before:mask.slice(),value:brush,last:-1,edited:false};grid.setPointerCapture(e.pointerId);paint(Number(cell.dataset.pixel));});
  grid.addEventListener('pointermove',e=>{if(stroke&&e.pointerId===stroke.id)paint(cellAt(e.clientX,e.clientY));});grid.addEventListener('pointerup',finish);grid.addEventListener('pointercancel',finish);grid.addEventListener('lostpointercapture',finish);
  grid.addEventListener('keydown',e=>{const cell=e.target.closest('[data-pixel]');if(!cell)return;const i=Number(cell.dataset.pixel),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[e.key];if(delta){e.preventDefault();const at=Math.max(0,Math.min(80,i+delta));cell.tabIndex=-1;const next=$('[data-pixel="'+at+'"]');next.tabIndex=0;next.focus();}});
  brush=true;changed();$('[data-pattern-brush="paint"]').focus();
 }
 window.NPPattern={open,close,isOpen:()=>!!dialog};
})();
