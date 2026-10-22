/* Nanpure Cho — shared translation runtime. Source text remains reversible. */
(function (w) {
  'use strict';
  const languageKey = 'nanpure-language-v1';
  const names = {ja:'日本語',en:'English','zh-Hans':'简体中文','zh-Hant':'繁體中文',ko:'한국어',es:'Español',fr:'Français',de:'Deutsch',pt:'Português'};
  const htmlLanguage = value => value === 'zh-Hans' ? 'zh-CN' : value === 'zh-Hant' ? 'zh-TW' : value;
  const normalized = value => String(value).replace(/\s+/g, ' ').trim();
  const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
  const sourceText = new WeakMap(), sourceAttributes = new WeakMap();
  const pending = new Set(), missing = new Set();
  const reactSources = new Map();
  const catalog = w.NPTranslations || {};
  let current = 'ja', observer, scheduled = false, dirty = true;
  let exact = new Map(), reverse = new Map(), patterns = [];
  const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
  const language = value => {
    if (own(names,value)) return value;
    const name = String(value || '').replaceAll('_','-').toLowerCase();
    if (/^zh-(hant|tw|hk|mo)(-|$)/.test(name)) return 'zh-Hant';
    if (/^zh($|-(hans|cn|sg)(-|$))/.test(name)) return 'zh-Hans';
    return own(names,name.split('-')[0]) ? name.split('-')[0] : null;
  };
  try {
    const query = new URLSearchParams(w.location.search).get('lang');
    current = language(query) || language(localStorage.getItem(languageKey)) || language(navigator.language) || 'en';
  } catch (_) {}

  // Older feature modules register English-only labels. Merge those additions
  // without discarding the reviewed translations loaded before the module.
  w.NPTranslations = new Proxy(catalog, {
    set(target,key,value) {
      target[key] = {...value,...target[key]}; dirty = true; return true;
    }
  });
  const escapeRE = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function rebuild() {
    if (!dirty) return;
    exact = new Map(); reverse = new Map(); patterns = [];
    for (const [key,translations] of Object.entries(catalog)) {
      const source = normalized(key);
      exact.set(source,{source:key,translations});
      for(const translated of Object.values(translations)) {
        const value=normalized(translated);
        if(value&&!reverse.has(value))reverse.set(value,key);
      }
      const tokens = [...source.matchAll(/\{([a-zA-Z0-9_]+)\}/g)];
      const numericUnit=/^(?:\{[a-zA-Z0-9_]+\}\s*(?:問|件|回|個|枚|面|秒|分|行|列|枠)|枠\{[a-zA-Z0-9_]+\})$/.test(source);
      if (tokens.length && !/\}\{/.test(source) && (numericUnit||source.replace(/\{[a-zA-Z0-9_]+\}/g,'').length >= 2)) {
        let offset=0, expression='^'; const slots=[];
        for(const token of tokens) {
          expression+=escapeRE(source.slice(offset,token.index)).replace(/ /g,'\\s+')+(numericUnit?'([0-9０-９][0-9０-９.,、・×/：:〜～−—–\\s-]*)':'(.+?)');
          slots.push(token[1]); offset=token.index+token[0].length;
        }
        expression+=escapeRE(source.slice(offset)).replace(/ /g,'\\s+')+'$';
        patterns.push({expression:new RegExp(expression,'u'),slots,translations,weight:source.length-tokens.length*3});
      }
    }
    patterns.sort((a,b)=>b.weight-a.weight);
    dirty=false;
  }
  function canonical(value,element) {
    rebuild();const key=normalized(value);
    const source=element?.closest('#root')?reactSources.get(current)?.get(key):undefined;
    if(source!==undefined)return String(value).replace(key,source);
    if(exact.has(key)||!reverse.has(key))return value;
    return String(value).replace(key,reverse.get(key));
  }
  function reactTranslate(source,locale=current,params={}) {
    const code=language(locale)||current,result=translate(source,code,params);
    if(!reactSources.has(code))reactSources.set(code,new Map());
    const values=reactSources.get(code),original=String(source).replace(/\{([a-zA-Z0-9_]+)\}/g,(all,key)=>own(params,key)?String(params[key]):all);
    values.set(normalized(result),original);
    if(values.size>6000)values.delete(values.keys().next().value);
    return result;
  }
  function substitute(text,params,locale,depth) {
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g,(all,key)=>own(params,key)?translate(String(params[key]),locale,{},depth+1):all);
  }
  function translatedExact(source,locale) {
    const item=exact.get(normalized(source));
    return item?.translations[locale] || null;
  }
  function translate(value,locale=current,params={},depth=0) {
    const raw=String(value ?? '');
    locale=language(locale)||current;
    if(locale==='ja') return raw.replace(/\{([a-zA-Z0-9_]+)\}/g,(all,key)=>own(params,key)?String(params[key]):all);
    rebuild();
    if(catalog[raw]?.[locale])return substitute(catalog[raw][locale],params,locale,depth);
    const key=normalized(raw), found=translatedExact(key,locale);
    if(found) {
      const result=substitute(found,params,locale,depth);
      return raw.slice(0,raw.length-raw.trimStart().length)+result+raw.slice(raw.trimEnd().length);
    }
    if(!japanese.test(key)||depth>5) return raw;
    const coordinateList=key.split('、');
    if(coordinateList.length>1&&coordinateList.every(part=>/^(?:座標)?\d+行\d+列の\d+$/.test(part)))return coordinateList.map(part=>translate(part,locale,{},depth+1)).join(locale.startsWith('zh')?'、':', ');
    for(const pattern of patterns) {
      if(!pattern.translations[locale]) continue;
      const match=pattern.expression.exec(key);
      if(!match) continue;
      const values={...params};let valid=true;
      pattern.slots.forEach((name,index)=>{if(own(values,name)&&String(values[name])!==match[index+1])valid=false;values[name]=match[index+1]});
      if(valid) return substitute(pattern.translations[locale],values,locale,depth);
    }
    // Decorative arrows, bullets and brackets do not change a label's meaning.
    const decorated=key.match(/^([‹›←→↗★☆○●✓✔☑☰♫⚙︎\s]+)(.*?)([×↗›\s]*)$/u);
    if(decorated) {
      const center=translate(decorated[2],locale,params,depth+1);
      if(center!==decorated[2]) return decorated[1].trim()+' '+center+(decorated[3].trim()?' '+decorated[3].trim():'');
    }
    const trailing=key.match(/^(.*?)\s+([×↗›])$/u);
    if(trailing) {const body=translate(trailing[1],locale,params,depth+1);if(body!==trailing[1])return body+' '+trailing[2]}
    // Existing HTML often splits a sentence into complete sentences or labels.
    // Translate only complete known segments, never arbitrary Japanese tokens.
    const sentences=key.match(/[^。！？\n]+[。！？]?/g);
    if(sentences?.length>1) {
      const values=sentences.map(part=>translate(part,locale,params,depth+1));
      if(values.every((part,index)=>part!==sentences[index]||!japanese.test(part)))return values.join(' ');
    }
    for(const separator of [/\s+[·・|｜]\s+/u,/\n+/u]) {
      const parts=raw.split(separator);
      if(parts.length>1) {
        const values=parts.map(part=>translate(part,locale,params,depth+1));
        if(values.some((part,index)=>part!==parts[index]))return values.join(separator.source.includes('n')?'\n':' · ');
      }
    }
    if(missing.size<3000)missing.add(key);
    return raw;
  }

  // These are puzzle answers or text written by a player, not application copy.
  const skip='script,style,textarea,[contenteditable="true"],[translate="no"],[data-i18n-skip],#recovery-person option[value]:not([value=""]),#profile-select option,.cluelist button,.paper-clues p,.clue-head span,[data-action="finder-use"]';
  const attributes=['placeholder','aria-label','aria-description','title','alt','data-tooltip'];
  function textNode(node) {
    const parent=node.parentElement;
    if(!parent||parent.closest(skip))return;
    let entry=sourceText.get(node);
    if(!entry||node.nodeValue!==entry.rendered)entry={source:canonical(node.nodeValue,parent),rendered:node.nodeValue};
    if(parent.tagName==='OPTION'&&!parent.hasAttribute('value'))parent.setAttribute('value',parent.value||parent.textContent);
    const value=translate(entry.source);
    if(node.nodeValue!==value)node.nodeValue=value;
    entry.rendered=value;sourceText.set(node,entry);
  }
  function elementAttributes(element) {
    if(element.closest(skip))return;
    const entries=sourceAttributes.get(element)||{};
    for(const name of attributes) {
      if(!element.hasAttribute(name))continue;
      const value=element.getAttribute(name);
      let entry=entries[name];
      if(!entry||entry.rendered!==value)entry={source:canonical(value,element),rendered:value};
      const result=translate(entry.source);
      if(value!==result)element.setAttribute(name,result);
      entry.rendered=result;entries[name]=entry;
    }
    // Submit/button labels are values; editable input values must stay untouched.
    if(element.matches('input[type="submit"],input[type="button"],input[type="reset"]')) {
      const value=element.value;let entry=entries.value;
      if(!entry||entry.rendered!==value)entry={source:canonical(value,element),rendered:value};
      const result=translate(entry.source);if(value!==result)element.value=result;
      entry.rendered=result;entries.value=entry;
    }
    sourceAttributes.set(element,entries);
  }
  function walk(root) {
    if(root.nodeType===3){textNode(root);return}
    if(root.nodeType!==1&&root.nodeType!==9)return;
    if(root.nodeType===1){if(root.closest(skip))return;elementAttributes(root)}
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;while(node=walker.nextNode())textNode(node);
    root.querySelectorAll?.('[placeholder],[aria-label],[aria-description],[title],[alt],[data-tooltip],input[type="submit"],input[type="button"],input[type="reset"]').forEach(elementAttributes);
  }
  function watch() {
    observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
  }
  function apply() {
    if(!document.body)return;
    observer?.disconnect();rebuild();
    document.documentElement.lang=htmlLanguage(current);
    document.documentElement.dataset.locale=current;
    const languageButton=document.getElementById('np-language-open');
    if(languageButton){languageButton.textContent='🌐 '+translate('言語');languageButton.setAttribute('translate','no')}
    walk(document.body);
    const title=document.querySelector('title');
    if(title){let entry=sourceText.get(title);if(!entry||entry.rendered!==title.textContent)entry={source:title.textContent};title.textContent=translate(entry.source);entry.rendered=title.textContent;sourceText.set(title,entry)}
    const description=document.querySelector('meta[name="description"]');
    if(description){let entry=sourceText.get(description);if(!entry||entry.rendered!==description.content)entry={source:description.content};description.content=translate(entry.source);entry.rendered=description.content;sourceText.set(description,entry)}
    watch();
  }
  function changed(records) {
    for(const record of records) {
      if(record.type==='childList')for(const node of record.addedNodes)pending.add(node);
      else pending.add(record.target);
    }
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;observer?.disconnect();
      for(const node of pending)if(node.isConnected)walk(node);
      pending.clear();watch();
    });
  }
  function set(value) {
    const next=language(value);if(!next)throw new Error('Unknown language');
    w.NPFurigana?.beforeLanguageChange();current=next;missing.clear();
    try{localStorage.setItem(languageKey,next)}catch(_){}
    if(w.NPStorage?.meta){w.NPStorage.meta.setItem(languageKey,next);w.NPStorage.flush().catch(()=>{})}
    apply();
    w.dispatchEvent(new CustomEvent('np-language-change',{detail:{locale:next}}));
    for(const frame of document.querySelectorAll('iframe'))try{if(frame.contentWindow?.NPI18n&&frame.contentWindow.NPI18n.get()!==next)frame.contentWindow.NPI18n.set(next)}catch(_){}
  }
  function show() {
    let dialog=document.getElementById('np-language-dialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='np-language-dialog';document.body.appendChild(dialog)}
    dialog.replaceChildren();
    const heading=document.createElement('h2');heading.textContent=translate('言語を選ぶ');dialog.appendChild(heading);
    const label=document.createElement('label');label.htmlFor='np-language-select';label.textContent=translate('言語');dialog.appendChild(label);
    const select=document.createElement('select');select.id='np-language-select';select.setAttribute('translate','no');
    for(const [code,name]of Object.entries(names)){const option=document.createElement('option');option.value=code;option.textContent=name;option.lang=htmlLanguage(code);select.appendChild(option)}
    select.value=current;select.onchange=()=>{set(select.value);show()};dialog.appendChild(select);
    for(const source of ['この設定は端末に保存されます。','クロスワードの単語・ヒントは日本語です。']){const p=document.createElement('p');p.textContent=translate(source);dialog.appendChild(p)}
    const close=document.createElement('button');close.type='button';close.textContent=translate('閉じる');close.onclick=()=>dialog.close();dialog.appendChild(close);
    if(!dialog.open)dialog.showModal();
  }
  function addBar() {
    if(document.getElementById('np-language-bar')||document.body.dataset.i18nDisable==='true'||document.getElementById('root'))return;
    const nav=document.createElement('nav');nav.id='np-language-bar';nav.setAttribute('aria-label',translate('言語'));
    const button=document.createElement('button');button.type='button';button.id='np-language-open';button.textContent='🌐 '+translate('言語');button.onclick=show;nav.appendChild(button);document.body.prepend(nav);
  }
  function start() {
    const style=document.createElement('style');
    style.textContent='#np-language-bar{box-sizing:border-box;max-width:1040px;margin:0 auto;padding:8px 14px;display:flex;justify-content:flex-end}#np-language-bar button{width:auto;min-height:44px;padding:8px 14px;border:1px solid #cbd8ce;border-radius:12px;background:#fff;color:#285849;font:600 15px/1.4 system-ui;cursor:pointer}#np-language-dialog{box-sizing:border-box;max-width:520px;width:calc(100% - 24px);max-height:88dvh;overflow:auto;border:1px solid #bdd0c3;border-radius:20px;padding:24px;background:#fffef9;color:#243c34;font:17px/1.6 system-ui}#np-language-dialog select,#np-language-dialog button{width:100%;min-height:48px;padding:10px;font:inherit;box-sizing:border-box}#np-language-dialog::backdrop{background:#0006}html:not([data-locale="ja"]) .choice .text,html:not([data-locale="ja"]) button{overflow-wrap:anywhere;min-width:0}html:not([data-locale="ja"]) .choice strong{font-size:clamp(18px,4.8vw,24px);line-height:1.35}html:not([data-locale="ja"]) .top{flex-wrap:wrap}html:not([data-locale="ja"]) .top .back{white-space:normal}@media print{#np-language-bar,#np-language-dialog{display:none!important}}';
    document.head.appendChild(style);addBar();observer=new MutationObserver(changed);apply();
  }
  w.NPI18n={t:translate,react:reactTranslate,set,get:()=>current,names,apply,show,htmlLanguage,missing:()=>[...missing],closeIfOpen:()=>{const dialog=document.getElementById('np-language-dialog');if(!dialog?.open)return false;dialog.close();return true}};
  // Alerts and canvas labels do not pass through a DOM text node.
  for(const method of ['alert','confirm','prompt']) {
    const original=w[method]?.bind(w);
    if(original)w[method]=(message,...args)=>original(translate(message),...args);
  }
  if(w.CanvasRenderingContext2D)for(const method of ['fillText','strokeText','measureText']) {
    const original=w.CanvasRenderingContext2D.prototype[method];
    w.CanvasRenderingContext2D.prototype[method]=function(text,...args){return original.call(this,translate(text),...args)};
  }
  w.addEventListener('beforeprint',apply);
  w.addEventListener('storage',event=>{if(event.key===languageKey&&language(event.newValue)&&current!==language(event.newValue))set(event.newValue)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);
