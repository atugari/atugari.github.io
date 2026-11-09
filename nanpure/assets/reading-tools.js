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
  const ruby=document.createElement('button');ruby.type='button';ruby.dataset.npFurigana='';ruby.setAttribute('translate','no');ruby.textContent='ふりがな OFF';
  const panel=document.createElement('div');panel.className='np-reading-panel';panel.append(label);ruby.className='np-reading-ruby';ruby.textContent='ふ';ruby.setAttribute('aria-label','ふりがな');ruby.title='ふりがな ON/OFF';
  const opener=document.createElement('button');opener.type='button';opener.className='np-reading-open';opener.textContent='🌐';opener.setAttribute('aria-label',NPI18n.t('言語'));opener.setAttribute('aria-expanded','false');
  const closePanel=()=>{controls.dataset.open='false';opener.setAttribute('aria-expanded','false')};
  opener.onclick=()=>{const open=controls.dataset.open!=='true';controls.dataset.open=String(open);opener.setAttribute('aria-expanded',String(open));if(open)select.focus()};
  controls.append(opener,ruby,panel);document.addEventListener('pointerdown',e=>{if(!controls.contains(e.target))closePanel()},true);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&controls.dataset.open==='true'){closePanel();opener.focus()}});
  
  const host=document.querySelector('body>header nav,body>header,#library>header');if(host)host.append(controls);else document.body.prepend(controls);
  const homeHost=host||document.body,entryFrame=document.getElementById('game');function place(){if(entryFrame){const child=entryFrame.contentDocument;if(!child?.body)return;const target=child.querySelector('.play-header .header-tools,body>header nav,body>header,#player:not([hidden])>nav');if(!target)return;controls.classList.add('np-reading-compact');ruby.onclick=()=>NPFurigana.setEnabled(!NPFurigana.getEnabled());if(!child.documentElement.dataset.npReadingEvents){child.documentElement.dataset.npReadingEvents='true';child.addEventListener('pointerdown',e=>{if(!controls.contains(e.target))closePanel()},true);child.addEventListener('keydown',e=>{if(e.key==='Escape'&&controls.dataset.open==='true'){closePanel();opener.focus()}},true)}if(controls.ownerDocument!==child)child.adoptNode(controls);target.append(controls);if(!child.getElementById('np-reading-controls-style')){const childStyle=style.cloneNode(true);childStyle.id='np-reading-controls-style';child.head.append(childStyle)}return}const target=document.querySelector('#player:not([hidden])>nav')||homeHost;if(controls.parentElement!==target)target.append(controls)}new MutationObserver(place).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});entryFrame?.addEventListener('load',place);window.addEventListener('resize',place);queueMicrotask(place);
  const style=document.createElement('style');style.textContent='.np-reading-controls{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0}.np-reading-panel{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.np-reading-open{display:none}.np-reading-language{display:flex;align-items:center;gap:4px}.np-reading-language select{font:inherit;max-width:148px;min-width:0;min-height:40px;border:1px solid #bdcbbb;border-radius:8px;background:#fffefa;color:inherit;padding:5px}.np-reading-compact{display:flex;align-items:center;gap:4px;margin-inline-start:6px;position:relative;flex:none}.np-reading-compact .np-reading-open,.np-reading-compact .np-reading-ruby{display:inline-flex;align-items:center;justify-content:center;min-width:34px;width:34px;min-height:34px;padding:3px;border:1px solid #bdcbbb;border-radius:7px;background:#fffefa;color:#285849;font:700 13px system-ui,sans-serif}.np-reading-compact .np-reading-panel{display:none}.np-reading-compact[data-open=true] .np-reading-panel{display:flex;position:absolute;inset-block-start:calc(100% + 5px);inset-inline-end:0;z-index:50;width:min(260px,calc(100vw - 24px));padding:10px;background:#fffefa;border:1px solid #bdcbbb;border-radius:10px;box-shadow:0 6px 24px #20362f33}.np-reading-compact .np-reading-language select{min-height:36px}#library>header,#player>nav{flex-wrap:wrap;gap:8px}#library>header .np-reading-controls{margin-inline-start:auto}@media(max-width:680px){#player>nav .np-reading-panel{display:none}#player>nav .np-reading-open{display:block;width:38px;min-height:38px;padding:5px;flex:none}#player>nav .np-reading-controls{flex:none}#player>nav .np-reading-controls[data-open=true] .np-reading-panel{display:flex;position:absolute;inset-block-start:calc(100% + 8px);inset-inline-end:0;z-index:50;width:min(300px,calc(100vw - 24px));padding:12px;background:#fffefa;border:1px solid #bdcbbb;border-radius:12px;box-shadow:0 6px 24px #20362f33}}@media print{.np-reading-controls{display:none!important}}';document.head.append(style);
  const frame=document.getElementById('game');
  async function sync(){try{const child=frame?.contentWindow;if(!child?.NPI18n)return;await child.NPI18n.ready;if(child.NPI18n.get()!==NPI18n.get())await child.NPI18n.set(NPI18n.get());child.NPFurigana?.setEnabled(NPFurigana.getEnabled(),false)}catch{}}
  frame?.addEventListener('load',sync);
  window.addEventListener('np-language-change',()=>{select.value=NPI18n.get();select.setAttribute('aria-label',NPI18n.t('言語'));opener.setAttribute('aria-label',NPI18n.t('言語'));sync()});
  window.addEventListener('nanpure-furigana-change',event=>{const on=!!event.detail?.enabled;ruby.setAttribute('aria-pressed',String(on));ruby.setAttribute('aria-label','ふりがな '+(on?'ON':'OFF'));ruby.title='ふりがな '+(on?'ON':'OFF');sync()});ruby.setAttribute('aria-pressed',String(NPFurigana.getEnabled()));
  NPI18n.apply();NPFurigana.apply();sync();
  return window.NPReadingTools={version:current,sync};
 })();
 // A blocked optional dictionary must leave the puzzle and retry controls usable.
 window.NPReadingReady.catch(()=>{const notice=document.createElement('button');notice.type='button';notice.className='np-reading-retry';notice.textContent='🌐 言語・ふりがなを再読み込み / Retry';notice.onclick=()=>location.reload();(document.querySelector('body>header,#library>header')||document.body).append(notice)});
})();
