!function(){"use strict";
// Keyboard navigation stays inside this game's controls; native button activation is retained.
function npCreateGameKeyboard(config){
 const attributes=['id','data-act','data-action','data-proto','data-cell','data-edge','data-choice','data-mode','data-ink','data-size','data-entry','data-index','data-id','data-open','data-theme','data-count','data-level','data-kind','data-rows','data-cols','data-shape','data-target','data-n','data-track','data-variant','data-format','data-step','data-group','data-page'];
 let lastBoardKey='';
 const items=()=>Array.from(config.root()?.querySelectorAll(config.items)||[]).filter(node=>!node.disabled);
 const boardKey=node=>node.hasAttribute('data-edge')?'edge:'+node.dataset.edge:node.hasAttribute('data-cell')?'cell:'+node.dataset.cell:'choice:'+node.dataset.choice;
 function modalOpen(){
  const selector='dialog[open],.modal-wrap [role="dialog"][aria-modal="true"]';
  if(document.querySelector(selector))return true;
  try{return parent!==window&&!!parent.document.querySelector(selector)}catch{return false}
 }
 function capture(){
  const root=config.root(),active=document.activeElement;
  if(!root||!active||!root.contains(active))return null;
  const attrs=attributes.filter(name=>active.hasAttribute(name)).map(name=>[name,active.getAttribute(name)]);
  return attrs.length?{attrs,board:active.matches(config.items),selection:typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null}:null;
 }
 function refresh(previous){
  const nodes=items(),selected=nodes.find(node=>boardKey(node)===lastBoardKey)||nodes[0];
  for(const node of nodes)node.tabIndex=node===selected?0:-1;
  if(selected)lastBoardKey=boardKey(selected);
  if(!previous||modalOpen())return;
  const root=config.root();
  const target=Array.from(root?.querySelectorAll('button,input,select,textarea,a')||[]).find(node=>!node.disabled&&previous.attrs.every(([name,value])=>node.getAttribute(name)===value))||selected||config.fallback?.(root);
  if(!target)return;
  target.focus({preventScroll:true});
  if(previous.selection&&typeof target.setSelectionRange==='function')try{target.setSelectionRange(...previous.selection)}catch{}
 }
 function move(current,key,nodes){
  if(key==='Home')return nodes[0];
  if(key==='End')return nodes[nodes.length-1];
  if(config.linear){const index=nodes.indexOf(current),delta=key==='ArrowLeft'||key==='ArrowUp'?-1:1;return nodes[Math.max(0,Math.min(nodes.length-1,index+delta))]}
  const columns=config.columns();
  if(!Number.isInteger(columns)||columns<1)return current;
  const dx=key==='ArrowLeft'?-1:key==='ArrowRight'?1:0,dy=key==='ArrowUp'?-1:key==='ArrowDown'?1:0;
  if(current.hasAttribute('data-edge')){
   const point=node=>{const [a,b]=node.dataset.edge.split('-').map(Number);return{x:(a%columns+b%columns)/2,y:(Math.floor(a/columns)+Math.floor(b/columns))/2}};
   const origin=point(current);
   return nodes.map((node,index)=>{const p=point(node),x=p.x-origin.x,y=p.y-origin.y;return{node,index,forward:x*dx+y*dy,side:Math.abs(x*dy-y*dx),turn:y*dx-x*dy,distance:x*x+y*y}}).filter(candidate=>candidate.forward>0&&candidate.side<=candidate.forward).sort((a,b)=>a.distance-b.distance||a.side-b.side||a.turn-b.turn||a.index-b.index)[0]?.node||current;
  }
  const start=Number(current.dataset.cell),byCell=new Map(nodes.map(node=>[Number(node.dataset.cell),node])),last=Math.max(...byCell.keys()),rows=Math.floor(last/columns)+1;
  let row=Math.floor(start/columns)+dy,column=start%columns+dx;
  while(row>=0&&row<rows&&column>=0&&column<columns){const target=byCell.get(row*columns+column);if(target)return target;row+=dy;column+=dx}
  return current;
 }
 document.addEventListener('focusin',event=>{
  const node=event.target.closest?.(config.items),root=config.root();
  if(!node||node.disabled||!root?.contains(node))return;
  lastBoardKey=boardKey(node);for(const button of items())button.tabIndex=button===node?0:-1;
 });
 document.addEventListener('keydown',event=>{
  const current=event.target.closest?.(config.items),root=config.root();
  if(!current||current.disabled||!root?.contains(current))return;
  if(modalOpen()){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))event.preventDefault();return}
  if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
  if(event.key==='Enter'&&config.enter){event.preventDefault();if(!event.repeat){current.click();config.enter(current)}return}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();move(current,event.key,items())?.focus({preventScroll:true});
 });
 return{capture,refresh};
}

const npKeys=npCreateGameKeyboard({root:()=>document.getElementById('app'),items:'.choices button[data-choice]',linear:true,fallback:root=>root?.querySelector('[data-action="next"]')});
const e=Tenbin,t="nanpure-symbol-tenbin-v1",a=e=>document.getElementById(e);let l={level:0,list:[],current:null},n=null,i="home",o="";try{let a=JSON.parse(localStorage.getItem(t));a&&Array.isArray(a.list)&&(l=a,l.list=a.list.filter(e.valid),e.levels[l.level]||(l.level=0),n=l.list.find(e=>e.id===l.current)||null)}catch(e){o="保存データを読み込めませんでした。"}function r(){if(window.NPRecovery&&NPRecovery.isRestoring())return!0;try{return localStorage.setItem(t,JSON.stringify(l)),!0}catch(e){return o="保存できませんでした。空き容量を確認してください。",!1}}function s(e){return String(e).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[e]))}const c=(e,t,a="")=>`<button class="${a}" data-action="${t}">${e}</button>`;function d(e){const npFocus=npKeys.capture();document.body.dataset.screen=i;a("app").innerHTML=e+`<p id="message" role="status">${s(o)}</p>`;npKeys.refresh(npFocus)}function p(e){return(window.NPRecovery?NPRecovery.button("遊ぶ人・記録（"+s(NPRecovery.activeName())+"）","people"):"")+`<div class="top">${c("‹ 戻る","home")}<b>${e}</b>${c("遊び方","help")}</div>`}function u(){i="home",d(`<div class="top">${c("‹ 試作&製作中へ","exit")}${c("遊び方","help")}</div><p class="eyebrow">記号だけで考える天秤</p><h1>一番重いのは、どれ？</h1><p class="muted">下がっている側の合計が重く、水平なら同じ重さ。<br>記号を見比べて、一番重い記号を選ぼう。</p>${n?c(n.done?"前の問題を見る":"続きから遊ぶ","resume","wide"):""}<label for="level">難易度</label><select id="level">${e.levels.map((e,t)=>`<option value="${t}" ${t===l.level?"selected":""}>Lv.${t+1} ${e.name}</option>`).join("")}</select><p class="muted">${e.levels[l.level].desc}</p>${c("新しい問題をつくる","new","primary wide")}${c("保存した問題を開く","book","wide")}<p class="muted">難易度は記号の種類・個数・条件の重なりによる目安です。比較の気づき方でも難しさは変わります。</p>`)}function v(){if(l.list.length>=500)return o="保存上限です。問題帳でクリア済みの問題を整理してください。",void u();try{n=e.generate(l.level),l.list.unshift(n),l.current=n.id,o="",r(),h()}catch(e){o=e.message,u()}}function h(){if(!n)return u();window.NPRecovery&&NPRecovery.track("tenbin",n.id,"天秤 Lv."+(n.level+1),n.done,{level:n.level}),i="play",d(p(`Lv.${n.level+1} · ${e.levels[n.level].name}`)+`<div class="card balance-card">${e.diagram(n)}</div>`+(n.done?`<div class="success"><h2>${n.revealed?"答えを確認しました":"正解！"}</h2><p class="formula">${e.symbols[e.winner(n)]} が一番重い</p>${c("同じ難易度でもう一問","next","primary wide")}</div>`:`<h2>一番重い記号は？</h2><div class="choices">${n.weights.map((t,a)=>`<button data-choice="${a}" aria-pressed="${n.choice===a}" aria-label="${e.symbols[a]}を選ぶ">${e.symbols[a]}</button>`).join("")}</div><button data-action="check" class="primary wide" ${Number.isInteger(n.choice)?"":"disabled"}>答える</button>`)+`<div class="actions" style="margin-top:18px">${c("考え方","hint")}${c("メモ","note")}</div>`)}function m(e){a("dialog").innerHTML=e+c("閉じる","close","wide"),a("dialog").open||a("dialog").showModal()}function b(){i="book",d(p("天秤の問題帳")+c("この難易度でまとめて作る","batch","primary wide")+`<p class="muted">選択中：Lv.${l.level+1} ／ 保存済み ${l.list.length}問</p>`+l.list.map(t=>`<button class="record" data-open="${t.id}"><span>Lv.${t.level+1} ${e.levels[t.level].name}<br><small>${new Date(t.date).toLocaleDateString("ja-JP")} · ${t.id.slice(-4)}</small></span><small>${t.done?t.revealed?"答えを確認":"クリア":Number.isInteger(t.choice)?"途中":"未挑戦"}</small></button>`).join("")+c("クリア済みの問題を整理","clean-confirm","wide"))}document.addEventListener("change",e=>{"level"===e.target.id&&(l.level=+e.target.value,r(),u())}),document.addEventListener("input",e=>{"note"===e.target.id&&(n.note=e.target.value,r())}),document.addEventListener("click",t=>{const i=t.target.closest("button");if(i&&!i.disabled){if(void 0!==i.dataset.choice){if(!n||n.done)return;return n.choice=+i.dataset.choice,o="",r(),void h()}if(i.dataset.open)return n=l.list.find(e=>e.id===i.dataset.open),l.current=n.id,r(),void h();switch(i.dataset.action){case"home":o="",u();break;case"exit":r(),location.replace("/nanpure/releases/2026.10.27.64/notebook/index.html#prototype");break;case"help":m(`<h2>一番重い記号を選ぼう</h2>${e.diagram({rows:[{left:[2,0],right:[0,1],compare:0},{left:[1,0],right:[0,1],compare:-1}]})}<p>上の天秤はつり合っています。<b>●● と ▲ は同じ重さ</b>なので、▲ひとつは ●ふたつ分の重さです。</p><p>同じ記号はどこでも同じ重さ。どの記号にも重さがあります。両側に同じ記号があれば、同じ個数だけ取り除いても、重い・軽い・同じの関係は変わりません。</p><p>傾いている天秤は、下がっている側の合計が重いという意味です。傾きの角度から重さの差や何倍かは分かりません。片方の皿には記号が最大四個載ります。<br>複数の天秤はすべて同時に成り立ちます。重さを数字で求める必要はありません。一番重い記号を選び、「答える」を押してください。</p>`);break;case"new":v();break;case"resume":h();break;case"book":b();break;case"next":l.level=n.level,v();break;case"check":if(!n||n.done||!Number.isInteger(n.choice))return;n.titleChoices=(n.titleChoices||0)+1;n.choice===e.winner(n)?(window.NPAchievements?.capture("clear",{puzzle:n,game:"tenbin",valid:true,revealed:!!n.revealed,level:n.level+1,choices:n.titleChoices}),n.done=!0,o="",r()):o="その記号より重いものがあります。天秤を見比べてみよう。",h();break;case"hint":m(`<h2>比べるときの考え方</h2><p>まず、両側に同じ記号があれば取り消してみよう。次に、ある天秤の記号のまとまりを、同じ重さの別のまとまりに置き換えられないか考えよう。</p><p>傾いた天秤から分かるのは、どちらの合計が重いかです。重さの比や全記号の順序が決まらなくても、一番重い記号は必ず決まります。</p>${c("答えを確認する…","reveal-confirm","wide")}`);break;case"close":a("dialog").close();break;case"note":m('<h2>考えたことのメモ</h2><textarea id="note" aria-label="メモ"></textarea>'),a("note").value=n.note||"";break;case"reveal-confirm":m("<h2>答えを表示しますか？</h2><p>クリアではなく「答えを確認」として残します。</p>"+c("答えを表示する","reveal","primary wide"));break;case"reveal":n.revealed=!0,n.done=!0,r(),a("dialog").close(),h();break;case"batch":m("<h2>まとめて作る</h2><p>選択中の難易度の問題を五問作って保存します。</p>"+c("生成して保存する","batch-run","primary wide"));break;case"batch-run":if(l.list.length>495)o="保存上限を超えます。先に問題を整理してください。";else try{const t=Array.from({length:5},()=>e.generate(l.level));l.list.unshift(...t),o="問題を保存しました。",r()}catch(t){o=t.message}a("dialog").close(),b();break;case"clean-confirm":m("<h2>解き終わった問題を削除しますか？</h2><p>クリア済み・答えを確認済みの天秤問題を削除します。</p>"+c("削除する","clean","wide"));break;case"clean":l.list=l.list.filter(e=>!e.done),n?.done&&(n=null,l.current=null),r(),a("dialog").close(),b()}}}),window.NPTenbin={getScreen:()=>i,current:()=>n};window.appPause=r,window.appBack=()=>{if(window.NPI18n?.closeIfOpen())return;const e=document.getElementById("recovery-dialog");e&&e.open?e.close():a("dialog").open?a("dialog").close():"home"!==i?u():(r(),location.replace("/nanpure/releases/2026.10.27.64/notebook/index.html#prototype"))},document.addEventListener("visibilitychange",r),u()}();