/* Language and Japanese reading controls for stand-alone puzzle entries. */
(()=>{'use strict';
 if(window.NPReadingReady)return;
 document.body.dataset.i18nDisable='true';
 const script=document.currentScript,version=script?.dataset.version;
 const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Reading tools unavailable'));document.head.append(s)});
 window.NPReadingReady=(async()=>{
  const current=version||await fetch('/nanpure/version.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('version');return r.json()}).then(r=>r.version);
  if(!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(current))throw Error('version');
  const base='/nanpure/releases/'+current+'/';
  if(!window.NPI18n){await load(base+'notebook/i18n-data.js');await load(base+'notebook/i18n.js')}
  if(!window.NPFurigana)await load(base+'furigana.js');
  await window.NPI18n.ready;
  const controls=document.createElement('div');controls.className='np-reading-controls';
  const label=document.createElement('label');label.className='np-reading-language';label.append(document.createTextNode('🌐 '));
  const select=document.createElement('select');select.setAttribute('translate','no');select.setAttribute('aria-label','言語');
  for(const [code,name]of Object.entries(NPI18n.names)){const o=document.createElement('option');o.value=code;o.lang=NPI18n.htmlLanguage(code);o.textContent=name;select.append(o)}
  select.value=NPI18n.get();select.setAttribute('aria-label',NPI18n.t('言語'));select.onchange=async()=>{select.disabled=true;try{await NPI18n.set(select.value)}finally{select.disabled=false;select.value=NPI18n.get()}};label.append(select);
  const ruby=document.createElement('button');ruby.type='button';ruby.dataset.npFurigana='';ruby.setAttribute('translate','no');ruby.textContent='ふりがな OFF';controls.append(label,ruby);
  const host=document.querySelector('body>header nav,body>header,#library>header');if(host)host.append(controls);else document.body.prepend(controls);
  const homeHost=host||document.body;function place(){const target=document.querySelector('#player:not([hidden])>nav')||homeHost;if(controls.parentElement!==target)target.append(controls)}new MutationObserver(place).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});place();
  const style=document.createElement('style');style.textContent='.np-reading-controls{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0}.np-reading-language{display:flex;align-items:center;gap:4px}.np-reading-language select{font:inherit;max-width:148px;min-width:0;min-height:40px;border:1px solid #bdcbbb;border-radius:8px;background:#fffefa;color:inherit;padding:5px}#library>header,#player>nav{flex-wrap:wrap;gap:8px}#library>header .np-reading-controls{margin-inline-start:auto}@media print{.np-reading-controls{display:none!important}}';document.head.append(style);
  const frame=document.getElementById('game');
  async function sync(){try{const child=frame?.contentWindow;if(!child?.NPI18n)return;await child.NPI18n.ready;if(child.NPI18n.get()!==NPI18n.get())await child.NPI18n.set(NPI18n.get());child.NPFurigana?.setEnabled(NPFurigana.getEnabled(),false)}catch{}}
  frame?.addEventListener('load',sync);
  window.addEventListener('np-language-change',()=>{select.value=NPI18n.get();select.setAttribute('aria-label',NPI18n.t('言語'));sync()});
  window.addEventListener('nanpure-furigana-change',sync);
  NPI18n.apply();NPFurigana.apply();sync();
  return window.NPReadingTools={version:current,sync};
 })();
 // A blocked optional dictionary must leave the puzzle and retry controls usable.
 window.NPReadingReady.catch(()=>{const notice=document.createElement('button');notice.type='button';notice.className='np-reading-retry';notice.textContent='🌐 言語・ふりがなを再読み込み / Retry';notice.onclick=()=>location.reload();(document.querySelector('body>header,#library>header')||document.body).append(notice)});
})();
