/* Reuse the full notebook's existing play settings in an always reachable dialog. */
(()=>{'use strict';let queued=false;
Object.assign(window.NPTranslations||(window.NPTranslations={}),{"遊び方の設定":{"en":"Play settings"},"色と大きさ":{"en":"Colors and size"},"白":{"en":"White"},"青":{"en":"Blue"},"紫":{"en":"Purple"},"暗い表示":{"en":"Dark"},"クリーム":{"en":"Cream"},"ミント":{"en":"Mint"},"ピンク":{"en":"Pink"},"端末のダークモードに合わせる":{"en":"Follow device dark mode"},"マスの大きさ":{"en":"Cell size"},"数字の大きさ":{"en":"Number size"},"メモの大きさ":{"en":"Note size"},"100%で画面に収まります。拡大した部分はスクロールできます。":{"en":"100% fits the screen. Scroll to move around when enlarged."},"入力・候補メモ":{"en":"Input and notes"},"数字を先に選んで入力":{"en":"Select a number before a cell"},"使い切ったら次の数字を自動選択":{"en":"Move to the next number when complete"},"各数字の残り個数を表示":{"en":"Show remaining counts"},"入力した数字を関連するメモから消す":{"en":"Remove entered numbers from related notes"},"選んだ数字の候補メモを強調":{"en":"Highlight notes matching the selected number"},"矛盾する候補メモを知らせる":{"en":"Mark conflicting notes"},"数字を長押しすると、その数字を続けて入力できます。":{"en":"Hold a number to keep entering that number."},"強調・タイマー・音":{"en":"Highlights, timer and sound"},"行・列・枠を強調表示":{"en":"Highlight row, column and region"},"同じ数字を強調表示":{"en":"Highlight matching numbers"},"プレイ中のタイマーを表示":{"en":"Show the timer"},"完成時の演出":{"en":"Completion animation"},"入力時の効果音":{"en":"Sound on input"},"入力時の振動":{"en":"Vibration on input"},"練習の補助":{"en":"Practice assistance"},"ランキング挑戦では答え・ヒント・自動完成を使いません。練習に切り替えると利用できます。":{"en":"Answers, hints and auto-complete are available in practice only. Switching to practice excludes this attempt from the leaderboard."},"練習に切り替える":{"en":"Switch to practice"},"ミス上限":{"en":"Mistake limit"},"回":{"en":"times"},"制限なし":{"en":"No limit"},"残り1マスを自動完成":{"en":"Complete the final cell automatically"},"解き方図鑑・高度なヒント・統計の共有は「自由に遊ぶ」の設定から利用できます。":{"en":"The strategy guide, advanced hints and statistics sharing are available in Free Play settings."},"日替わりの記録":{"en":"Daily play statistics"},"設定を初期値に戻す":{"en":"Reset settings"},"前回の挑戦を再開しました。離れていた時間も含みます。":{"en":"Resumed your earlier attempt. Time away is included."},"問題を選び、開始の確認をすると計測が始まります":{"en":"Choose a puzzle, then confirm to start the clock."},"設定":{"en":"Settings"},"練習":{"en":"Practice"},"練習クリア！ランキング対象外です。":{"en":"Practice complete! This result is not ranked."},"ヒント":{"en":"Hint"},"やり直す":{"en":"Restart"},"この問題は練習として再開します。ランキングには参加できません。":{"en":"This puzzle resumes in practice mode and cannot be ranked."},"前回の挑戦を再開します。離れていた時間も計測されています。":{"en":"Resume your earlier attempt. The clock has continued while you were away."},"開始するまで盤面は表示されません。ランキング挑戦の時計は、画面を離れても進みます。":{"en":"The board is revealed when you start. The ranked clock continues even when you leave the page."},"記録を見る":{"en":"View result"},"続きから開く":{"en":"Resume"},"挑戦を始める":{"en":"Start ranked attempt"},"ランキングに参加せず練習する":{"en":"Practice without ranking"},"問題から戻りますか？":{"en":"Leave this puzzle?"},"途中経過は保存されます。時計は止まらず、再開しても開始時刻は変わりません。":{"en":"Progress is saved. The clock keeps running, and resuming does not reset it."},"練習の途中経過を保存して戻ります。":{"en":"Save your practice progress and go back."},"プレイを続ける":{"en":"Keep playing"},"保存して戻る":{"en":"Save and go back"},"練習に切り替えますか？":{"en":"Switch to practice?"},"練習をやり直しますか？":{"en":"Restart practice?"},"この日の同じ問題はランキング対象外になります。時計は0から練習用に切り替わります。":{"en":"This day's puzzle will no longer be eligible for ranking. A new practice clock starts at zero."},"入力とメモを消し、練習の時計を0に戻します。":{"en":"Clear entries and notes, and restart the practice clock at zero."},"練習をやり直す":{"en":"Restart practice"},"キャンセル":{"en":"Cancel"},"解き方図鑑を開く":{"en":"Open strategy guide"},"クリア":{"en":"Wins"},"勝率":{"en":"Win rate"},"平均時間":{"en":"Average time"},"ベストタイム":{"en":"Best time"},"連勝":{"en":"Current streak"},"ベスト連勝":{"en":"Best streak"},"ノーミス・ヒントなし":{"en":"Perfect wins"},"この端末でのクリアとミス上限で終了した練習を集計します。":{"en":"Counts completed games and practice games ended by the mistake limit on this device."},"記録を共有":{"en":"Share statistics"},"段階ヒント":{"en":"Step-by-step hint"},"{r}行{c}列に注目してください。":{"en":"Look at row {r}, column {c}."},"行・列・枠と追加ルールを確認します。すでにある数字と矛盾する候補を消して考えましょう。":{"en":"Check the row, column, region and additional rules. Eliminate candidates that conflict with existing numbers."},"このマスの答え":{"en":"Answer for this cell"},"次のヒント":{"en":"Next hint"},"この数字を入れる":{"en":"Enter this number"},"ランキング挑戦はページを離れても計測が続きます。練習に切り替えるとランキング対象外です。日本時間の午前0時に切り替わります。":{"en":"Ranked time continues while you are away. Practice attempts are not ranked. Puzzles change at midnight in Japan."},"種類を選び、質問や困っていることを詳しく書いてください。どの種類でも自由に入力できます。":{"en":"Choose a category and describe your question or problem. You can write freely in every category."},"種類を選び、詳しい内容を1〜1000文字で入力してください。":{"en":"Choose a category and enter 1–1,000 characters of detail."},"この挑戦は練習に切り替わっています。ランキングには送信できません。":{"en":"This attempt was changed to practice and cannot be submitted to the leaderboard."},"ミス上限に達しました。練習をやり直せます。":{"en":"You reached the mistake limit. You can restart practice."}});
const storageKey='nanpure-cell-size-v1';let size=100;try{size=Math.max(100,Math.min(180,Number(localStorage.getItem(storageKey))||100))}catch{}
function t(s){return window.NPI18n?.t(s)||s}
const selectionKey='np-selection-design-v1';
const selectionDesigns=[['guide','行・列ガイド'],['outline','くっきり枠'],['solid','濃い色で選択']];
const validSelection=value=>selectionDesigns.some(([key])=>key===value)?value:'guide';
function savedSelection(){try{return validSelection(localStorage.getItem(selectionKey))}catch{return'guide'}}
let selectionDesign=savedSelection();
function applySelection(value=selectionDesign){
 selectionDesign=validSelection(value);document.documentElement.dataset.npSelectionDesign=selectionDesign;
 const select=document.getElementById('np-selection-design');if(select)for(const option of select.options)option.selected=option.value===selectionDesign;
}
function chooseSelection(value){
 applySelection(value);try{localStorage.setItem(selectionKey,selectionDesign)}catch{}
 window.dispatchEvent(new CustomEvent('np-selection-design-change',{detail:selectionDesign}));
}
window.addEventListener('storage',event=>{if(event.key===selectionKey||event.key===null)applySelection(event.key===null?savedSelection():event.newValue)});
window.addEventListener('np-selection-design-change',event=>applySelection(event.detail));
applySelection();
function apply(){
 const value=String(size/100);
 if(document.documentElement.style.getPropertyValue('--np-cell-scale')!==value){
  document.documentElement.style.setProperty('--np-cell-scale',value);
  window.NPBoardInput?.refresh(document.getElementById('board'));
 }
}
const settingsPages=[
 ['view','盤面の見え方','色・選択マス・数字の大きさ'],
 ['input','入力・候補メモ','入力の順番・メモ・ミス上限'],
 ['sound','音・表示','タイマー・音・演出'],
 ['help','ルール・保存','ルール・記録・問題の操作'],
];
const settingsIcons={view:'M3 3h18v18H3zM3 9h18M9 3v18M15 3v18M3 15h18',input:'m5 15-1 5 5-1L20 8l-4-4L5 15ZM13 7l4 4',sound:'M11 4 5 9H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',help:'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15'};
function decorateSettings(root){
 // Move the original controls, never clone them: saved values and delegated
 // change handlers remain attached to exactly the same input elements.
 for(const label of root.querySelectorAll('label')){
  const input=label.querySelector('input[type="checkbox"]');
  if(input&&!label.classList.contains('np-switch-row')){
   const text=document.createElement('span');text.className='np-setting-copy';
   for(const child of Array.from(label.childNodes))if(child!==input)text.append(child);
   label.append(text,input);label.classList.add('np-switch-row');input.setAttribute('role','switch');
  }
 }
 for(const select of root.querySelectorAll('select')){
  if(select.closest('.np-choice-row'))continue;
  const label=select.closest('label');
  if(label){
   label.classList.add('np-choice-row');
   const copy=document.createElement('span');copy.className='np-setting-copy';
   for(const child of Array.from(label.childNodes))if(child!==select)copy.append(child);
   label.prepend(copy);if(select.id)label.setAttribute('for',select.id);
  }else{
   const previous=select.previousElementSibling;
   if(previous?.tagName==='LABEL'&&previous.getAttribute('for')===select.id){
    const row=document.createElement('div');row.className='np-choice-row';previous.before(row);row.append(previous,select);
   }
  }
 }
}
function settingsCategory(node,previous){
 if(node.nodeType!==1)return previous;
 if(node.matches('.np-selection-design,.np-board-options'))return 'view';
 if(node.matches('.video-hud,#video-flash'))return 'help';
 const control=node.matches('input,select,button')?node:node.querySelector('input,select,button');
 const id=control?.id||node.getAttribute('for')||node.id;
 if(['display-mode','display-sync','digit-size','display-status','highlight-area','highlight-same'].includes(id))return 'view';
 if(['highlight-notes','memo-focus-status','note-conflicts','note-conflict-status','auto-next-number','play-input-mode','mistake-limit','mistake-cap','memo-prune'].includes(id))return 'input';
 if(id==='show-timer'||id==='feedback-status'||control?.hasAttribute('data-site-audio')||control?.hasAttribute('data-feedback'))return 'sound';
 if(node.querySelector('[data-video-option]'))return 'sound';
 return previous;
}
function update(){
 queued=false;
 const app=document.getElementById('app'),board=document.getElementById('board');
 if(!app||!board)return;
 if(!app.querySelector('#np-play-settings')){
  const screen=board.closest('.screen')||app;
  const sections=Array.from(screen.children).filter(node=>node.tagName==='DETAILS');
  const settings=app.querySelector('#display-mode')?.closest('details');
  if(!settings||!sections.includes(settings))return;
  const dialog=document.createElement('dialog');dialog.id='np-play-settings';dialog.className='np-play-settings np-settings-organized';dialog.setAttribute('aria-labelledby','np-play-settings-title');
  const header=document.createElement('header');header.className='np-settings-header';
  const back=document.createElement('button');back.type='button';back.className='np-settings-back';back.textContent='‹';back.setAttribute('aria-label',t('設定一覧に戻る'));back.hidden=true;
  const heading=document.createElement('h2');heading.id='np-play-settings-title';heading.tabIndex=-1;heading.textContent=t('プレイ中の設定');
  const close=document.createElement('button');close.type='button';close.className='np-settings-close';close.textContent=t('閉じる')+' ×';close.onclick=()=>dialog.close();header.append(back,heading,close);dialog.append(header);
  const menu=document.createElement('div');menu.className='np-settings-menu';
  const intro=document.createElement('p');intro.className='np-settings-intro';intro.textContent=t('項目を選んで設定できます。変更はすぐに反映されます。');menu.append(intro);
  const nav=document.createElement('nav');nav.className='np-settings-categories';nav.setAttribute('aria-label',t('プレイ中の設定'));menu.append(nav);dialog.append(menu);
  const panels={},cards={};
  function showPage(id,focus=true){
   const entry=settingsPages.find(page=>page[0]===id);const active=entry?entry[0]:null;
   dialog.dataset.settingsPage=active||'menu';menu.hidden=!!active;back.hidden=!active;
   for(const [key,panel] of Object.entries(panels))panel.hidden=key!==active;
   heading.textContent=t(entry?entry[1]:'プレイ中の設定');dialog.scrollTop=0;
   if(focus)heading.focus({preventScroll:true});
  }
  dialog.npSettingsShow=showPage;
  for(const [id,label,description] of settingsPages){
   const button=document.createElement('button');button.type='button';button.className='np-settings-category';button.setAttribute('aria-controls','np-settings-page-'+id);
   const icon=document.createElement('span');icon.className='np-settings-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'+settingsIcons[id]+'"/></svg>';
   const copy=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');title.textContent=t(label);detail.textContent=t(description);copy.append(title,detail);
   const arrow=document.createElement('span');arrow.className='np-settings-chevron';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');button.append(icon,copy,arrow);button.onclick=()=>showPage(id);nav.append(button);
   const panel=document.createElement('section');panel.id='np-settings-page-'+id;panel.className='np-settings-page';panel.dataset.settingsPanel=id;panel.hidden=true;
   const card=document.createElement('div');card.className='np-settings-card';panel.append(card);cards[id]=card;panels[id]=panel;dialog.append(panel);
  }
  back.onclick=()=>showPage(null);
  const cell=document.createElement('label');cell.className='np-cell-size';cell.textContent=t('マスの大きさ');
  const range=document.createElement('input');range.type='range';range.min='100';range.max='180';range.step='10';range.value=String(size);
  const out=document.createElement('output');out.setAttribute('data-i18n-skip','');out.textContent=size+'%';cell.append(out,range);
  const note=document.createElement('p');note.textContent=t('100%は標準の大きさです。盤面がはみ出すときは「全体を表示」で画面に合わせられます。');
  const wheelNote=document.createElement('p');wheelNote.textContent=t('マウスホイールはスクロール、Ctrlまたは⌘を押しながら回すと拡大・縮小します。');
  const boardOptions=document.createElement('div');boardOptions.className='np-board-options';boardOptions.append(cell,note,wheelNote);
  const design=document.createElement('label');design.className='np-selection-design';design.setAttribute('for','np-selection-design');design.textContent=t('選択マスのデザイン');
  const designSelect=document.createElement('select');designSelect.id='np-selection-design';
  for(const [value,label] of selectionDesigns){const option=document.createElement('option');option.value=value;option.textContent=t(label);option.selected=value===selectionDesign;designSelect.append(option)}
  designSelect.onchange=()=>chooseSelection(designSelect.value);design.append(designSelect);cards.view.append(design,boardOptions);
  // Keep the timer and pause action together; secondary progress stays in settings.
  const hud=screen.querySelector('.video-hud'),flash=screen.querySelector('#video-flash');
  const pause=hud?.querySelector('[data-video="pause"]'),head=screen.querySelector('.play-head');
  if(pause&&head)head.append(pause);
  if(hud)cards.help.append(hud);if(flash)cards.help.append(flash);
  range.oninput=()=>{size=Number(range.value);out.textContent=size+'%';try{localStorage.setItem(storageKey,String(size))}catch{}apply();};
  let category='view';
  for(const child of Array.from(settings.childNodes)){
   if(child.nodeType===1&&child.tagName==='SUMMARY')continue;
   category=settingsCategory(child,category);
   // Completion assistance belongs with input. Remaining animation options
   // keep their original fieldset and status area under sound/display.
   const automatic=child.nodeType===1?child.querySelector('[data-video-option="autoComplete"]')?.closest('label'):null;
   if(automatic)cards.input.append(automatic);
   cards[category].append(child);
  }
  settings.remove();
  for(const section of sections){if(section===settings)continue;(section.querySelector('#memo-prune')?panels.input:panels.help).append(section)}
  const links=document.createElement('div');links.className='np-settings-links';
  for(const [label,action] of [['解き方図鑑','open-guide'],['プレイの記録・基本ルール','open-video']]){
   const button=document.createElement('button');button.type='button';button.dataset.action=action;button.textContent=t(label);button.addEventListener('click',()=>dialog.close());links.append(button);
  }
  panels.help.append(links);screen.append(dialog);decorateSettings(dialog);
  // The original video controls share one save-status element. Keep it beside
  // the option being changed even though completion assistance has its own page.
  dialog.addEventListener('change',event=>{
   if(!event.target.matches('[data-video-option]'))return;
   const status=dialog.querySelector('#video-option-status'),card=event.target.closest('.np-settings-card');
   if(status&&card&&!card.contains(status))card.append(status);
  });
  const button=document.createElement('button');button.type='button';button.id='np-play-settings-button';button.textContent='⚙';button.setAttribute('aria-label',t('プレイ中の設定'));button.title=t('設定');button.onclick=()=>{showPage(null,false);dialog.showModal()};
  (app.querySelector('.play-head')||app.querySelector('.play-dock')).append(button);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{if(button.isConnected)button.focus({preventScroll:true});});
  showPage(null,false);
 }
 window.NPBoardInput?.scan();apply();
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(update);}}
const style=document.createElement('style');style.textContent=`#board{zoom:var(--np-cell-scale,1)}#board-scroll{overflow:auto!important;overscroll-behavior:auto}#board .cell,.number-pad button{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.board-lines .grid-thin,.board-lines .grid-regions{stroke:#000!important}.play-board{border-color:#000!important}.np-play-settings{position:fixed;inset:0;margin:auto;width:min(94vw,620px);max-height:88dvh;overflow:auto;background:#fffdf7;color:#182b23;border:1px solid #aebeaa;border-radius:15px;padding:18px;line-height:1.7;font-size:max(14px,var(--ui-min-font,0px))}.np-play-settings::backdrop{background:#12261f88}.np-play-settings h2{font-size:max(22px,var(--ui-min-font,0px))}.np-play-settings p{font-size:max(14px,var(--ui-min-font,0px))}.np-play-settings>details{border-top:1px solid #d5dfcf;margin-top:14px}.np-play-settings summary{min-height:48px;font-size:max(16px,var(--ui-min-font,0px));font-weight:700;line-height:1.5;padding:12px 0}.np-play-settings .memo-option{display:flex;gap:10px;align-items:center;min-height:44px;margin:12px 0;font-size:inherit}.np-play-settings input[type=checkbox]{width:24px;height:24px;flex:none;accent-color:#245a43}.np-play-settings select{width:100%;min-height:46px;font:inherit}.np-settings-close{display:block;margin-left:auto;min-height:44px;min-width:44px;padding:8px 14px;background:white;border:1px solid #aebeaa;border-radius:8px;font:inherit}.np-cell-size{display:flex;flex-wrap:wrap;gap:8px;font-weight:700;margin-top:12px}.np-cell-size output{margin-left:auto}.np-cell-size input{width:100%;min-height:44px}.np-settings-links{display:grid;gap:8px;margin-top:20px}.np-settings-links button{min-height:44px;padding:10px;background:#edf2e8;border:1px solid #aebeaa;border-radius:8px;font:inherit}#np-play-settings-button{flex:none;width:44px;min-width:44px;height:44px;min-height:44px;margin-left:auto;padding:4px;border:1px solid #b7c6b5;border-radius:10px;background:#fff;color:#285849;font:600 24px/1 system-ui;touch-action:manipulation}
.np-play-settings.np-settings-organized{width:min(96vw,620px);max-height:calc(100dvh - 20px);padding:0 16px 18px;background:#f3f5f2;color:#1d332a;line-height:1.5}
.np-settings-organized .np-settings-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;min-height:66px;margin:0 -2px;padding:8px 2px;background:#f3f5f2}
.np-settings-organized .np-settings-header h2{flex:1;min-width:0;margin:0;font-size:max(20px,var(--ui-min-font,0px));line-height:1.35;outline:none}
.np-settings-organized .np-settings-back{flex:none;min-width:36px;min-height:44px;padding:0;border:0;background:transparent;color:#245a43;font-size:34px;line-height:1}
.np-settings-organized .np-settings-close{flex:none;margin:0;min-height:44px;padding:8px 12px;white-space:nowrap;font-size:max(14px,var(--ui-min-font,0px))}
.np-settings-organized .np-settings-intro{margin:2px 0 16px;font-size:max(14px,var(--ui-min-font,0px));line-height:1.6;color:#596d60}
.np-settings-organized .np-settings-categories{display:grid;gap:10px}
.np-settings-organized .np-settings-category{display:grid;grid-template-columns:36px minmax(0,1fr) 16px;align-items:center;gap:12px;width:100%;min-height:82px;margin:0;padding:14px 12px;border:1px solid #dce5dc;border-radius:13px;background:#fff;color:#1d332a;text-align:left;font:inherit;box-shadow:0 1px 2px #173b2610}
.np-settings-organized .np-settings-category strong{display:block;font-size:max(16px,var(--ui-min-font,0px));line-height:1.4;font-weight:750}
.np-settings-organized .np-settings-category small{display:block;margin-top:4px;color:#65766c;font-size:max(12px,var(--ui-min-font,0px));line-height:1.45}
.np-settings-organized .np-settings-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#edf4ee;color:#2b6651}
.np-settings-organized .np-settings-chevron{font-size:25px;color:#7b8e82}
.np-settings-organized [hidden]{display:none!important}
.np-settings-organized .np-settings-page{padding-top:2px}
.np-settings-organized .np-settings-card,.np-settings-organized .np-settings-page>details,.np-settings-organized .np-settings-page>.np-settings-links{display:block;min-width:0;margin:12px 0;padding:8px 14px;border:1px solid #dce5dc;border-radius:13px;background:#fff}
.np-settings-organized .np-settings-card:empty{display:none}
.np-settings-organized .np-settings-page>details>summary{min-height:48px;padding:12px 0;font-size:max(15px,var(--ui-min-font,0px));cursor:pointer}
.np-settings-organized .np-switch-row{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:58px;margin:0;padding:12px 0;border-bottom:1px solid #eaf0e8;line-height:1.5;font-size:max(15px,var(--ui-min-font,0px));font-weight:500;cursor:pointer}
.np-settings-organized .np-switch-row:last-child{border-bottom:0}
.np-settings-organized .np-switch-row .np-setting-copy{flex:1;min-width:0}
.np-settings-organized .np-switch-row input[type=checkbox]{appearance:none;-webkit-appearance:none;position:relative;flex:0 0 46px;width:46px;height:28px;min-width:46px;min-height:28px;margin:0;padding:0;border:1px solid #97a69b;border-radius:16px;background:#aab5ad;transition:background .12s;cursor:pointer}
.np-settings-organized .np-switch-row input[type=checkbox]::after{content:"";position:absolute;width:22px;height:22px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0002;transition:transform .12s}
.np-settings-organized .np-switch-row input[type=checkbox]:checked{background:#28634b;border-color:#28634b}
.np-settings-organized .np-switch-row input[type=checkbox]:checked::after{transform:translateX(18px)}
.np-settings-organized .np-switch-row input[type=checkbox]:focus-visible{outline:3px solid #bb862f;outline-offset:3px}
.np-settings-organized .np-switch-row input:disabled{opacity:.5;cursor:default}
.np-settings-organized .np-choice-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(116px,48%);align-items:center;gap:12px;margin:0;padding:12px 0;min-height:58px;font-size:max(15px,var(--ui-min-font,0px));font-weight:600;border-bottom:1px solid #eaf0e8}
.np-settings-organized .np-choice-row>label{margin:0;padding:0;min-height:0;font-size:inherit}
.np-settings-organized .np-choice-row select{width:100%;min-width:0;min-height:44px;margin:0;padding:8px 10px;font-size:max(14px,var(--ui-min-font,0px));color:#285943;background:#f6f8f4;border:1px solid #c8d6ca;border-radius:8px}
.np-settings-organized .np-settings-page fieldset{min-width:0;padding:0;margin:12px 0;border:0}
.np-settings-organized .np-settings-page legend{padding:0;font-size:max(14px,var(--ui-min-font,0px));font-weight:700;color:#506c59}
.np-settings-organized .np-settings-page p{margin:6px 0 12px;font-size:max(12px,var(--ui-min-font,0px));line-height:1.6;color:#617167}
.np-settings-organized .np-settings-page [role=status]:empty{display:none}
.np-settings-organized .np-settings-page .np-access-preview{position:static;width:fit-content;max-width:100%;margin:6px auto 14px;padding:12px;border-radius:13px}
.np-settings-organized .np-settings-page .np-sample-grid{width:144px;height:144px;grid-template-rows:repeat(4,minmax(0,1fr))}
.np-settings-organized .np-settings-page .np-access-preview .np-sample-grid b{height:auto;min-height:0;min-width:0;padding:0;line-height:1}
.np-settings-organized .np-settings-page .np-access-preview>small{display:block;margin-top:8px;font-size:max(12px,var(--ui-min-font,0px));line-height:1.5}
.np-settings-organized .np-board-options{padding:10px 0;border-bottom:1px solid #eaf0e8}
.np-settings-organized .np-board-options .np-cell-size{font-size:max(15px,var(--ui-min-font,0px))}
.np-settings-organized .np-settings-links{display:grid;gap:0}
.np-settings-organized .np-settings-links button,.np-settings-organized .np-settings-links a{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:54px;padding:12px 0;border:0;border-radius:0;border-bottom:1px solid #eaf0e8;background:transparent;color:#245a43;font:600 max(15px,var(--ui-min-font,0px))/1.5 system-ui,sans-serif;text-decoration:none;text-align:left}
.np-settings-organized .np-settings-links button::after,.np-settings-organized .np-settings-links a::after{content:"›";font-size:23px;color:#7b8e82}
.np-settings-organized .np-settings-links>:last-child{border-bottom:0}
.np-settings-organized .np-settings-page>.np-access-button{min-height:46px;margin:12px 0;background:#fff}
@media(max-width:360px){.np-settings-organized .np-settings-category{gap:9px;padding:12px 10px}.np-settings-organized .np-settings-card,.np-settings-organized .np-settings-page>details,.np-settings-organized .np-settings-page>.np-settings-links{padding-inline:10px}.np-settings-organized .np-choice-row{grid-template-columns:minmax(0,1fr) minmax(100px,48%);gap:8px}}
@media(max-width:480px){.np-settings-organized .np-selection-design.np-choice-row{grid-template-columns:minmax(0,1fr);gap:8px}}
@media(pointer:coarse){.np-settings-organized .np-board-options>p:last-child{display:none}}
@media(prefers-reduced-motion:reduce){.np-settings-organized .np-switch-row input,.np-settings-organized .np-switch-row input::after{transition:none!important}}
@media(forced-colors:active){.np-settings-organized .np-switch-row input[type=checkbox]{appearance:auto;-webkit-appearance:auto}.np-settings-organized .np-switch-row input[type=checkbox]::after{display:none}}
`;document.head.append(style);
window.NPPlaySettings={sync:update,decorate:decorateSettings,show:page=>document.getElementById('np-play-settings')?.npSettingsShow?.(page),panel:page=>document.querySelector('[data-settings-panel="'+page+'"]')};
function start(){new MutationObserver(()=>{if(!document.getElementById('np-play-settings'))schedule();}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});schedule();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
