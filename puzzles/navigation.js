/* Stable navigation for moving non-Sudoku tools out of the Sudoku shell.
   Versioned engines and their same-origin save keys remain untouched. */
(()=>{'use strict';
if(window.NPPuzzleNavigation)return;
const routes={'open-shirupure':'shirupure','open-crossword':'crossword','open-tenbin':'tenbin','wado-generator':'wado','magic-generator':'magic-square','open-prototype':'workshop'};
const seen=new WeakSet();
function install(w){
 try{
  if(seen.has(w.document))return;seen.add(w.document);
  const d=w.document;
  // Filter website generation requests while leaving stored puzzles and queues intact.
  if(w.NPBatch&&!w.NPBatch.pareScoped){
   const clean=k=>k?.kinds?{...k,kinds:k.kinds.filter(kind=>kind!=='cross')}:k;
   for(const key of ['jobs','plan'])if(w.NPBatch[key]){const original=w.NPBatch[key];w.NPBatch[key]=function(k,...rest){return original.call(this,clean(k),...rest)}}
   if(w.NPWebGeneration?.render){const original=w.NPWebGeneration.render;w.NPWebGeneration.render=options=>original({...options,settings:clean(options.settings)})}
   w.NPBatch.pareScoped=true;
  }

  const style=d.createElement('style');style.textContent='[data-np-moved]{display:none!important}.np-pare-entry{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;min-height:48px;border:1px solid #bdcbbb;border-radius:14px;background:var(--paper,#fffefa);color:var(--ink,#285849);text-decoration:none;font:inherit}.np-pare-entry small{display:block;font-size:12px;margin-top:3px}.np-pare-entry:focus-visible{outline:3px solid #cf941d}';d.head.append(style);
  function update(){
   d.querySelectorAll('.shiru-entry,[data-action="open-shirupure"],[data-action="open-crossword"],[data-action="open-tenbin"],[data-action="open-prototype"],[data-action="wado-generator"],[data-action="magic-generator"],[data-kind="cross"],[data-future],.homechoices>button[disabled]').forEach(b=>{if(!b.hasAttribute('data-np-moved'))b.setAttribute('data-np-moved','')});
   d.querySelectorAll('[data-web-field="kind"][value="cross"]').forEach(input=>{input.disabled=true;if(input.closest('label'))input.closest('label').setAttribute('data-np-moved','')});
   d.querySelectorAll('.homechoices>a[href*="wado-play.html"]').forEach(b=>{if(!b.hasAttribute('data-np-moved'))b.setAttribute('data-np-moved','')});
   for(const host of d.querySelectorAll('.designed-home,.homechoices')){
    if(host.querySelector('[data-pare-entry]'))continue;
    const a=d.createElement('a');a.href='/puzzles/';a.className='np-pare-entry';a.dataset.pareEntry='';a.setAttribute('data-i18n-skip','');
    a.innerHTML='<span><strong>ほかのパズルはパレあそびへ</strong><small>シルプレ・和同開珎・クロスワードなど</small></span><span aria-hidden="true">›</span>';
    const old=host.querySelector('.shiru-entry');if(old)old.after(a);else host.append(a);
   }
   d.querySelectorAll('iframe').forEach(f=>{if(f.dataset.pareWatching)return;f.dataset.pareWatching='';f.addEventListener('load',()=>visit(f));visit(f)});
  }
  let queued=false;function schedule(){if(queued)return;queued=true;w.requestAnimationFrame(()=>{queued=false;update()})}
  new w.MutationObserver(schedule).observe(d.documentElement,{childList:true,subtree:true});
  d.addEventListener('click',e=>{
   const b=e.target.closest?.('button,a');if(!b||b.disabled)return;
   const action=b.dataset.action||b.dataset.proto;
   let route=routes[action];if(b.classList.contains('shiru-entry'))route='shirupure';if(b.dataset.kind==='cross')route='cross';
   if(!route&&b.tagName==='A'&&/\/notebook\/wado-play\.html/.test(b.getAttribute('href')||''))route='wado';
   if(route){e.preventDefault();e.stopImmediatePropagation();void Promise.resolve(w.appPause?.()).then(()=>window.location.assign('/puzzles/'+route+'/'))}
  },true);
  update();
 }catch{/* Detached, cross-origin, or unloading frame. */}
}
function visit(f){try{const w=f.contentWindow;if(!w||w.location.href==='about:blank'||!w.location.pathname.includes('/notebook/'))return;install(w)}catch{}}
window.NPPuzzleNavigation={mount:()=>install(window)};install(window);
})();
