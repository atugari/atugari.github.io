!function () {
    "use strict";
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

const npKeys=npCreateGameKeyboard({root:()=>t('app'),items:'#cw-play .board button[data-cell]',columns:()=>o?.n||0,enter:()=>t('answer')?.focus({preventScroll:true})});

    const e = Crossword, i = CrosswordStore, t = e => document.getElementById(e), n = e => String(e).replace(/[&<>"']/g, e => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[e]));
    let l, o, s = "home", r = 0, a = [], d = !1, c = !1;
    const drafts=new Map();let composing=false;
    try {
        l = i.load(), o = l.list.find(e => e.id === l.current) || null;
        const bounds=e.blackBounds[l.size];if(l.options.blackCount<bounds.min||l.options.blackCount>bounds.max)l.options.blackCount=null;
    }
    catch (i) {
        l = { options: e.options(), size: 0, list: [], current: null }, c = !0, setTimeout(() => u("保存データを読み込めませんでした。上書きせず停止しています。"), 0);
    }
    const p = (e, i, t = "", n = "") => `<button data-action="${i}" class="${t}" ${n}>${e}</button>`;
    function u(e) { const live=s==="play"&&t("cw-live");t("status").textContent=live?"":e;if(live)live.textContent=e; }
    function f() { if (window.NPRecovery && NPRecovery.isRestoring())
        return !0; if (c)
        return !1; try {
        return i.save(l), !0;
    }
    catch (e) {
        return u("保存できませんでした。アプリを閉じる前に、空き容量を確認して「保存を再試行」を押してください。"), !1;
    } }
    function m(e) { const npFocus=npKeys.capture();document.body.classList.remove("print-preview");document.body.classList.toggle("cw-playing",s==="play");if(s!=="play")document.body.classList.remove("cw-keyboard");t("paper").innerHTML="";t("app").innerHTML=e;npKeys.refresh(npFocus);window.NPCrosswordFit?.refresh(); }
    function $(e) { return `<div class="top">${p("‹ 戻る", "home")}<b>${e}</b>${p("遊び方", "help")}</div>`; }
    function b() { const i = e.blackBounds[l.size], t = l.options.blackCount; return Number.isInteger(t) ? Math.max(i.min, Math.min(i.max, t)) : null; }
    function h() { s = "home", m(`<div class="top">${p("‹ ナンプレ帳へ", "exit")}${p("遊び方", "help")}</div><p class="eyebrow">ことばがつながる、小さな発見。</p><h1>クロスワード帳</h1><p class="muted">ヒントを読んで、タテとヨコにカナを入れよう。</p>${o ? p(o.done ? "前の問題を見る" : "続きから遊ぶ", "resume", "wide") : ""}${p("人ごとの設定（" + (l.profiles || []).length + "件）", "profiles", "wide")}${window.NPRecovery ? NPRecovery.button("遊ぶ人・記録（" + n(NPRecovery.activeName()) + "）", "people") : ""}<section class="card"><h2>問題の大きさ</h2><div class="sizes">${e.sizes.map((e, i) => p(`<b>${e.name}</b><small>${e.n} × ${e.n}</small>`, "size", "", `data-size="${i}" aria-pressed="${i === l.size}"`)).join("")}</div><label for="black-count">黒マスの数</label><div class="cw-stepper">${p("−","black-minus","",'aria-label="黒マスを1個減らす"')}<input id="black-count" type="number" inputmode="numeric" min="${e.blackBounds[l.size].min}" max="${e.blackBounds[l.size].max}" value="${b()??''}" placeholder="自動">${p("＋","black-plus","",'aria-label="黒マスを1個増やす"')}</div>${p("自動（おすすめ）","black-auto","wide")}<div class="sizes black-presets" role="group" aria-label="黒マス数の候補">${e.presets(l.size).map((e, i) => p(["少ない", "普通", "多い"][i] + "<br><small>" + e + "個</small>", "black-preset", "", `data-count="${e}" aria-pressed="${e === b()}"`)).join("")}</div><p class="muted">空欄なら自動です。個数を指定するときは、上の欄か候補ボタンを使ってください。</p><p class="muted">入力範囲：${e.blackBounds[l.size].min}〜${e.blackBounds[l.size].max}個（全${e.sizes[l.size].n ** 2}マス）。黒マスがつながらない範囲で探します。条件によっては見つからない場合があります。</p><label for="word-level">言葉の難しさ</label><select id="word-level">${e.levels.map((e, i) => i ? `<option value="${i}" ${l.options.level === i ? "selected" : ""}>${e}</option>` : "").join("")}</select><label for="clue-level">ヒントの具体性</label><select id="clue-level">${e.clueLevels.map((e, i) => `<option value="${i}" ${(l.options.clue || 0) === i ? "selected" : ""}>${e}</option>`).join("")}</select><p class="muted">${["特徴や意味を具体的に説明します。", "一部のヒントを広い説明にします。交差する文字も手がかりに考えよう。", "広い説明を多くします。文字数と交差する文字から、当てはまる言葉を考えよう。"][l.options.clue || 0]}</p><label for="word-genre">ジャンル</label><select id="word-genre">${Object.entries(e.genres).map(([e, i]) => `<option value="${e}" ${l.options.genre === e ? "selected" : ""}>${i}</option>`).join("")}</select><p class="muted">この条件で使える言葉：${e.pool(l.size, l.options).length}語<br>未出題：${e.pool(l.size, l.options).filter(e => !(l.wordUse || {})[e[0]]).length}語</p>${p("新しい問題をつくる", "new", "primary wide", c ? "disabled" : "")}<p class="muted">「幅広い言葉」「専門・難語入り」では、その段階の言葉を全体の4分の1以上使います。難しさは語彙の目安で、盤面全体の難易度を保証するものではありません。</p></section>${p("保存した問題", "book", "wide")}${p("辞書・利用条件", "credits", "wide")}<p class="muted">${CrosswordWords.length}語収録。未出題の言葉を優先し、最近の出題語をできるだけ避けます。言葉や配置の条件によって再出題する場合があります。新しく作る問題は黒マスが上下左右で隣り合いません。斜めにつながる黒マスも、ジグザグを含めて3個までです。保存は最大500問。バックアップはナンプレ帳の「管理・便利な機能 → データ管理」から、まとめて保存できます。</p>`); }
    async function v() { if (!d && !c)
        if (l.list.length >= 500)
            u("保存上限の500問です。保存した問題から、完成済みの問題を整理してください。");
        else {
            d = !0, t("app").querySelectorAll("button").forEach(e => e.disabled = !0), u(l.options.clue ? "交差から答えを一つに絞れるか調べています…" : "ことばの交差を確かめています…"), await new Promise(e => setTimeout(e, 30));
            try {
                const value=t("black-count").value.trim(),n=value===""?null:Number(value);
                if (n!==null&&(!Number.isInteger(n) || n < e.blackBounds[l.size].min || n > e.blackBounds[l.size].max))
                    throw Error(`黒マスは${e.blackBounds[l.size].min}〜${e.blackBounds[l.size].max}個の整数にしてください。`);
                let s;
                l.options.blackCount = n;
                for (let i = 0; i < 5 && (s = await makePuzzle(l.size,l.options,l), l.list.some(e => e.id === s.id || JSON.stringify(e.grid) === JSON.stringify(s.grid))); i++)
                    s = null;
                if (!s)
                    throw Error("別の配置を見つけられませんでした。もう一度お試しください。");
                o = s, i.remember(l, o), l.list.unshift(o), l.current = o.id, r = 0, a = [], u("");
                const d = f();
                g(), o.variety && o.variety.recentRepeats && u(`交差を作るため、最近出題した言葉を${o.variety.recentRepeats}語使っています。`), d || u("問題はできましたが未保存です。「保存を再試行」を押してください。");
            }
            catch (e) {
                h(), u(e.message);
            }
            finally {
                d = !1;
            }
        } }
    function w(i = !1, t = !1) { let l = new Set(t ? [] : e.cells(o, o.entries[r])), s = new Map(o.entries.map(e => [e.r * o.n + e.c, e.num])); return `<div class="board"  style="grid-template-columns:repeat(${o.n},minmax(0,1fr))">${o.grid.map((e, r) => `<div class="cell ${e ? "" : "block"} ${l.has(r) ? "active" : ""} ${a.includes(r) && !t ? "error" : ""}">${e ? `${s.has(r) ? `<small>${s.get(r)}</small>` : ""}${t ? `<span>${i ? e : ""}</span>` : p(n(o.input[r] || " "), "cell", "", `data-cell="${r}" aria-label="${Math.floor(r / o.n) + 1}行${r % o.n + 1}列 ${n(o.input[r] || "空欄")}"`)}` : ""}</div>`).join("")}</div>`; }
    function clueList(){return '<div class="cluelist">'+[0,1].map(direction=>`<section><h2>${direction?'タテ':'ヨコ'}のカギ</h2>${o.entries.map((entry,index)=>entry.d===direction?p(`<b>${entry.num}</b>　${n(entry.clue)} <small>（${entry.answer.length}文字）</small>`,"clue","",`data-entry="${index}" aria-pressed="${index===r}"`):'').join('')}</section>`).join('')+'</div>'}
    function draftKey(){return o.id+':'+r}
    function g(){
        if(!o)return h();s='play';if(!o.entries[r])r=0;
        window.NPRecovery?.track('crossword',o.id,'クロスワード '+e.label(o),o.done,o.options);
        if(t('cw-play')?.dataset.puzzle!==o.id){
            m(`<section id="cw-play" class="cw-play" data-puzzle="${n(o.id)}"><header class="cw-play-head"><strong>クロスワード <small>${o.n}×${o.n}</small></strong><output id="cw-progress"></output></header><div class="cw-board-area">${w()}</div><section class="cw-entry" id="entry-card"><div class="cw-clue-row">${p('‹','previous','cw-arrow','type="button" aria-label="前のカギ"')}<div class="cw-clue-copy"><b class="badge" id="cw-clue-badge"></b><span id="cw-clue-text"></span><small id="cw-word-length"></small></div>${p('›','next','cw-arrow','type="button" aria-label="次のカギ"')}</div><form id="entry-form"><label class="cw-sr-only" for="answer">選んだカギの言葉を入力</label><div class="cw-input-row"><input class="entry" id="answer" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="40" enterkeyhint="done" aria-describedby="cw-clue-text cw-word-length" placeholder="ひらがなでもOK">${p('入れる','put','primary','type="submit"')}${p('入力終了','keyboard-done','cw-keyboard-done','type="button"')}</div></form></section><nav class="cw-actions" aria-label="問題の操作">${p('答え合わせ','check','primary')}${p('カギ一覧','clues')}${p('その他','more')}</nav><p class="cw-live" id="cw-live" role="status" aria-live="polite"></p></section>`);
        }
        updatePlay();npKeys.refresh();window.NPCrosswordFit?.refresh();
    }
    function updatePlay(){
        const entry=o.entries[r],active=new Set(e.cells(o,entry));
        t('cw-play').querySelectorAll('button[data-cell]').forEach(button=>{const at=+button.dataset.cell,text=o.input[at]||' ';if(button.textContent!==text)button.textContent=text;button.parentElement.classList.toggle('active',active.has(at));button.parentElement.classList.toggle('error',a.includes(at));button.setAttribute('aria-label',`${Math.floor(at/o.n)+1}行${at%o.n+1}列 ${o.input[at]||'空欄'}`);button.setAttribute('aria-pressed',String(active.has(at)))});
        t('cw-clue-badge').textContent=(entry.d?'タテ':'ヨコ')+' '+entry.num;t('cw-clue-text').textContent=entry.clue;t('cw-word-length').textContent=entry.answer.length+'文字';
        const letters=e.cells(o,entry).map(at=>o.input[at]||'□'),input=t('answer'),value=drafts.has(draftKey())?drafts.get(draftKey()):letters.includes('□')?'':letters.join('');
        if(input.value!==value)input.value=value;input.placeholder=letters.join('')+'（ひらがな可）';
        t('cw-progress').textContent=o.done?'完成！':`${o.input.filter(Boolean).length} / ${o.grid.filter(Boolean).length}マス`;t('cw-progress').classList.toggle('is-complete',o.done);
    }
    function y(index){drafts.set(draftKey(),t('answer').value);r=index;a=[];t('dialog').open&&t('dialog').close();g();u('');}
    async function makePuzzle(size,options,history){
        const seed=crypto.getRandomValues(new Uint32Array(1))[0];
        if(typeof Worker==='undefined')return e.generate(size,seed,options,history);
        return new Promise((resolve,reject)=>{let worker;try{worker=new Worker('/nanpure/releases/2026.10.24.51/notebook/crossword-worker.js')}catch(error){reject(Error('問題を作る準備ができませんでした。ページを再読み込みしてください。'));return}
            const timer=setTimeout(()=>{worker.terminate();reject(Error('生成に時間がかかっています。黒マスを自動、ジャンルをすべてにしてお試しください。'))},12000);
            const finish=()=>{clearTimeout(timer);worker.terminate()};worker.onmessage=event=>{finish();if(event.data.error)reject(Error(event.data.error));else if(!e.valid(event.data.puzzle))reject(Error('問題の検証に失敗しました。'));else resolve(event.data.puzzle)};worker.onerror=()=>{finish();reject(Error('問題を作れませんでした。もう一度お試しください。'))};worker.postMessage({size,seed,options,history:{recent:history.recent,wordUse:history.wordUse,list:history.list.map(p=>({n:p.n,grid:p.grid}))}})
        });
    }
    function k() { s = "book", m($("保存した問題") + '<label for="query">問題IDで探す</label><input id="query" type="search" class="wide" placeholder="CW-…"><label for="filter">表示する問題</label><select id="filter"><option value="all">すべて</option><option value="open">未完成</option><option value="done">完成</option></select><div id="records"></div>' + p("完成済みを削除…", "delete", "wide")), z(); }
    function z() { const i = t("query").value.trim().toUpperCase(), o = t("filter").value; let s = l.list.filter(e => e.id.includes(i) && ("all" === o || e.done === ("done" === o))); t("records").innerHTML = s.length ? s.map(i => p(`<b>${i.n}×${i.n} · ${i.done ? "完成" : "未完成"}</b><small>${i.id} · ${i.entries.length}語<br>${n(e.label(i))}</small>`, "open", "record", `data-id="${i.id}"`)).join("") : "<p>該当する問題がありません。</p>"; }
    function x(e) { t("dialog").innerHTML = e + p("閉じる", "close", "wide"), t("dialog").open || t("dialog").showModal(); }
    function C() { x('<h2>人ごとの設定</h2><p>名前を付けて、大きさ・黒マス数・言葉の難しさ・ヒントの具体性・ジャンルを保存できます。</p><label for="profile-name">名前・呼び名</label><input id="profile-name" maxlength="32" placeholder="例：田中さん、父、初級グループ">' + p("今の設定を保存", "profile-save", "primary wide") + '<p id="profile-status" role="status"></p><h3>保存した設定</h3>' + ((l.profiles || []).length ? '<label for="profile-select">使う人を選ぶ</label><select id="profile-select">' + l.profiles.map(e => `<option value="${n(e.id)}">${n(e.name)}</option>`).join("") + '</select><p id="profile-summary" class="muted"></p>' + p("この設定で問題を作る", "profile-generate", "primary wide") + p("設定を読み込む", "profile-load", "wide") + p("選んだ設定を削除…", "profile-delete", "wide") : "<p>まだ保存した設定はありません。</p>")), j(); }
    function N() { return (l.profiles || []).find(e => e.id === (t("profile-select") || {}).value); }
    function j() { const i = N(); i && (t("profile-summary").textContent = function (i) { return `${e.sizes[i.size].n}×${e.sizes[i.size].n}・黒マス${i.options.blackCount==null?"自動":i.options.blackCount+"個"} / ${e.levels[i.options.level]} / ${e.clueLevels[i.options.clue]} / ${e.genres[i.options.genre]}`; }(i)); }
    function B(i = !1) { const n = t("profile-name").value.trim(); if (!n)
        return void (t("profile-status").textContent = "名前を入力してください。"); l.profiles = l.profiles || []; const o = l.profiles.find(e => e.name === n); if (o && !i)
        return void (t("profile-status").innerHTML = "同じ名前の設定があります。今の設定に更新しますか？" + p("この名前の設定を更新", "profile-replace", "wide")); if (!o && l.profiles.length >= 100)
        return void (t("profile-status").textContent = "保存は100件までです。"); const s=t("black-count").value.trim()===""?null:Number(t("black-count").value),r=e.blackBounds[l.size];if(s!==null&&(!Number.isInteger(s)||s<r.min||s>r.max))
        return void (t("profile-status").textContent = `黒マスを${r.min}〜${r.max}個に直してください。`); const a = { id: o ? o.id : "CP-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10), name: n, size: l.size, options: e.options({ ...l.options, blackCount: s }) }; o ? l.profiles[l.profiles.indexOf(o)] = a : l.profiles.push(a), f() && (C(), t("profile-status").textContent = n + "の設定を保存しました。"); }
    function L(i) { return `<section class="print-sheet"><h1>クロスワード ${i ? "解答" : "問題"}　${o.n}×${o.n}</h1><p>${o.id} · ${n(e.label(o))}<br>小さいカナは大きいカナと同じ扱い。${o.layout==='separated-v1'?'黒マスは上下左右で隣り合わず、斜めは3個までです。':'以前保存した自由配置の問題です。'}</p>${w(i, !0)}<div class="paper-clues">${[0, 1].map(e => `<section><h2>${e ? "タテ" : "ヨコ"}のカギ</h2>${o.entries.filter(i => i.d === e).map(e => `<p><b>${e.num}.</b> ${n(e.clue)}（${e.answer.length}文字）${i ? "：" + e.answer : ""}</p>`).join("")}</section>`).join("")}</div><p class="print-credit">語彙出典：Japanese Wordnet (v1.1) © 2009-2011 NICT, 2012-2015 Francis Bond and 2016-2024 Francis Bond, Takayuki Kuribayashi<br>https://bond-lab.github.io/wnja/index.en.html · 許諾文 https://bond-lab.github.io/wnja/license.txt · カギは独自作成</p><p class="print-license">${n(window.CrosswordLicense)}</p></section>`; }
    document.addEventListener('compositionstart',event=>{if(event.target.id==='answer')composing=true});
    document.addEventListener('compositionend',event=>{if(event.target.id==='answer'){composing=false;drafts.set(draftKey(),event.target.value)}});
    document.addEventListener('pointerdown',event=>{if(document.activeElement===t('answer')&&event.target.closest('#cw-play button')&&!event.target.closest('[data-action="keyboard-done"]'))event.preventDefault()});
    document.addEventListener('submit',event=>{if(event.target.id!=='entry-form')return;event.preventDefault();if(composing)return;const entry=o.entries[r],value=e.normalize(t('answer').value);if(value.length!==entry.answer.length){u(`${entry.answer.length}文字の言葉を入れてください。入力は${value.length}文字です。`);return}e.cells(o,entry).forEach((at,k)=>o.input[at]=value[k]);drafts.delete(draftKey());o.done=o.grid.every((letter,k)=>!letter||letter===o.input[k]);a=[];u('');const saved=f();g();if(saved)u(o.done?'完成！ すべての言葉がつながりました。':'マスに入れました。');});
    document.addEventListener('input',event=>{if(event.target.id==='query')z();if(event.target.id==='answer')drafts.set(draftKey(),event.target.value)});
    document.addEventListener("change", i => { "filter" === i.target.id && z(), "profile-select" === i.target.id && j(), ["word-level", "word-genre", "clue-level", "black-count"].includes(i.target.id) && (l.options = e.options({ blackCount: "" !== t("black-count").value ? Number(t("black-count").value) : null, level: +t("word-level").value, clue: +t("clue-level").value, genre: t("word-genre").value }), f(), "black-count" === i.target.id ? document.querySelectorAll('[data-action="black-preset"]').forEach(e => e.setAttribute("aria-pressed", String(+e.dataset.count === l.options.blackCount))) : h()); }), document.addEventListener("click", i => { let c = i.target.closest("button[data-action]"); if (!c || c.disabled || d)
        return; let w = c.dataset.action; var z; if ("put" !== w)
        try {
            if(composing&&["cell","next","previous","clues"].includes(w)){u("文字の変換を確定してから、カギを選んでください。");return;}
            if ("exit" === w)
                f() && (location.replace("/nanpure/releases/2026.10.24.51/notebook/index.html#rules"));
            else if ("home" === w)
                f() && (u(""), h());
            else if ("profiles" === w)
                C();
            else if ("profile-save" === w)
                B();
            else if ("profile-replace" === w)
                B(!0);
            else if ("profile-load" === w || "profile-generate" === w)
                !function (i) { const n = N(); n && (window.NPRecovery && NPRecovery.ensurePerson(n.id, n.name), l.size = n.size, l.options = e.options(n.options), l.options.blackCount = b(), f() && (t("dialog").close(), h(), u(n.name + "の設定を読み込みました。"), i && v())); }("profile-generate" === w);
            else if ("profile-delete" === w) {
                const e = N();
                e && x("<h2>設定を削除しますか？</h2><p>" + n(e.name) + "の設定を削除します。作成済みの問題は残ります。</p>" + p("削除する", "profile-delete-ok", "wide", `data-id="${n(e.id)}"`));
            }
            else if ("profile-delete-ok" === w)
                l.profiles = l.profiles.filter(e => e.id !== c.dataset.id), f() && C();
            else if(w==='black-minus'||w==='black-plus'){
                const input=t('black-count'),limits=e.blackBounds[l.size],current=input.value.trim()===''?null:Number(input.value);
                const next=current===null||!Number.isFinite(current)?e.presets(l.size)[1]:Math.max(limits.min,Math.min(limits.max,current+(w==='black-plus'?1:-1)));
                l.options.blackCount=next;input.value=String(next);f();for(const button of document.querySelectorAll('[data-action="black-preset"]'))button.setAttribute('aria-pressed',String(+button.dataset.count===next));
                u('黒マス：'+next+'個');
            }
            else if("black-auto"===w)l.options.blackCount=null,f(),h();
            else if ("black-preset" === w)
                l.options.blackCount = +c.dataset.count, f(), h();
            else if ("size" === w)
                l.size = +c.dataset.size, l.options.blackCount = null, f(), h();
            else if ("new" === w)
                v();
            else if ("resume" === w)
                g();
            else if("language"===w){t("dialog").close();window.NPI18n?.show();}
            else if ("help" === w)
                x("<h2>交差した文字がヒント！</h2><p>ヨコのカギは番号のマスから右へ、タテのカギは下へ。黒マスか外枠まで、1マスにカタカナ1文字ずつ入れます。</p><p>分かるカギから埋めましょう。例えばヨコに「ネコ」を入れると、交差するタテの言葉にも「ネ」か「コ」が入ります。その文字と文字数から、次の言葉を考えます。</p><p>盤面かカギを押す → 言葉を入力 →「入れる」。交点を続けて押すとタテ・ヨコが切り替わります。既にある交差文字も入力した言葉で更新します。</p><p>「ッャュョ」は「ツヤユヨ」と同じ扱い。「ガ」などの濁点つき文字も1マス。「ー」も1マスです。</p><p>「ヒントの具体性」は言葉の難しさと別に選べます。例えば「札幌市を道庁所在地とする都道府県」なら具体的ですが、「都道府県」だけなら複数の言葉が考えられます。文字数や交差して入った文字を手がかりに、自分で言葉を考えます。候補一覧から選ぶルールはありません。</p><p>新しく作る問題は黒マスが上下左右で隣り合いません。斜めはジグザグも含めて3個まで。白マスはすべてつながります。以前保存した問題の配置はそのままです。答え合わせは用意した語と照合します。同じ意味の別の言い方が入る可能性を完全に排除するものではありません。</p>");
            else if ("credits" === w)
                x(`<h2>辞書・利用条件</h2><p>日本語WordNet 1.1から選んだ語彙と独自に追加した語彙を合わせ、${CrosswordWords.length}語を収録。読みと、意味を説明するカギはこのアプリ用に独自作成しました。元の定義文は転載していません。語彙の3段階・ジャンルは本アプリ独自の分類です。</p><p>出典：Japanese Wordnet (v1.1) © 2009-2011 NICT, 2012-2015 Francis Bond and 2016-2024 Francis Bond, Takayuki Kuribayashi</p><p><a href="https://bond-lab.github.io/wnja/index.en.html">日本語WordNet</a><br><small>https://bond-lab.github.io/wnja/index.en.html</small></p><p>元データは著作権表示・許諾文・免責文を保持すれば、商用を含め利用・改変・再配布できます。印刷物にも出典を記載します。アプリを再配布する際は同梱のライセンスを保持してください。</p><p>追加した読み・カギ・生成した盤面は、作成者が有する権利の範囲で、商用を含む利用・複製・改変・再配布を許可します。語彙の元データには下の条件も適用されます。</p><pre>${n(window.CrosswordLicense || "wordnet-license.txt に全文を同梱しています。")}</pre>`);
            else if ("book" === w)
                k();
            else if ("close" === w)
                t("dialog").close();
            else if ("open" === w)
                o = l.list.find(e => e.id === c.dataset.id), l.current = o.id, r = 0, a = [], f(), g();
            else if("clues"===w)x("<h2>カギ一覧</h2>"+clueList());
            else if("keyboard-done"===w)t("answer").blur();
            else if ("clue" === w)
                y(+c.dataset.entry);
            else if ("cell" === w) {
                let i = o.entries.map((i, t) => e.cells(o, i).includes(+c.dataset.cell) ? t : -1).filter(e => e >= 0);
                y(i[(i.indexOf(r) + 1) % i.length]);
            }
            else if ("previous" === w || "next" === w)
                y((r + ("next" === w ? 1 : o.entries.length - 1)) % o.entries.length);
            else if ("erase" === w)
                e.cells(o, o.entries[r]).forEach(e => o.input[e] = ""),drafts.delete(draftKey()),o.done = !1, a = [], f(),t("dialog").close(),g(), u("交差するマスの文字も消しました。");
            else if ("check" === w)
                a = o.grid.map((e, i) => e && o.input[i] && o.input[i] !== e ? i : -1).filter(e => e >= 0), o.done = o.grid.every((e, i) => !e || e === o.input[i]), f(), g(), u(o.done ? "完成しました！" : a.length ? `${a.length}マスが用意した答えと違います。色のついたマスを見直そう。` : "入力した文字は合っています。空いているマスを埋めよう。");
            else if ("meanings" === w && o.done)
                x("<h2>解答の言葉・読み・意味</h2>" + o.entries.map(e => { const i = CrosswordWords.find(i => i[0] === e.answer); return `<section><h3>${n(i[4])} <small>（${n(i[0])}）</small></h3><p>${n(i[1])}</p></section>`; }).join(""));
            else if ("more" === w)
                x("<h2>この問題の操作</h2>" +p("この言葉を消す","erase","wide")+p("遊び方","help","wide")+p("問題選びに戻る","home","wide")+p("言語を選ぶ","language","wide")+`<p class="muted">${n(o.id)} · ${n(e.label(o))}</p>`+ p("このカギの1文字を教えて", "hint", "wide") + p("紙に印刷する", "print-menu", "wide") + p("保存を再試行", "retry", "wide") + (o.done ? p("解答の言葉・読み・意味", "meanings", "wide") : "") + p("解答をすべて表示…", "reveal", "wide"));
            else if ("retry" === w)
                f() && (u("保存しました。"), t("dialog").close());
            else if ("hint" === w) {
                let i = e.cells(o, o.entries[r]).find(e => o.input[e] !== o.grid[e]);
                void 0 !== i && (o.input[i] = o.grid[i], o.hints++, drafts.delete(draftKey()), o.done = o.grid.every((e, i) => !e || e === o.input[i]), f()), t("dialog").close(), g(), u(void 0 === i ? "この言葉は合っています。" : "1文字を入れました。");
            }
            else
                "reveal" === w ? x("<h2>解答を表示しますか？</h2><p>すべてのマスに答えが入り、完成扱いになります。</p>" + p("解答を表示する", "reveal-ok", "primary wide")) : "reveal-ok" === w ? (o.input = o.grid.slice(), drafts.clear(), o.hints++, o.done = !0, f(), t("dialog").close(), g()) : "delete" === w ? x("<h2>完成済みの問題を削除？</h2><p>未完成の問題は残します。削除は取り消せません。</p>" + p("完成済みを削除する", "delete-ok", "wide")) : "delete-ok" === w ? (l.list = l.list.filter(e => !e.done), o = l.list.find(e => e.id === l.current) || null, o || (l.current = null), f(), t("dialog").close(), k()) : "print-menu" === w ? x("<h2>印刷する内容</h2>" + p("問題だけ", "print-question", "wide") + p("問題と解答（別ページ）", "print-answer", "wide")) : "print-question" === w || "print-answer" === w ? (z = "print-answer" === w, t("dialog").close(), s = "print", m('<div class="print-controls">' + $("印刷プレビュー") + p("A4で印刷する", "print-now", "primary wide") + '<p class="muted">問題' + (z ? "と別ページの解答" : "のみ") + "を印刷します。</p></div>"), document.body.classList.add("print-preview"), t("paper").innerHTML = L(!1) + (z ? L(!0) : "")) : "print-now" === w && ("file:" === location.protocol ? location.href = "nanpure://print/a4" : window.print());
        }
        catch (i) {
            u("操作できませんでした：" + i.message);
        } }), window.appPause = f, window.NPRecoveryCanRestore = () => !d, window.NPCrossword = { getScreen: () => s, getCurrent:()=>o };
    window.appBack = () => { if (window.NPI18n?.closeIfOpen())
        return; const e = document.getElementById("recovery-dialog"); e && e.open ? e.close() : d || (t("dialog").open ? t("dialog").close() : "print" === s ? g() : "home" !== s ? (f(), h()) : f() && (location.replace("/nanpure/releases/2026.10.24.51/notebook/index.html#rules"))); }, document.addEventListener("visibilitychange", f), h();
}();
