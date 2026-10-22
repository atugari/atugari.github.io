/* Reuse the full notebook's existing play settings in an always reachable dialog. */
(()=>{'use strict';let queued=false;
Object.assign(window.NPTranslations||(window.NPTranslations={}),{"遊び方の設定":{"en":"Play settings"},"色と大きさ":{"en":"Colors and size"},"白":{"en":"White"},"青":{"en":"Blue"},"紫":{"en":"Purple"},"暗い表示":{"en":"Dark"},"クリーム":{"en":"Cream"},"ミント":{"en":"Mint"},"ピンク":{"en":"Pink"},"端末のダークモードに合わせる":{"en":"Follow device dark mode"},"マスの大きさ":{"en":"Cell size"},"数字の大きさ":{"en":"Number size"},"メモの大きさ":{"en":"Note size"},"100%で画面に収まります。拡大した部分はスクロールできます。":{"en":"100% fits the screen. Scroll to move around when enlarged."},"入力・候補メモ":{"en":"Input and notes"},"数字を先に選んで入力":{"en":"Select a number before a cell"},"使い切ったら次の数字を自動選択":{"en":"Move to the next number when complete"},"各数字の残り個数を表示":{"en":"Show remaining counts"},"入力した数字を関連するメモから消す":{"en":"Remove entered numbers from related notes"},"選んだ数字の候補メモを強調":{"en":"Highlight notes matching the selected number"},"矛盾する候補メモを知らせる":{"en":"Mark conflicting notes"},"数字を長押しすると、その数字を続けて入力できます。":{"en":"Hold a number to keep entering that number."},"強調・タイマー・音":{"en":"Highlights, timer and sound"},"行・列・枠を強調表示":{"en":"Highlight row, column and region"},"同じ数字を強調表示":{"en":"Highlight matching numbers"},"プレイ中のタイマーを表示":{"en":"Show the timer"},"完成時の演出":{"en":"Completion animation"},"入力時の効果音":{"en":"Sound on input"},"入力時の振動":{"en":"Vibration on input"},"練習の補助":{"en":"Practice assistance"},"ランキング挑戦では答え・ヒント・自動完成を使いません。練習に切り替えると利用できます。":{"en":"Answers, hints and auto-complete are available in practice only. Switching to practice excludes this attempt from the leaderboard."},"練習に切り替える":{"en":"Switch to practice"},"ミス上限":{"en":"Mistake limit"},"回":{"en":"times"},"制限なし":{"en":"No limit"},"残り1マスを自動完成":{"en":"Complete the final cell automatically"},"解き方図鑑・高度なヒント・統計の共有は「自由に遊ぶ」の設定から利用できます。":{"en":"The strategy guide, advanced hints and statistics sharing are available in Free Play settings."},"日替わりの記録":{"en":"Daily play statistics"},"設定を初期値に戻す":{"en":"Reset settings"},"前回の挑戦を再開しました。離れていた時間も含みます。":{"en":"Resumed your earlier attempt. Time away is included."},"問題を選び、開始の確認をすると計測が始まります":{"en":"Choose a puzzle, then confirm to start the clock."},"設定":{"en":"Settings"},"練習":{"en":"Practice"},"練習クリア！ランキング対象外です。":{"en":"Practice complete! This result is not ranked."},"ヒント":{"en":"Hint"},"やり直す":{"en":"Restart"},"この問題は練習として再開します。ランキングには参加できません。":{"en":"This puzzle resumes in practice mode and cannot be ranked."},"前回の挑戦を再開します。離れていた時間も計測されています。":{"en":"Resume your earlier attempt. The clock has continued while you were away."},"開始するまで盤面は表示されません。ランキング挑戦の時計は、画面を離れても進みます。":{"en":"The board is revealed when you start. The ranked clock continues even when you leave the page."},"記録を見る":{"en":"View result"},"続きから開く":{"en":"Resume"},"挑戦を始める":{"en":"Start ranked attempt"},"ランキングに参加せず練習する":{"en":"Practice without ranking"},"問題から戻りますか？":{"en":"Leave this puzzle?"},"途中経過は保存されます。時計は止まらず、再開しても開始時刻は変わりません。":{"en":"Progress is saved. The clock keeps running, and resuming does not reset it."},"練習の途中経過を保存して戻ります。":{"en":"Save your practice progress and go back."},"プレイを続ける":{"en":"Keep playing"},"保存して戻る":{"en":"Save and go back"},"練習に切り替えますか？":{"en":"Switch to practice?"},"練習をやり直しますか？":{"en":"Restart practice?"},"この日の同じ問題はランキング対象外になります。時計は0から練習用に切り替わります。":{"en":"This day's puzzle will no longer be eligible for ranking. A new practice clock starts at zero."},"入力とメモを消し、練習の時計を0に戻します。":{"en":"Clear entries and notes, and restart the practice clock at zero."},"練習をやり直す":{"en":"Restart practice"},"キャンセル":{"en":"Cancel"},"解き方図鑑を開く":{"en":"Open strategy guide"},"クリア":{"en":"Wins"},"勝率":{"en":"Win rate"},"平均時間":{"en":"Average time"},"ベストタイム":{"en":"Best time"},"連勝":{"en":"Current streak"},"ベスト連勝":{"en":"Best streak"},"ノーミス・ヒントなし":{"en":"Perfect wins"},"この端末でのクリアとミス上限で終了した練習を集計します。":{"en":"Counts completed games and practice games ended by the mistake limit on this device."},"記録を共有":{"en":"Share statistics"},"段階ヒント":{"en":"Step-by-step hint"},"{r}行{c}列に注目してください。":{"en":"Look at row {r}, column {c}."},"行・列・枠と追加ルールを確認します。すでにある数字と矛盾する候補を消して考えましょう。":{"en":"Check the row, column, region and additional rules. Eliminate candidates that conflict with existing numbers."},"このマスの答え":{"en":"Answer for this cell"},"次のヒント":{"en":"Next hint"},"この数字を入れる":{"en":"Enter this number"},"ランキング挑戦はページを離れても計測が続きます。練習に切り替えるとランキング対象外です。日本時間の午前0時に切り替わります。":{"en":"Ranked time continues while you are away. Practice attempts are not ranked. Puzzles change at midnight in Japan."},"種類を選び、質問や困っていることを詳しく書いてください。どの種類でも自由に入力できます。":{"en":"Choose a category and describe your question or problem. You can write freely in every category."},"種類を選び、詳しい内容を1〜1000文字で入力してください。":{"en":"Choose a category and enter 1–1,000 characters of detail."},"この挑戦は練習に切り替わっています。ランキングには送信できません。":{"en":"This attempt was changed to practice and cannot be submitted to the leaderboard."},"ミス上限に達しました。練習をやり直せます。":{"en":"You reached the mistake limit. You can restart practice."}});
const storageKey='nanpure-cell-size-v1';let size=100;try{size=Math.max(100,Math.min(180,Number(localStorage.getItem(storageKey))||100))}catch{}
function t(s){return s}
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
function update(){
 queued=false;
 const app=document.getElementById('app'),board=document.getElementById('board');
 if(!app||!board)return;
 if(!app.querySelector('#np-play-settings')){
  const screen=board.closest('.screen')||app;
  const sections=Array.from(screen.children).filter(node=>node.tagName==='DETAILS');
  const settings=app.querySelector('#display-mode')?.closest('details');
  if(!settings||!sections.includes(settings))return;
  const dialog=document.createElement('dialog');dialog.id='np-play-settings';dialog.className='np-play-settings';dialog.setAttribute('aria-labelledby','np-play-settings-title');
  const close=document.createElement('button');close.type='button';close.className='np-settings-close';close.textContent=t('閉じる')+' ×';close.onclick=()=>dialog.close();dialog.append(close);
  const heading=document.createElement('h2');heading.id='np-play-settings-title';heading.textContent=t('設定・ルール');dialog.append(heading);
  const cell=document.createElement('label');cell.className='np-cell-size';cell.textContent=t('マスの大きさ');
  const range=document.createElement('input');range.type='range';range.min='100';range.max='180';range.step='10';range.value=String(size);
  const out=document.createElement('output');out.setAttribute('data-i18n-skip','');out.textContent=size+'%';cell.append(out,range);
  const note=document.createElement('p');note.textContent=t('100%は標準の大きさです。盤面がはみ出すときは「全体を表示」で画面に合わせられます。');
  const wheelNote=document.createElement('p');wheelNote.textContent=t('マウスホイールはスクロール、Ctrlまたは⌘を押しながら回すと拡大・縮小します。');
  const boardOptions=document.createElement('div');boardOptions.className='np-board-options';boardOptions.append(cell,note,wheelNote);
  const design=document.createElement('label');design.className='np-selection-design';design.textContent=t('選択マスのデザイン');
  const designSelect=document.createElement('select');designSelect.id='np-selection-design';
  for(const [value,label] of selectionDesigns){const option=document.createElement('option');option.value=value;option.textContent=t(label);option.selected=value===selectionDesign;designSelect.append(option)}
  designSelect.onchange=()=>chooseSelection(designSelect.value);design.append(designSelect);
  const summary=settings.querySelector('summary');
  if(summary)summary.after(design,boardOptions);else settings.prepend(design,boardOptions);
  // Keep the timer and pause action together; secondary progress stays in settings.
  const hud=screen.querySelector('.video-hud'),flash=screen.querySelector('#video-flash');
  const pause=hud?.querySelector('[data-video="pause"]'),head=screen.querySelector('.play-head');
  if(pause&&head)head.append(pause);
  if(hud)boardOptions.after(hud);
  if(flash)(hud||boardOptions).after(flash);
  range.oninput=()=>{size=Number(range.value);out.textContent=size+'%';try{localStorage.setItem(storageKey,String(size))}catch{}apply();};
  // Move every original section intact, including rules, checking, restart and print.
  // Keeping the actual elements preserves delegated handlers and stored settings.
  settings.open=true;
  for(const section of sections)dialog.append(section);
  const links=document.createElement('div');links.className='np-settings-links';
  for(const [label,action] of [['解き方図鑑','open-guide'],['プレイの記録・基本ルール','open-video']]){
   const button=document.createElement('button');button.type='button';button.dataset.action=action;button.textContent=t(label);button.addEventListener('click',()=>dialog.close());links.append(button);
  }
  dialog.append(links);screen.append(dialog);
  const button=document.createElement('button');button.type='button';button.id='np-play-settings-button';button.textContent='⚙';button.setAttribute('aria-label',t('遊び方の設定'));button.title=t('設定');button.onclick=()=>dialog.showModal();
  (app.querySelector('.play-head')||app.querySelector('.play-dock')).append(button);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{if(button.isConnected)button.focus({preventScroll:true});});
 }
 window.NPBoardInput?.scan();
 apply();
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(update);}}
const style=document.createElement('style');style.textContent=`#board{zoom:var(--np-cell-scale,1)}#board-scroll{overflow:auto!important;overscroll-behavior:auto}#board .cell,.number-pad button{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.board-lines .grid-thin,.board-lines .grid-regions{stroke:#000!important}.play-board{border-color:#000!important}.np-play-settings{position:fixed;inset:0;margin:auto;width:min(94vw,620px);max-height:88dvh;overflow:auto;background:#fffdf7;color:#182b23;border:1px solid #aebeaa;border-radius:15px;padding:18px;line-height:1.7;font-size:max(14px,var(--ui-min-font,0px))}.np-play-settings::backdrop{background:#12261f88}.np-play-settings h2{font-size:max(22px,var(--ui-min-font,0px))}.np-play-settings p{font-size:max(14px,var(--ui-min-font,0px))}.np-play-settings>details{border-top:1px solid #d5dfcf;margin-top:14px}.np-play-settings summary{min-height:48px;font-size:max(16px,var(--ui-min-font,0px));font-weight:700;line-height:1.5;padding:12px 0}.np-play-settings .memo-option{display:flex;gap:10px;align-items:center;min-height:44px;margin:12px 0;font-size:inherit}.np-play-settings input[type=checkbox]{width:24px;height:24px;flex:none;accent-color:#245a43}.np-play-settings select{width:100%;min-height:46px;font:inherit}.np-settings-close{display:block;margin-left:auto;min-height:44px;min-width:44px;padding:8px 14px;background:white;border:1px solid #aebeaa;border-radius:8px;font:inherit}.np-cell-size{display:flex;flex-wrap:wrap;gap:8px;font-weight:700;margin-top:12px}.np-cell-size output{margin-left:auto}.np-cell-size input{width:100%;min-height:44px}.np-settings-links{display:grid;gap:8px;margin-top:20px}.np-settings-links button{min-height:44px;padding:10px;background:#edf2e8;border:1px solid #aebeaa;border-radius:8px;font:inherit}#np-play-settings-button{flex:none;width:44px;min-width:44px;height:44px;min-height:44px;margin-left:auto;padding:4px;border:1px solid #b7c6b5;border-radius:10px;background:#fff;color:#285849;font:600 24px/1 system-ui;touch-action:manipulation}`;document.head.append(style);
window.NPPlaySettings={sync:update};
function start(){new MutationObserver(()=>{if(!document.getElementById('np-play-settings'))schedule();}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});schedule();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
