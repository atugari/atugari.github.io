/* Stable navigation for moving non-Sudoku tools out of the Sudoku shell.
   Versioned engines and their same-origin save keys remain untouched. */
(()=>{'use strict';
if(window.NPPuzzleNavigation)return;
const routes={'open-shirupure':'shirupure','open-crossword':'crossword','open-tenbin':'tenbin','wado-generator':'wado','magic-generator':'magic-square','open-prototype':'workshop'};
const collectionLabels={"ja":"すぐ遊べるナンプレ集","en":"Ready-to-play Sudoku","zh-Hans":"即玩数独题集","zh-Hant":"即玩數獨題集","ko":"바로 푸는 스도쿠 모음","es":"Colección de sudokus listos para jugar","fr":"Grilles de sudoku prêtes à jouer","de":"Sofort spielbare Sudokus","pt":"Sudokus prontos para jogar","it":"Sudoku pronti da giocare","nl":"Speelklare sudoku’s","sv":"Sudoku att spela direkt","pl":"Sudoku gotowe do gry","cs":"Sudoku připravená ke hraní","ru":"Готовые судоку","id":"Kumpulan Sudoku siap main","vi":"Bộ Sudoku chơi ngay","th":"รวมซูโดกุพร้อมเล่น","hi":"खेलने के लिए तैयार सुडोकू","ar":"مجموعة سودوكو جاهزة للعب"};
const seen=new WeakSet();
function install(w){
 try{
  const d=w.document;
  // A frame can expose its new document before the parser creates its head.
  if(!d.head||!d.documentElement||seen.has(d))return;
  seen.add(d);
  // Engines can finish loading after this adapter. Apply the scope on render,
  // not just at installation; existing library records and queued jobs stay intact.
  function scopeNewGeneration(){
   const clean=k=>k?.kinds?{...k,kinds:k.kinds.filter(kind=>kind!=='cross')}:k;
   if(w.NPBatch&&!w.NPBatch.pareScoped){
   for(const key of ['jobs','plan'])if(w.NPBatch[key]){const original=w.NPBatch[key];w.NPBatch[key]=function(k,...rest){return original.call(this,clean(k),...rest)}}
   w.NPBatch.pareScoped=true;
   }
   if(w.NPWebGeneration?.render&&!w.NPWebGeneration.pareScoped){const original=w.NPWebGeneration.render;w.NPWebGeneration.render=options=>original({...options,settings:clean(options.settings)});w.NPWebGeneration.pareScoped=true}
  }

  const style=d.createElement('style');style.textContent='[data-np-moved]{display:none!important}';d.head.append(style);
  function update(){
   scopeNewGeneration();
   d.querySelectorAll('a[data-pare-entry]').forEach(a=>a.remove());
   d.querySelectorAll('.shiru-entry,[data-action="open-shirupure"],[data-action="open-crossword"],[data-action="open-tenbin"],[data-action="open-prototype"],[data-action="wado-generator"],[data-action="magic-generator"],[data-kind="cross"],[data-future],.homechoices>button[disabled]').forEach(b=>{if(!b.hasAttribute('data-np-moved'))b.setAttribute('data-np-moved','')});
   d.querySelectorAll('[data-web-field="kind"][value="cross"]').forEach(input=>{input.disabled=true;if(input.closest('label'))input.closest('label').setAttribute('data-np-moved','')});
   d.querySelectorAll('.homechoices>a[href*="wado-play.html"]').forEach(b=>{if(!b.hasAttribute('data-np-moved'))b.setAttribute('data-np-moved','')});
   const playMenu=d.querySelector('.homechoices [data-action="open-notebook"]')?.closest('.homechoices');
   let collection=null;
   d.querySelectorAll('a[data-collection-entry]').forEach(link=>{
    if(playMenu?.contains(link)&&!collection)collection=link;else link.remove();
   });
   if(playMenu){
    if(!collection){
     collection=d.createElement('a');
     collection.href='/nanpure/collection/';
     collection.target='_top';
     collection.className='choice';
     collection.dataset.collectionEntry='';
     collection.setAttribute('data-i18n-skip','');
     collection.innerHTML='<span class="text"><strong></strong></span><span class="arrow" aria-hidden="true">›</span>';
     playMenu.append(collection);
    }
    const language=w.NPI18n?.get?.()||d.documentElement.lang||'ja';
    const label=collectionLabels[language]||collectionLabels.en;
    const title=collection.querySelector('strong');
    if(title.textContent!==label)title.textContent=label;
   }
   d.querySelectorAll('iframe').forEach(f=>{if(f.dataset.pareWatching)return;f.dataset.pareWatching='';f.addEventListener('load',()=>visit(f));visit(f)});
  }
  let queued=false;function schedule(){if(queued)return;queued=true;w.requestAnimationFrame(()=>{queued=false;update()})}
  w.addEventListener('np-language-change',schedule);
  new w.MutationObserver(schedule).observe(d.documentElement,{childList:true,subtree:true});
  d.addEventListener('click',e=>{
   const b=e.target.closest?.('button,a');if(!b||b.disabled)return;
   const action=b.dataset.action||b.dataset.proto;
   let route=routes[action];if(b.classList.contains('shiru-entry'))route='shirupure';if(b.dataset.kind==='cross')route='cross';
   if(!route&&b.tagName==='A'&&/\/notebook\/wado-play\.html/.test(b.getAttribute('href')||''))route='wado';
   if(route){e.preventDefault();e.stopImmediatePropagation();void (async()=>{try{
    const saved=await w.appPause?.();if(saved===false)throw Error('save');
    await w.NPStorage?.flush?.();window.location.assign('/puzzles/'+route+'/');
   }catch{let notice=d.getElementById('np-pare-save-error');if(!notice){notice=d.createElement('p');notice.id='np-pare-save-error';notice.setAttribute('role','alert');(d.querySelector('main')||d.body).prepend(notice)}notice.textContent='途中の状態を保存できませんでした。保存を確認してから、もう一度開いてください。'}})()}
  },true);
  update();
 }catch{/* Detached, cross-origin, or unloading frame. */}
}
function visit(f){try{const w=f.contentWindow;if(!w||w.location.href==='about:blank'||!w.location.pathname.includes('/notebook/'))return;install(w)}catch{}}
window.NPPuzzleNavigation={mount:()=>install(window)};install(window);
})();
