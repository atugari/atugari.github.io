(()=>{'use strict';
const frame=document.getElementById('game'),status=document.getElementById('status'),game=document.body.dataset.game;
const targets={shirupure:'shirupure.html',wado:'wado-play.html',crossword:'crossword.html',cross:'index.html',tenbin:'tenbin.html',paths:'index.html',studio:'index.html',workshop:'index.html','magic-square':'magic-square.html'};
let timer,attempts=0,initialized=false,base='';
function fail(){status.hidden=false;status.replaceChildren(document.createTextNode('読み込めませんでした。通信を確認して、'));
 const retry=document.createElement('button');retry.type='button';retry.textContent='もう一度読み込む';retry.onclick=()=>location.reload();status.append(retry,document.createTextNode('。保存済みの記録はそのままです。'));frame.hidden=true;}
function launch(w){
 if(!['cross','paths','studio','workshop'].includes(game))return true;
 if(!w.NanpureAppTest||!w.NPWebsiteTool||!w.NPPrototype)return false;
 if(game==='cross'){
  w.NPWebsiteTool('open-notebook');const b=w.document.createElement('button');b.type='button';b.dataset.action='pick-kind';b.dataset.kind='cross';b.hidden=true;w.document.getElementById('app').append(b);b.click();b.remove();
  if(w.NanpureAppTest.getConfig().kind!=='cross')throw Error('rule');
 }else{
  w.NPWebsitePrototype();if(game!=='workshop'){
   const button=w.document.querySelector('[data-proto="category"][data-page="'+(game==='paths'?'paths':'rooms')+'"]');if(!button)throw Error('page');button.click();
  }
 }
 return true;
}
function wire(w){
 const d=w.document;if(d.documentElement.dataset.pareEntry)return;d.documentElement.dataset.pareEntry=game;
 if(game==='wado'){const st=w.document.createElement('style');st.textContent='.play-header .back,.play-header strong{display:none!important}.play-header .header-tools{margin-left:auto}';(w.document.head||w.document.documentElement).append(st)}
 // All game links back to the old notebook now return to the public hub.
 d.addEventListener('click',e=>{
  const b=e.target.closest?.('a,button');if(!b)return;
  const action=b.dataset.action||b.dataset.act||b.dataset.proto;
  const proto=w.NPPrototype?.getRoute?.();
  const atPrototypeRoot=proto&&!proto.id&&((game==='paths'&&proto.page==='paths')||(game==='studio'&&proto.page==='rooms')||(game==='workshop'&&proto.page==='menu'));
  if(b.dataset.proto==='back'&&atPrototypeRoot){e.preventDefault();e.stopImmediatePropagation();saveAndGo('/plaza.html');return}
  if(b.tagName==='A'){
   const url=new URL(b.getAttribute('href')||'',w.location.href);
   if(url.origin===location.origin&&[base+'index.html','/plaza.html'].includes(url.pathname)){
    e.preventDefault();e.stopImmediatePropagation();saveAndGo('/plaza.html');return;
   }
  }
  if(action==='exit'){e.preventDefault();e.stopImmediatePropagation();saveAndGo('/plaza.html');return}
  if(game==='cross'&&['home','hub','open-notebook'].includes(action)){
   e.preventDefault();e.stopImmediatePropagation();void Promise.resolve(w.appPause?.()).then(()=>{initialized=false;ready()});
  }
 },true);
 function labels(){const translated=w.NPI18n?.t('‹ パレあそび')||'‹ パレあそび';d.querySelectorAll('[data-action="exit"]').forEach(b=>{b.setAttribute('data-i18n-skip','');if(b.textContent!==translated)b.textContent=translated});d.querySelectorAll('a[href]').forEach(a=>{const url=new URL(a.getAttribute('href'),w.location.href);if(url.origin!==location.origin||![base+'index.html','/plaza.html'].includes(url.pathname))return;a.setAttribute('data-i18n-skip','');if(a.getAttribute('href')!=='/plaza.html')a.setAttribute('href','/plaza.html');if(a.textContent!==translated)a.textContent=translated;if(a.getAttribute('aria-label')!==(w.NPI18n?.t('パレあそびに戻る')||'パレあそびに戻る'))a.setAttribute('aria-label',w.NPI18n?.t('パレあそびに戻る')||'パレあそびに戻る')});}
 let queued=false;new w.MutationObserver(()=>{if(queued)return;queued=true;w.requestAnimationFrame(()=>{queued=false;labels()})}).observe(d.body,{childList:true,subtree:true});labels();w.addEventListener('np-language-change',labels);window.NPReadingTools?.sync();
 const oldBack=w.appBack;if(oldBack)w.appBack=()=>{
  const screen=w.ShirupureCourse?.getScreen?.()||w.NPTenbin?.getScreen?.()||w.NPCrossword?.getScreen?.();
  if(screen==='home')saveAndGo('/plaza.html');else oldBack();
 };
 if(game==='cross'){
  const style=d.createElement('style');style.textContent='[data-kind]:not([data-kind="cross"]),[data-web-kind]:not([data-web-kind="cross"]){display:none!important}';d.head.append(style);
 }
}
async function saveAndGo(url){try{const saved=await frame.contentWindow?.appPause?.();if(saved===false)throw Error();await frame.contentWindow?.NPStorage?.flush?.();location.assign(url)}catch{status.hidden=false;status.textContent='途中の状態を保存できませんでした。画面を閉じる前に保存を確認してください。'}}
function ready(){try{
 const w=frame.contentWindow;if(!w||w.location.href==='about:blank')return;
 if(!w.document.querySelector('main'))throw Error('document');
 if(!initialized){if(!launch(w)){if(++attempts<150){timer=setTimeout(ready,200);return}throw Error('startup')}initialized=true}
 wire(w);status.hidden=true;frame.hidden=false;
 }catch{fail()}}
frame.addEventListener('load',()=>{clearTimeout(timer);attempts=0;ready()});
document.querySelector('[data-hub]')?.addEventListener('click',e=>{e.preventDefault();void saveAndGo('/plaza.html')});
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==frame.contentWindow)return;
 if(e.data?.type==='np-notebook-playing')(window.NPSiteAudio||frame.contentWindow.NPSiteAudio)?.setActive(!!e.data.playing);
 if(e.data?.type==='np-site-open'&&e.data.panel==='audio')showAudio();
 if(e.data?.type==='np-notebook-route')onRoute(e.data.key,!!e.data.freshDocument,e.data.intent);
});
// Browser Back steps back through the game's screens: the child posts
// its route on every screen change, and one Back press is one appBack.
let routeStack=[],routeDepth=-1,syncingHistory=false;
try{history.replaceState({pz:0},'')}catch{}
function onRoute(key,fresh,intent){
 if(fresh||routeDepth<0){routeStack=[key];routeDepth=0;try{history.replaceState({pz:0},'')}catch{}return}
 if(key===routeStack[routeDepth])return;
 const ix=routeStack.indexOf(key);
 if(intent==='back'||(ix>=0&&ix<routeDepth)){
  if(ix<0){routeStack=[key];routeDepth=0;try{history.replaceState({pz:0},'')}catch{}return}
  const delta=ix-routeDepth;routeStack.length=ix+1;routeDepth=ix;
  if(delta<0){syncingHistory=true;history.go(delta)}
  return;
 }
 routeStack.length=routeDepth+1;routeStack.push(key);routeDepth++;
 try{history.pushState({pz:routeDepth},'')}catch{}
}
window.addEventListener('popstate',e=>{
 if(syncingHistory){syncingHistory=false;return}
 const target=e.state&&typeof e.state.pz==='number'?e.state.pz:null;
 if(target===null||target>=routeDepth)return;
 routeDepth=target;routeStack.length=target+1;
 frame.contentWindow?.appBack?.();
 // If appBack only closed a sub-step inside the same screen, the route
 // key does not change and no route message arrives. Re-arm one history
 // step so the next Back press keeps stepping instead of leaving.
 setTimeout(()=>{
  try{
   const w=frame.contentWindow;if(!w||w.location.href==='about:blank')return;
   const route=w.NPTenbin?.getScreen?.()||w.NPCrossword?.getScreen?.()||w.ShirupureCourse?.getScreen?.()||w.document.body?.dataset?.screen||'home';
   const key=w.location.pathname+':'+route;
   if(key===routeStack[routeDepth])return;
   if(routeStack.indexOf(key)>=0)return;
   routeStack.length=routeDepth+1;routeStack.push(key);routeDepth++;
   history.pushState({pz:routeDepth},'');
  }catch{}
 },450);
});
const audioDialog=document.createElement('dialog');audioDialog.className='audio-dialog';audioDialog.setAttribute('aria-label','音の設定');document.body.append(audioDialog);
function showAudio(){
 const a=window.NPSiteAudio||frame.contentWindow?.NPSiteAudio;if(!a)return;const p=a.get();
 audioDialog.innerHTML='<form method="dialog"><h2>音の設定</h2><label><input data-audio="music" type="checkbox" '+(p.music?'checked':'')+'> BGM</label><label>BGM音量 <input data-audio="musicVolume" type="range" min="0" max="100" value="'+p.musicVolume+'"></label><label>曲 <select data-audio="track">'+['cozy-puzzle-1','cozy-puzzle-2','cozy-puzzle-3','magic-puzzle-1'].map((t,i)=>'<option value="'+t+'" '+(p.track===t?'selected':'')+'>BGM '+(i+1)+'</option>').join('')+'</select></label><label><input data-audio="effects" type="checkbox" '+(p.effects?'checked':'')+'> 効果音</label><label>効果音量 <input data-audio="effectsVolume" type="range" min="0" max="100" value="'+p.effectsVolume+'"></label><label>効果音 <select data-audio="style">'+['paper','soft','glass'].map(t=>'<option value="'+t+'" '+(p.style===t?'selected':'')+'>'+({paper:'紙',soft:'やわらか',glass:'ガラス'}[t])+'</option>').join('')+'</select></label><p data-audio-status role="status"></p><div class="audio-actions"><button type="button" data-preview>BGMを試聴</button><button type="button" data-effect>効果音を試聴</button><button>閉じる</button></div></form>';
 audioDialog.querySelectorAll('[data-audio]').forEach(el=>el.addEventListener('input',()=>{a.unlock();a.set({[el.dataset.audio]:el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value})}));
 audioDialog.querySelector('[data-preview]').onclick=()=>a.preview(!a.isPreview());audioDialog.querySelector('[data-effect]').onclick=()=>{a.unlock();a.effect('input',true)};
 if(!audioDialog.open)audioDialog.showModal();
}
audioDialog.addEventListener('close',()=>(window.NPSiteAudio||frame.contentWindow?.NPSiteAudio)?.preview(false));document.querySelector('[data-sound]')?.addEventListener('click',showAudio);
async function open(){try{
 const response=await fetch('/nanpure/version.json',{cache:'no-store'});if(!response.ok)throw Error('version');const {version}=await response.json();
 if(!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version)||!targets[game])throw Error('version');base='/nanpure/releases/'+version+'/notebook/';
 const audio=document.createElement('script');audio.src='/nanpure/releases/'+version+'/site-audio.js';await new Promise(resolve=>{audio.onload=audio.onerror=resolve;document.head.append(audio)});
 frame.src=base+targets[game];
 }catch{fail()}}
open();
})();
