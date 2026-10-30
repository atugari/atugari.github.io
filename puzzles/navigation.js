/* Stable navigation for moving non-Sudoku tools out of the Sudoku shell.
   Versioned engines and their same-origin save keys remain untouched. */
(()=>{'use strict';
if(window.NPPuzzleNavigation)return;
const routes={'open-shirupure':'shirupure','open-crossword':'crossword','open-tenbin':'tenbin','wado-generator':'wado','magic-generator':'magic-square','open-prototype':'workshop'};
const copy={"ja":["ほかのパズルはパレあそびへ","シルプレ・和同開珎・クロスワードなど"],"en":["More puzzles on Pareasobi","Shirupure, kanji puzzles and crosswords"],"zh-Hans":["更多谜题，请前往 Pareasobi","符号分区、汉字填空、纵横字谜等"],"zh-Hant":["更多謎題，請前往 Pareasobi","符號分區、漢字填空、縱橫字謎等"],"ko":["더 많은 퍼즐은 Pareasobi에서","시루푸레, 한자 퍼즐, 크로스워드 등"],"es":["Más puzles en Pareasobi","Shirupure, puzles de kanji y crucigramas"],"fr":["Plus de jeux sur Pareasobi","Shirupure, énigmes de kanji et mots croisés"],"de":["Weitere Rätsel auf Pareasobi","Shirupure, Kanji-Rätsel und Kreuzworträtsel"],"pt":["Mais desafios em Pareasobi","Shirupure, desafios de kanji e palavras cruzadas"],"it":["Altri puzzle su Pareasobi","Shirupure, enigmi di kanji e cruciverba"],"nl":["Meer puzzels op Pareasobi","Shirupure, kanjipuzzels en kruiswoordraadsels"],"sv":["Fler pussel på Pareasobi","Shirupure, kanjipussel och korsord"],"pl":["Więcej łamigłówek w Pareasobi","Shirupure, łamigłówki kanji i krzyżówki"],"cs":["Další hlavolamy na Pareasobi","Shirupure, hlavolamy s kandži a křížovky"],"ru":["Больше головоломок на Pareasobi","Shirupure, головоломки с кандзи и кроссворды"],"id":["Teka-teki lainnya di Pareasobi","Shirupure, teka-teki kanji dan teka-teki silang"],"vi":["Thêm câu đố trên Pareasobi","Shirupure, câu đố kanji và ô chữ"],"th":["ปริศนาเพิ่มเติมที่ Pareasobi","Shirupure ปริศนาคันจิ และปริศนาอักษรไขว้"],"hi":["Pareasobi पर और पहेलियाँ","Shirupure, कांजी पहेलियाँ और वर्ग पहेलियाँ"],"ar":["المزيد من الألغاز على Pareasobi","Shirupure وألغاز الكانجي والكلمات المتقاطعة"]};
const seen=new WeakSet();
function install(w){
 try{
  if(seen.has(w.document))return;seen.add(w.document);
  const d=w.document;
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

  const style=d.createElement('style');style.textContent='[data-np-moved]{display:none!important}.np-pare-entry{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;min-height:48px;border:1px solid #bdcbbb;border-radius:14px;background:var(--paper,#fffefa);color:var(--ink,#285849);text-decoration:none;font:inherit}.np-pare-entry small{display:block;font-size:12px;margin-top:3px}.np-pare-entry:focus-visible{outline:3px solid #cf941d}';d.head.append(style);
  function update(){
   scopeNewGeneration();
   d.querySelectorAll('a[data-pare-entry]').forEach(a=>{if(!a.closest('.designed-home,.homechoices'))a.remove()});
   d.querySelectorAll('.shiru-entry,[data-action="open-shirupure"],[data-action="open-crossword"],[data-action="open-tenbin"],[data-action="open-prototype"],[data-action="wado-generator"],[data-action="magic-generator"],[data-kind="cross"],[data-future],.homechoices>button[disabled]').forEach(b=>{if(!b.hasAttribute('data-np-moved'))b.setAttribute('data-np-moved','')});
   d.querySelectorAll('[data-web-field="kind"][value="cross"]').forEach(input=>{input.disabled=true;if(input.closest('label'))input.closest('label').setAttribute('data-np-moved','')});
   d.querySelectorAll('.homechoices>a[href*="wado-play.html"]').forEach(b=>{if(!b.hasAttribute('data-np-moved'))b.setAttribute('data-np-moved','')});
   for(const host of d.querySelectorAll('.designed-home,.homechoices')){
    let a=host.querySelector('[data-pare-entry]');
    if(!a){a=d.createElement('a');a.href='/puzzles/';a.className='np-pare-entry';a.dataset.pareEntry='';a.setAttribute('data-i18n-skip','');
     a.innerHTML='<span><strong></strong><small></small></span><span aria-hidden="true">›</span>';
     const old=host.querySelector('.shiru-entry');if(old)old.after(a);else host.append(a);
    }
    const language=w.NPI18n?.get?.()||d.documentElement.lang||'ja',text=copy[language]||copy.en;
    for(const [selector,value]of [['strong',text[0]],['small',text[1]]])if(a.querySelector(selector).textContent!==value)a.querySelector(selector).textContent=value;
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
