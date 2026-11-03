import {LearningData} from './data.mjs?v=1';
import {matching,pickRoute,practiceScenes,practiceHint,solvedRoute,routeName,statusName} from './model.mjs?v=1';

const $=id=>document.getElementById(id),A=globalThis.NPLabAnalyzer,R=globalThis.NPLabRender,data=new LearningData();
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const option=(value,text)=>{const el=node('option',text);el.value=value;return el;};
let index,page=0,record=null,mode='explain',routeAt=0,stepAt=0,epoch=0,scenes=[],sceneAt=0,answered=false,revealed=false;
let videoController=null,videoUrl=null,race=null,raceTimer=null;
const statsKey='nanpure-learning-practice-v1';let score={attempts:0,correct:0};
try{const saved=JSON.parse(localStorage.getItem(statsKey));if(Number.isSafeInteger(saved?.attempts)&&Number.isSafeInteger(saved?.correct)&&saved.correct>=0&&saved.correct<=saved.attempts)score=saved;}catch{}
function tell(text){$('notice').hidden=!text;$('notice').textContent=text||'';}
const filters=()=>({technique:$('technique').value,level:$('level').value,completion:$('completion').value,query:$('search').value});
const route=()=>record?.routes[routeAt];
function updateAddress(){const q=new URLSearchParams();if(record){q.set('p',record.sourceId);q.set('mode',mode);}history.replaceState(null,'',location.pathname+(q.size?'?'+q:''));}

function renderList(){
 if(!index)return;
 const list=matching(index.records,filters()),size=24,total=Math.max(1,Math.ceil(list.length/size));page=Math.max(0,Math.min(page,total-1));
 $('count').textContent=list.length.toLocaleString()+'問が見つかりました。';
 $('cards').replaceChildren(...list.slice(page*size,(page+1)*size).map(row=>{
  const card=node('button',undefined,'card');card.append(node('span',row.id,'id'),node('strong','元の難度 Lv.'+row.level));
  const types=Object.keys(row.used).sort((a,b)=>A.weights[b]-A.weights[a]);
  card.append(node('span',types.length?types.slice(0,3).map(t=>A.labels[t]).join('・')+(types.length>3?' ほか':''):'この版の解法で進められた手順はありません。','tech'));
  card.append(node('span',row.solved?'最後までの手順あり':'途中までの手順','badge'+(row.solved?'':' partial')),node('span','解き方を見る ›','open'));
  card.onclick=()=>openRecord(row.id,'explain');return card;
 }));
 if(!list.length)$('cards').append(node('p','この条件に合う問題はありません。条件を変えて探してください。'));
 $('page-number').textContent=(page+1)+' / '+total;$('page-prev').disabled=page===0;$('page-next').disabled=page+1>=total;$('pagination').hidden=list.length<=size;
 $('quick').disabled=!list.some(r=>r.steps.some(n=>n>0));
}
$('filters').onsubmit=e=>e.preventDefault();
for(const id of ['technique','level','completion'])$(id).onchange=()=>{page=0;renderList();};
$('search').oninput=()=>{page=0;renderList();};
$('page-prev').onclick=()=>{page--;renderList();};$('page-next').onclick=()=>{page++;renderList();};
$('quick').onclick=()=>{const row=matching(index.records,filters()).find(r=>r.steps.some(n=>n>0));if(row)openRecord(row.id,'practice');};

async function openRecord(sourceId,desiredMode='explain'){
 const ticket=++epoch;tell('解説の手順を読み込んでいます。');
 try{
  const loaded=await data.record(sourceId);if(ticket!==epoch)return;
  stopRace();clearVideo();record=loaded;routeAt=pickRoute(record,$('technique').value);stepAt=Math.max(0,route().steps.findIndex(s=>s.type===$('technique').value));
  $('library').hidden=true;$('lesson').hidden=false;tell('');
  $('problem-number').textContent=record.sourceId;$('problem-title').textContent='普通の9×9 · 元の難度 Lv.'+record.puzzle.level;
  $('problem-info').textContent=(81-record.puzzle.puzzle.filter(Boolean).length)+'マスの空欄 · '+(solvedRoute(record)?'最後までの手順を確認済み':'途中までの手順を確認済み');
  $('play-original').href='/nanpure/collection/?p='+encodeURIComponent(record.sourceId);
  $('modes').querySelectorAll('button').forEach(b=>{const limited=['video','rival'].includes(b.dataset.mode)&&!solvedRoute(record);b.disabled=limited;b.title=limited?'最後まで解けた問題で使えます。':'';});
  $('practice-type').replaceChildren();setMode(['explain','practice','video','rival'].includes(desiredMode)?desiredMode:'explain');window.scrollTo({top:0,behavior:'instant'});
 }catch(error){if(ticket===epoch)tell(error.message);}
}
$('back').onclick=()=>{epoch++;stopRace();clearVideo();record=null;$('lesson').hidden=true;$('library').hidden=false;tell('');updateAddress();renderList();};
function setMode(value){
 if(!record)return;if(['video','rival'].includes(value)&&!solvedRoute(record))value='explain';
 if(mode==='video'&&value!=='video')$('video-preview').pause();
 if(value!==mode){stopRace();if(videoController)videoController.abort();}mode=value;
 $('modes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.mode===mode?'page':'false'));
 document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==mode);
 if(mode==='explain')renderExplain();if(mode==='practice')buildScenes();if(mode==='video')renderVideo();if(mode==='rival')previewRace();updateAddress();
}
$('modes').onclick=e=>{const button=e.target.closest('button[data-mode]');if(button&&!button.disabled)setMode(button.dataset.mode);};

function renderExplain(){
 const selected=route();if(!selected)return;
 $('routes').replaceChildren(...record.routes.map((r,i)=>{const b=node('button');b.setAttribute('aria-pressed',String(i===routeAt));b.append(node('strong',routeName(r)),node('span',statusName(r.status)+' · '+r.steps.length+'手 · 候補除外 '+r.stats.eliminations+'個'));b.onclick=()=>{routeAt=i;stepAt=Math.max(0,r.steps.findIndex(s=>s.type===$('technique').value));renderExplain();};return b;}));
 stepAt=Math.min(stepAt,selected.steps.length);const state=A.replay(record.puzzle,selected,stepAt),step=selected.steps[stepAt];
 R.board($('board'),state,step,{notes:$('show-notes').checked});$('board').setAttribute('aria-label',record.sourceId+'の解説。'+(step?A.labels[step.type]+'を使う'+(stepAt+1)+'手目':'手順を再生した盤面'));
 $('step-title').textContent=step?A.labels[step.type]:selected.status==='solved'?'最後まで解けました':'確認できた手順は、ここまでです';
 $('step-progress').textContent=step?(stepAt+1)+' / '+selected.steps.length+'手目':selected.steps.length+'手を再生しました。';
 $('explanation').replaceChildren(...(step?A.explain(state,step):[selected.status==='solved'?'行・列・3×3の枠を満たす唯一解まで、論理的に解けました。':'この解析で確認できなかった先の手順は、推測で補っていません。']).map(t=>node('p',t)));
 $('step-prev').disabled=stepAt===0;$('step-next').disabled=stepAt>=selected.steps.length;
 $('route-limit').hidden=selected.status==='solved';$('route-limit').textContent='この手順は途中までの記録です。元の問題を遊ぶことや、確認できた場面の一手練習はできます。';
}
$('step-prev').onclick=()=>{stepAt--;renderExplain();};$('step-next').onclick=()=>{stepAt++;renderExplain();};$('show-notes').onchange=renderExplain;

function buildScenes(){
 const selected=route();if(!selected)return;
 let type=$('practice-type').value||$('technique').value;const types=[...new Set(selected.steps.map(s=>s.type))];
 $('practice-type').replaceChildren(option('','すべての解法'),...types.map(t=>option(t,A.labels[t])));
 if(types.includes(type))$('practice-type').value=type;else type='';
 scenes=practiceScenes(selected,type);sceneAt=0;renderScene();
}
function renderScene(){
 answered=false;revealed=false;$('practice-feedback').textContent='';$('practice-feedback').removeAttribute('data-result');$('practice-explanation').replaceChildren();
 $('practice-score').textContent='このブラウザでの初回の正解 '+score.correct+' / '+score.attempts+'問';
 if(!scenes.length){R.board($('practice-board'),A.initial(record.puzzle),null);$('practice-question').textContent='この条件の練習場面はありません。';$('practice-tech').textContent='別の解法や問題を選んでください。';$('practice-digits').replaceChildren();$('practice-hint').disabled=true;$('practice-next').disabled=true;return;}
 $('practice-hint').disabled=false;$('practice-next').disabled=false;
 const scene=scenes[sceneAt],state=A.replay(record.puzzle,route(),scene.at);
 R.board($('practice-board'),state,practiceHint(scene.step),{target:scene.target});
 $('practice-board').setAttribute('aria-label',Math.floor(scene.target/9)+1+'行'+(scene.target%9+1)+'列のマスを考える一手練習');
 $('practice-question').textContent=scene.step.cuts.length?'オレンジのマスから消せる候補を1つ選ぶ':'オレンジのマスに入る数字を選ぶ';
 $('practice-tech').textContent='使う解法：'+A.labels[scene.step.type]+' · '+(sceneAt+1)+' / '+scenes.length+'場面';
 $('practice-digits').replaceChildren(...Array.from({length:9},(_,i)=>{const b=node('button',String(i+1));b.onclick=()=>answer(i+1);return b;}));
}
function answer(digit){
 if(!scenes.length)return;const good=scenes[sceneAt].answers.includes(digit);
 if(!answered&&!revealed){score.attempts++;if(good)score.correct++;try{localStorage.setItem(statsKey,JSON.stringify(score));}catch{}$('practice-score').textContent='このブラウザでの初回の正解 '+score.correct+' / '+score.attempts+'問';}answered=true;
 $('practice-feedback').dataset.result=good?'correct':'wrong';$('practice-feedback').textContent=good?'正解です。根拠も確認してみましょう。':'この場面の解法で決まる数字を、もう一度考えてみましょう。';
}
$('practice-type').onchange=buildScenes;$('practice-next').onclick=()=>{if(scenes.length){sceneAt=(sceneAt+1)%scenes.length;renderScene();}};
$('practice-hint').onclick=()=>{if(!scenes.length)return;revealed=true;const s=scenes[sceneAt],state=A.replay(record.puzzle,route(),s.at);R.board($('practice-board'),state,s.step,{target:s.target});$('practice-explanation').replaceChildren(...A.explain(state,s.step).map(t=>node('p',t)));};

function canVideo(){return !!(globalThis.MediaRecorder&&HTMLCanvasElement.prototype.captureStream&&['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].some(t=>MediaRecorder.isTypeSupported(t)));}
function clearVideo(){videoController?.abort();$('video-preview').pause();$('video-preview').removeAttribute('src');$('video-preview').load();if(videoUrl){URL.revokeObjectURL(videoUrl);videoUrl=null;}$('video-preview').hidden=true;$('video-download').hidden=true;}
function renderVideo(){
 const old=$('video-route').value,complete=record.routes.filter(r=>r.status==='solved');$('video-route').replaceChildren(...complete.map(r=>option(r.strategy,routeName(r)+' · '+r.steps.length+'手')));if(complete.some(r=>r.strategy===old))$('video-route').value=old;
 $('video-create').disabled=!!videoController||!complete.length||!canVideo();
 if(!videoController)$('video-status').textContent=!canVideo()?'このブラウザではWebM動画を作れません。対応するChromeやEdgeで開いてください。':complete.length?'作成時間の目安は、手数×表示時間です。':'最後まで解けた問題から動画を作れます。';
}
$('video-create').onclick=async()=>{
 if(videoController||!canVideo())return;const selected=record.routes.find(r=>r.strategy===$('video-route').value&&r.status==='solved');if(!selected)return;
 clearVideo();const ac=new AbortController();videoController=ac;$('video-create').disabled=true;$('video-cancel').hidden=false;$('video-progress').hidden=false;$('video-progress').max=selected.steps.length;$('video-progress').value=0;$('video-status').textContent='動画を作成しています。画面を開いたままお待ちください。';
 try{
  const blob=await R.video(record,selected,{signal:ac.signal,stepMs:Number($('video-pace').value),onProgress:(n,total)=>{if(videoController===ac){$('video-progress').value=n;$('video-status').textContent='動画を作成しています。'+n+' / '+total+'手';}}});
  if(ac.signal.aborted)return;videoUrl=URL.createObjectURL(blob);$('video-preview').src=videoUrl;$('video-preview').hidden=false;$('video-download').href=videoUrl;$('video-download').download=record.sourceId+'-解説.webm';$('video-download').hidden=false;$('video-status').textContent='動画が完成しました。再生して確認し、保存できます。';
 }catch(error){$('video-status').textContent=ac.signal.aborted?'動画作成を中止しました。':error.message;}
 finally{if(videoController===ac){videoController=null;$('video-create').disabled=!canVideo();$('video-cancel').hidden=true;$('video-progress').hidden=true;}}
};
$('video-cancel').onclick=()=>videoController?.abort();

function stopRace(){clearInterval(raceTimer);raceTimer=null;race=null;$('rival-stop').disabled=true;}
function previewRace(){if(!record||race)return;const initial=A.initial(record.puzzle);R.board($('player-board'),initial,null,{notes:false});R.board($('cpu-board'),initial,null,{notes:false});$('player-progress').textContent='';$('cpu-progress').textContent='';$('selected-cell').textContent='';$('cpu-tech').textContent='';$('rival-status').textContent=solvedRoute(record)?'開始すると、あなたも相手も最初の盤面から解きます。':'最後まで解けた問題で対戦できます。';$('rival-start').disabled=!solvedRoute(record);}
function drawRace(){
 if(!race)return;const p={...A.initial(record.puzzle),grid:race.player};R.board($('player-board'),p,null,{notes:false,selected:race.selected});R.board($('cpu-board'),race.cpu,null,{notes:false});
 $('player-progress').textContent=race.player.filter(Boolean).length+' / 81';$('cpu-progress').textContent=race.cpu.grid.filter(Boolean).length+' / 81';
 const i=race.selected;$('selected-cell').textContent=(Math.floor(i/9)+1)+'行'+(i%9+1)+'列を選択中'+(record.puzzle.puzzle[i]?'（最初から入っている数字）':'');
}
function playerDigit(digit){
 if(!race||race.finished||record.puzzle.puzzle[race.selected])return;const i=race.selected;
 if(digit&&race.solution[i]!==digit){$('rival-status').textContent='その数字は正解と一致しません。行・列・枠を見直してみましょう。';return;}
 if(race.player[i]===digit)return;race.history.push({i,value:race.player[i]});race.player[i]=digit;drawRace();
 if(race.player.every(Boolean)){race.finished=true;clearInterval(raceTimer);$('rival-status').textContent=race.winner==='cpu'?'最後まで解けました。今回はコンピューターが先に完成しました。':'あなたが先に完成しました！';race.winner||='player';}
}
$('player-digits').replaceChildren(...Array.from({length:9},(_,i)=>{const b=node('button',String(i+1));b.onclick=()=>playerDigit(i+1);return b;}));
$('player-erase').onclick=()=>playerDigit(0);$('player-undo').onclick=()=>{if(!race||race.finished)return;const prior=race.history.pop();if(prior){race.player[prior.i]=prior.value;race.selected=prior.i;drawRace();}};
$('player-board').onclick=e=>{if(!race)return;const rect=e.currentTarget.getBoundingClientRect(),col=Math.floor((e.clientX-rect.left)/rect.width*9),row=Math.floor((e.clientY-rect.top)/rect.height*9);if(col>=0&&col<9&&row>=0&&row<9){race.selected=row*9+col;drawRace();e.currentTarget.focus();}};
document.addEventListener('keydown',e=>{
 if(!record||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;
 if(mode==='practice'&&/^[1-9]$/.test(e.key)){e.preventDefault();answer(Number(e.key));}
 if(mode!=='rival'||!race)return;
 if(/^[1-9]$/.test(e.key)){e.preventDefault();playerDigit(Number(e.key));}
 if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();playerDigit(0);}
 const shift={ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[e.key];if(shift){e.preventDefault();race.selected=Math.max(0,Math.min(80,race.selected+shift));drawRace();}
});
$('rival-start').onclick=()=>{
 const selected=record&&solvedRoute(record);if(!selected)return;stopRace();
 race={route:selected,player:record.puzzle.puzzle.slice(),cpu:A.initial(record.puzzle),at:0,selected:Math.max(0,record.puzzle.puzzle.findIndex(x=>!x)),solution:A.replay(record.puzzle,selected,selected.steps.length).grid,history:[],winner:null,finished:false};
 $('rival-stop').disabled=false;$('rival-status').textContent='開始しました。マスを選び、数字を入力してください。';drawRace();
 raceTimer=setInterval(()=>{if(!race)return;const step=race.route.steps[race.at++];if(step){A.apply(race.cpu,step);$('cpu-tech').textContent='いま使った解法：'+A.labels[step.type];drawRace();}if(race.cpu.grid.every(Boolean)||race.at>=race.route.steps.length){clearInterval(raceTimer);if(!race.winner){race.winner='cpu';$('rival-status').textContent='コンピューターが先に完成しました。続けて解いて練習できます。';}}},Number($('rival-pace').value));
};
$('rival-stop').onclick=()=>{stopRace();$('rival-status').textContent='対戦を停止しました。同じ問題で最初から始められます。';};
document.addEventListener('visibilitychange',()=>{if(document.hidden)videoController?.abort();});
window.addEventListener('pagehide',()=>{stopRace();clearVideo();});

try{
 index=await data.load();const c=index.counts;$('summary').textContent=c.records+'問・'+c.routes.toLocaleString()+'通りの手順 / 最後まで '+c.solvedPuzzles+'問・途中まで '+c.partialPuzzles+'問';
 const types=[...new Set(index.records.flatMap(r=>Object.keys(r.used)))].sort((a,b)=>A.weights[a]-A.weights[b]);$('technique').append(...types.map(t=>option(t,A.labels[t])));
 $('level').append(...[...new Set(index.records.map(r=>r.level))].sort((a,b)=>a-b).map(n=>option(String(n),'Lv.'+n)));
 renderList();const q=new URLSearchParams(location.search),id=q.get('p');if(id)await openRecord(id,q.get('mode')||'explain');
}catch(error){tell(error.message);$('summary').textContent='問題一覧を読み込めませんでした。ページを読み込み直してください。';}
