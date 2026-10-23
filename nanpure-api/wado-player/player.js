(function(){
 'use strict';
 const $=id=>document.getElementById(id),key='np-wado-owner-play-v1',positions={top:'上',left:'左',right:'右',bottom:'下'};
 const fresh=()=>({version:1,preferences:{level:1,count:4},number:0,correct:0,accepted:0,seen:[],current:null});
 let engine,state=fresh(),busy=false,ephemeral=false,loadFailed=false,locked=false;
 const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validAnswer=text=>/^[\u3400-\u9fff]$/.test(text);
 function error(message){$('error').textContent=message;$('error').hidden=false;}
 function controls(){const unavailable=busy||!engine||locked||loadFailed,resolved=!!state.current&&['correct','accepted'].includes(state.current.verdict);for(const node of document.querySelectorAll('#settings select,#settings button,#game button'))node.disabled=unavailable;$('answer').disabled=unavailable||resolved;for(const id of ['check','erase','reveal'])$(id).disabled=unavailable||resolved;for(const node of $('choices').querySelectorAll('button'))node.disabled=$('answer').disabled;}
 function lock(){locked=true;document.body.dataset.locked='true';$('locked').hidden=false;$('loading').hidden=true;controls();}
 async function authenticate(){const r=await fetch('session',{cache:'no-store',credentials:'same-origin'});if(r.status===401){lock();throw Error('作者認証の有効時間が切れました。もう一度認証してください。');}if(!r.ok)throw Error('作者認証を確認できませんでした。通信を確認して、もう一度操作してください。');const data=await r.json();if(data.ok!==true)throw Error('作者認証を確認できませんでした。');return data;}
 async function act(action){if(busy||locked||loadFailed||!engine)return;busy=true;controls();$('error').hidden=true;let focus;try{await authenticate();focus=action();}catch(e){error(e.message||'操作できませんでした。もう一度お試しください。');}finally{busy=false;controls();if(focus)$(focus).focus();}}
 function save(){if(ephemeral){$('save-status').textContent='今回は途中経過を保存せずに試遊しています。';return;}try{localStorage.setItem(key,JSON.stringify(state));$('save-status').textContent='途中経過はこのブラウザに保存されています。';}catch{error('途中経過を保存できませんでした。今回はこの画面で試遊できますが、前回の保存内容のままです。');}}
 function validate(value){
  if(value?.version!==1||![1,2,3,4,5,6,7,8,9,10].includes(value.preferences?.level)||![2,3,4].includes(value.preferences?.count)||!Array.isArray(value.seen)||value.seen.length>200||value.seen.some(x=>typeof x!=='string'||x.length>10)||![value.number,value.correct,value.accepted].every(x=>Number.isSafeInteger(x)&&x>=0)||value.correct+value.accepted>value.number)throw Error();
  if(value.current){const c=value.current;engine.validate(c.puzzle);if(typeof c.answer!=='string'||c.answer.length>1||!['open','unconfirmed','correct','accepted','example'].includes(c.verdict)||typeof c.hint!=='boolean'||typeof c.revealed!=='boolean')throw Error();if(['correct','accepted','unconfirmed'].includes(c.verdict)&&!validAnswer(c.answer))throw Error();if(c.verdict==='correct'&&!engine.candidates(c.puzzle).includes(c.answer))throw Error();}
  return value;
 }
 function words(p,answer){return Object.keys(positions).filter(k=>p.arms[k]).map(position=>engine.word(p,position,answer));}
 function wordList(p,answer){return'<ul>'+words(p,answer).map(text=>'<li><b>'+text+'</b>'+(engine.entry(text,p)?.reading?'<small>'+engine.entry(text,p).reading+'</small>':'')+'</li>').join('')+'</ul>';}
 function renderFeedback(){const c=state.current;if(!c)return;$('unknown').hidden=c.verdict!=='unconfirmed';$('feedback').replaceChildren();
  if(c.verdict==='correct')$('feedback').innerHTML='<p><strong>正解！</strong> 「'+c.answer+'」ですべての熟語が成立します。</p>'+wordList(c.puzzle,c.answer);
  if(c.verdict==='accepted')$('feedback').innerHTML='<p><strong>確認した別解として記録しました。</strong></p>'+wordList(c.puzzle,c.answer)+'<p class="small muted">自分で確認した別解です。辞書での正解とは分けて数えています。</p>';
  if(c.verdict==='unconfirmed'){$('feedback').innerHTML='<p>「'+c.answer+'」では、収録辞書ですべての熟語の成立を確認できませんでした。</p>'+wordList(c.puzzle,c.answer);$('search-links').innerHTML=words(c.puzzle,c.answer).map(text=>'<li><a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="https://www.google.com/search?q='+encodeURIComponent('"'+text+'" 意味')+'">「'+text+'」を調べる（外部）</a></li>').join('');}
  if(c.verdict==='example')$('feedback').innerHTML='<p><strong>解答例：'+c.puzzle.answer+'</strong></p>'+wordList(c.puzzle,c.puzzle.answer)+'<p class="small muted">ほかの漢字でも、すべての熟語が成立すれば正解です。解答例を見た問題は正解数に含めません。</p>';
 }
 function render(){const c=state.current;$('game').hidden=!c;if(!c){controls();return;}const p=c.puzzle;$('question-label').textContent='第'+state.number+'問 · 難易度 '+p.level+' · 熟語 '+p.count+'個';$('score').textContent='正解 '+state.correct+' ／ 確認した別解 '+state.accepted;
  for(const [k,label]of Object.entries(positions)){const node=document.querySelector('[data-arm="'+k+'"]'),arrow=document.querySelector('[data-arrow="'+k+'"]');node.hidden=arrow.hidden=!p.arms[k];node.textContent=p.arms[k]||'';node.setAttribute('aria-label',label+'の漢字：'+(p.arms[k]||'なし'));}
  $('answer').value=c.answer;$('readings').innerHTML=(c.hint?Object.keys(positions).filter(k=>p.arms[k]).map(position=>({position,reading:engine.entry(engine.word(p,position),p).reading})):engine.hints(p)).map(h=>'<span>'+positions[h.position]+'：'+h.reading+'</span>').join('');
  $('choices').innerHTML=p.choices.map(char=>'<button type="button" aria-pressed="'+(char===c.answer)+'">'+char+'</button>').join('');for(const button of $('choices').children)button.addEventListener('click',()=>input(button.textContent));
  $('choice-note').hidden=!p.choices.length&&!$('readings').textContent;$('hint').textContent=c.hint?'読みを元に戻す':'読みのヒント';renderFeedback();controls();
 }
 function input(text){if(!state.current||['correct','accepted'].includes(state.current.verdict))return;state.current.answer=text;state.current.verdict='open';$('answer').value=text;renderFeedback();for(const b of $('choices').children)b.setAttribute('aria-pressed',String(b.textContent===text));save();}
 function generate(){const preferences={level:Number($('level').value),count:Number($('count').value)},seed=crypto.getRandomValues(new Uint32Array(1))[0],puzzle=engine.generate({...preferences,seed,seen:state.seen});state.preferences=preferences;state.number++;state.seen=[...state.seen,engine.fingerprint(puzzle)].slice(-200);state.current={puzzle,answer:'',verdict:'open',hint:false,revealed:false};$('settings').open=false;render();save();return 'answer';}
 function check(){const c=state.current;if(!c||['correct','accepted'].includes(c.verdict))return;const answer=$('answer').value.trim();if(!validAnswer(answer)){error('中央に入る漢字を1文字入力してください。');return 'answer';}c.answer=answer;if(engine.candidates(c.puzzle).includes(answer)){c.verdict='correct';if(!c.revealed)state.correct++;}else c.verdict='unconfirmed';render();save();return 'feedback';}
 $('start-form').addEventListener('submit',e=>{e.preventDefault();void act(generate);});$('answer-form').addEventListener('submit',e=>{e.preventDefault();void act(check);});
 $('answer').addEventListener('input',e=>{if(!e.isComposing)input(e.target.value);});$('answer').addEventListener('compositionend',e=>input(e.target.value));
 $('next').addEventListener('click',()=>void act(generate));$('erase').addEventListener('click',()=>{input('');$('answer').focus();});
 $('hint').addEventListener('click',()=>void act(()=>{if(!state.current)return;state.current.hint=!state.current.hint;render();save();}));
 $('reveal').addEventListener('click',()=>void act(()=>{const c=state.current;if(!c||['correct','accepted'].includes(c.verdict))return;c.revealed=true;c.verdict='example';render();save();$('feedback').focus();}));
 $('accept').addEventListener('click',()=>void act(()=>{const c=state.current;if(c?.verdict!=='unconfirmed'||!validAnswer(c.answer))return;c.verdict='accepted';state.accepted++;render();save();$('feedback').focus();}));
 $('level').addEventListener('change',()=>{$('level-help').textContent=NPWado.levels[Number($('level').value)-1].help;});
 $('ephemeral').addEventListener('click',()=>{ephemeral=true;loadFailed=false;state=fresh();$('ephemeral').hidden=true;$('error').hidden=true;render();controls();});
 window.addEventListener('pagehide',()=>{document.body.dataset.locked='true';});window.addEventListener('pageshow',event=>{if(event.persisted)void authenticate().then(()=>{delete document.body.dataset.locked;}).catch(e=>error(e.message));});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&engine&&!locked)void authenticate().catch(e=>error(e.message));});
 async function init(){try{await authenticate();const response=await fetch('assets/wado-data.json',{cache:'no-store',credentials:'same-origin'});if(response.status===401){lock();return;}if(!response.ok)throw Error('辞書を読み込めませんでした。ページを開き直してください。');engine=NPWado.create(await response.json());
   for(const [i,level]of NPWado.levels.entries())$('level').add(new Option(level.name,i+1));
   try{const raw=localStorage.getItem(key);if(raw)state=validate(JSON.parse(raw));}catch{loadFailed=true;error('試遊の保存データを読み込めませんでした。保存内容は上書きせず残しています。');$('ephemeral').hidden=false;}
   $('level').value=state.preferences.level;$('count').value=state.preferences.count;$('level-help').textContent=NPWado.levels[state.preferences.level-1].help;if(state.current)$('settings').open=false;$('loading').hidden=true;render();if(!loadFailed)save();
  }catch(e){$('loading').hidden=true;error(e.message||'試遊を開始できませんでした。開き直してください。');controls();}}
 void init();
})();
