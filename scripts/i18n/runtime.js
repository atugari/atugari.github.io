/* Nanpure Cho — shared translation runtime. Source text remains reversible. */
(function (w) {
  'use strict';
  const languageKey = 'nanpure-language-v1';
  const names = {ja:'日本語',en:'English','zh-Hans':'简体中文','zh-Hant':'繁體中文',ko:'한국어',es:'Español',fr:'Français',de:'Deutsch',pt:'Português'};
  const htmlLanguage = value => value === 'zh-Hans' ? 'zh-CN' : value === 'zh-Hant' ? 'zh-TW' : value;
  const normalized = value => String(value).replace(/\s+/g, ' ').trim();
  // Literal puzzle values, counts and identifiers are data. In particular, the
  // decorative logo translation 数 → 9 must never reverse-map a real digit.
  const numericLiteral = value => /^[+−-]?[0-9０-９]+(?:[.,．，][0-9０-９]+)*(?:\s*[%％])?$/u.test(normalized(value));
  const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
  const sourceText = new WeakMap(), sourceAttributes = new WeakMap();
  const pending = new Set(), missing = new Set();
  const reactSources = new Map();
  const catalog = w.NPTranslations || {};
  const assets = w.NPTranslationAssets;
  const loaded = new Set(assets ? ['ja'] : Object.keys(names)), loading = new Map();
  let current = 'ja', observer, scheduled = false, dirty = true;
  let requestNumber = 0, initialComplete = false, loadingFailed = false;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
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
  function load(value) {
    const next=language(value);if(!next)return Promise.reject(new Error('Unknown language'));
    if(loaded.has(next))return Promise.resolve();
    if(loading.has(next))return loading.get(next);
    const request=assets.load(next).then(pack=>{
      // A reviewed pack takes priority over late English-only registrations.
      for(const[key,text]of Object.entries(pack))catalog[key]={...catalog[key],[next]:text};
      loaded.add(next);dirty=true;loading.delete(next);
    },error=>{loading.delete(next);throw error});
    loading.set(next,request);return request;
  }
  function loadingMessage(source) {
    return assets?.messages?.[source]?.[current]||source;
  }
  function showLoading() {
    document.documentElement.setAttribute('data-i18n-loading','');
    if(!document.body)return;
    let panel=document.getElementById('np-i18n-load');
    if(!panel){panel=document.createElement('section');panel.id='np-i18n-load';panel.setAttribute('translate','no');panel.setAttribute('role','status');document.body.appendChild(panel)}
    panel.replaceChildren();
    const message=document.createElement('p');message.textContent=loadingMessage(loadingFailed?'表示を読み込めませんでした。通信を確認して、もう一度お試しください。':'読み込み中…');panel.appendChild(message);
    if(loadingFailed){const retry=document.createElement('button');retry.type='button';retry.textContent=loadingMessage('もう一度読み込む');retry.onclick=()=>{loadingFailed=false;showLoading();set(current)};panel.appendChild(retry)}
  }
  function finishLoading() {
    if(!loaded.has(current))return;
    apply();document.documentElement.removeAttribute('data-i18n-loading');document.getElementById('np-i18n-load')?.remove();
    if(!initialComplete){initialComplete=true;resolveReady()}
  }
  const escapeRE = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function rebuild() {
    if (!dirty) return;
    exact = new Map(); reverse = new Map(); patterns = [];
    for (const [key,translations] of Object.entries(catalog)) {
      const source = normalized(key);
      exact.set(source,{source:key,translations});
      for(const translated of Object.values(translations)) {
        const value=normalized(translated);
        if(value&&!numericLiteral(value)&&!reverse.has(value))reverse.set(value,key);
      }
      const tokens = [...source.matchAll(/\{([a-zA-Z0-9_]+)\}/g)];
      const numericUnit=/^(?:\{[a-zA-Z0-9_]+\}\s*(?:問|件|回|個|枚|面|秒|分|行|列|枠|位)|枠\{[a-zA-Z0-9_]+\})$/.test(source);
      const numericCoordinates=/^(?:座標)?\{[a-zA-Z0-9_]+\}行\s*\{[a-zA-Z0-9_]+\}列(?:の\{[a-zA-Z0-9_]+\})?$/.test(source);
      if (tokens.length && !/\}\{/.test(source) && (numericUnit||source.replace(/\{[a-zA-Z0-9_]+\}/g,'').length >= 2)) {
        let offset=0, expression='^'; const slots=[];
        for(const token of tokens) {
          expression+=escapeRE(source.slice(offset,token.index)).replace(/ /g,'\\s+')+(numericCoordinates?'([0-9０-９]+)':numericUnit?'([0-9０-９][0-9０-９.,、・×/：:〜～−—–\\s-]*)':'(.+?)');
          slots.push(token[1]); offset=token.index+token[0].length;
        }
        expression+=escapeRE(source.slice(offset)).replace(/ /g,'\\s+')+'$';
        patterns.push({expression:new RegExp(expression,'u'),slots,translations,weight:source.replace(/\{[a-zA-Z0-9_]+\}/g,'').length});
      }
    }
    patterns.sort((a,b)=>b.weight-a.weight);
    dirty=false;
  }
  function canonical(value,element) {
    if(numericLiteral(value))return value;
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
    // Generated labels may add a space between a number and its Japanese unit.
    // Resolve the compact form first so an exact singular entry stays singular.
    const spacedCount=key.match(/^([0-9０-９]+)\s+(問|件|回|個|枚|面|秒|分|行|列|枠|位|ページ|マス)$/u);
    if(spacedCount)return translate(spacedCount[1]+spacedCount[2],locale,params,depth+1);
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
    // Numbered choices and legacy qualifiers are assembled by several screens.
    // Keep the number and translate only a known label or a known qualifier.
    const numbered=key.match(/^([0-9０-９]+)\s*[：:]\s*(.+)$/u);
    if(numbered){const label=translate(numbered[2],locale,params,depth+1);if(label!==numbered[2])return numbered[1]+(locale.startsWith('zh')?'：':locale==='fr'?' : ':': ')+label}
    const qualified=key.match(/^(.+?)([（(][^（）()]+[）)])$/u);
    if(qualified){const qualifier=translatedExact(qualified[2],locale);if(qualifier)return translate(qualified[1],locale,params,depth+1)+(locale.startsWith('zh')?'':' ')+qualifier}
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
    if(loaded.has(locale)&&missing.size<3000)missing.add(key);
    return raw;
  }

  // These are puzzle answers or text written by a player, not application copy.
  const protectedContent='script,style,[translate="no"],[data-i18n-skip],#recovery-person option[value]:not([value=""]),#profile-select option,.cluelist button,.paper-clues p,.clue-head span,[data-action="finder-use"]';
  const skip=protectedContent+',textarea,[contenteditable="true"]';
  const attributes=['placeholder','aria-label','aria-description','title','alt','data-tooltip'];
  // A small reviewed set of sentences spans emphasis nodes. Translate the whole
  // sentence, moving those same nodes into the target language's word order.
  // Inputs, links, arbitrary markup and React-owned content are never rewritten.
  const inlineMessages=w.NPInlineMessages||[],inlineEntries=new WeakMap(),inlineOwned=new WeakSet();
  const inlineSelector=[...new Set(inlineMessages.map(item=>item.selector))].join(',');
  function captureInline(source,template) {
    let offset=0,expression='^';const keys=[];
    for(const token of template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)){
      expression+=escapeRE(template.slice(offset,token.index)).replace(/ /g,'\\s+')+'(.+?)';
      keys.push(token[1]);offset=token.index+token[0].length;
    }
    expression+=escapeRE(template.slice(offset)).replace(/ /g,'\\s+')+'$';
    const match=new RegExp(expression,'u').exec(normalized(source));if(!match)return null;
    const values={};for(let i=0;i<keys.length;i++){if(own(values,keys[i])&&values[keys[i]]!==match[i+1])return null;values[keys[i]]=match[i+1]}
    return values;
  }
  function inlineMessage(element) {
    if(!inlineSelector||element.closest(skip+',#root'))return false;
    let entry=inlineEntries.get(element);
    if(entry){
      const nodes=[...element.childNodes];
      if(nodes.length!==entry.renderedNodes.length||nodes.some((node,i)=>node!==entry.renderedNodes[i])||entry.staticNodes.some(([node,value])=>node.nodeValue!==value)||entry.slots.some(slot=>slot.node.children.length)){
        for(const node of entry.owned)inlineOwned.delete(node);inlineEntries.delete(element);entry=null;
      }
    }
    if(!entry){
      const nodes=[...element.childNodes],children=[...element.children];
      if(!children.length||children.some(child=>!['B','STRONG','EM','SPAN','BR'].includes(child.tagName)||child.children.length)||nodes.some(node=>![1,3].includes(node.nodeType)))return false;
      const template=normalized(nodes.map(node=>node.nodeType===3?node.nodeValue:'{'+children.indexOf(node)+'}').join(''));
      const message=inlineMessages.find(item=>normalized(item.template)===template&&element.matches(item.selector)&&item.children.length===children.length&&item.children.every((child,i)=>child.tag.toUpperCase()===children[i].tagName&&captureInline(children[i].textContent,child.sourceTextTemplate)));
      if(!message)return false;
      entry={message,originalNodes:nodes,originalText:nodes.filter(node=>node.nodeType===3).map(node=>[node,node.nodeValue]),slots:children.map((node,i)=>({node,source:node.textContent,rendered:node.textContent,rule:message.children[i]})),owned:[],renderedNodes:nodes,staticNodes:[],locale:null};
      inlineEntries.set(element,entry);
    }
    let changed=entry.locale!==current;
    for(const slot of entry.slots)if(slot.node.textContent!==slot.rendered){
      const source=canonical(slot.node.textContent,slot.node);
      if(!captureInline(source,slot.rule.sourceTextTemplate))return false;
      slot.source=source;changed=true;
    }
    if(!changed)return true;
    const sentence=current==='ja'?entry.message.template:catalog[entry.message.template]?.[current];
    if(!sentence)return false;
    const tokens=[...sentence.matchAll(/\{([0-9]+)\}/g)],indices=tokens.map(token=>Number(token[1]));
    if(indices.length!==entry.slots.length||new Set(indices).size!==indices.length||indices.some(i=>!entry.slots[i]))return false;
    for(const node of entry.owned)inlineOwned.delete(node);entry.owned=[];
    for(const slot of entry.slots){
      const context=slot.rule.contextTextTranslations?.[current],params=captureInline(slot.source,slot.rule.sourceTextTemplate);
      const value=current==='ja'?slot.source:context?substitute(context,params||{},current,0):translate(slot.source);
      if(slot.node.textContent!==value)slot.node.textContent=value;
      slot.rendered=value;entry.owned.push(...slot.node.childNodes);
    }
    let nodes;
    if(current==='ja'){
      for(const[node,value]of entry.originalText)node.nodeValue=value;
      nodes=entry.originalNodes;
    }else{
      nodes=[];let offset=0;
      for(const token of tokens){if(token.index>offset)nodes.push(document.createTextNode(sentence.slice(offset,token.index)));nodes.push(entry.slots[Number(token[1])].node);offset=token.index+token[0].length}
      if(offset<sentence.length)nodes.push(document.createTextNode(sentence.slice(offset)));
    }
    element.replaceChildren(...nodes);
    entry.renderedNodes=[...element.childNodes];entry.staticNodes=entry.renderedNodes.filter(node=>node.nodeType===3).map(node=>[node,node.nodeValue]);
    entry.owned.push(...entry.staticNodes.map(([node])=>node));for(const node of entry.owned)inlineOwned.add(node);
    entry.locale=current;return true;
  }
  function textNode(node) {
    const parent=node.parentElement;
    if(!parent||parent.closest(skip)||inlineOwned.has(node))return;
    let entry=sourceText.get(node);
    if(!entry||node.nodeValue!==entry.rendered)entry={source:canonical(node.nodeValue,parent),rendered:node.nodeValue};
    if(parent.tagName==='OPTION'&&!parent.hasAttribute('value'))parent.setAttribute('value',parent.value||parent.textContent);
    const value=translate(entry.source);
    if(node.nodeValue!==value)node.nodeValue=value;
    entry.rendered=value;sourceText.set(node,entry);
  }
  function elementAttributes(element) {
    if(element.closest(protectedContent))return;
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
    // Child-only mutation records must still update their whole mapped sentence.
    if(inlineSelector){const parent=root.nodeType===3?root.parentElement:root.nodeType===1?root:null;const sentence=parent?.closest(inlineSelector);if(sentence)root=sentence}
    if(root.nodeType===3){textNode(root);return}
    if(root.nodeType!==1&&root.nodeType!==9)return;
    if(root.nodeType===1){if(root.closest(protectedContent))return;elementAttributes(root);if(root.matches('textarea,[contenteditable="true"]'))return}
    if(inlineSelector){if(root.nodeType===1&&root.matches(inlineSelector))inlineMessage(root);root.querySelectorAll?.(inlineSelector).forEach(inlineMessage)}
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;while(node=walker.nextNode())textNode(node);
    root.querySelectorAll?.('[placeholder],[aria-label],[aria-description],[title],[alt],[data-tooltip],input[type="submit"],input[type="button"],input[type="reset"]').forEach(elementAttributes);
  }
  function watch() {
    if(document.body)observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
  }
  function failed(error) {
    // Keep failures inspectable even when a parent catches a frame's exception.
    document.documentElement.dataset.i18nError=error?.stack||String(error);
  }
  function apply() {
    if(!document.body||!loaded.has(current))return;
    observer?.disconnect();
    try{
      rebuild();document.documentElement.lang=htmlLanguage(current);
      document.documentElement.dataset.locale=current;
      const languageButton=document.getElementById('np-language-open');
      if(languageButton){languageButton.textContent='🌐 '+translate('言語');languageButton.setAttribute('translate','no')}
      walk(document.body);
      const title=document.querySelector('title');
      if(title){let entry=sourceText.get(title);if(!entry||entry.rendered!==title.textContent)entry={source:title.textContent};title.textContent=translate(entry.source);entry.rendered=title.textContent;sourceText.set(title,entry)}
      const description=document.querySelector('meta[name="description"]');
      if(description){let entry=sourceText.get(description);if(!entry||entry.rendered!==description.content)entry={source:description.content};description.content=translate(entry.source);entry.rendered=description.content;sourceText.set(description,entry)}
    }catch(error){failed(error);throw error}finally{watch()}
  }
  function queue(records) {
    for(const record of records) {
      if(record.type==='childList')for(const node of record.addedNodes)pending.add(node);
      else pending.add(record.target);
    }
  }
  function changed(records) {
    queue(records);
    if(scheduled||!pending.size)return;scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      // Another render callback can write attributes before this frame runs.
      // Preserve those queued records before disconnect() would discard them.
      queue(observer?.takeRecords()||[]);observer?.disconnect();
      const nodes=[...pending];pending.clear();
      try{for(const node of nodes)if(node.isConnected)walk(node)}
      catch(error){failed(error);throw error}finally{watch()}
    });
  }
  function commit(next) {
    w.NPFurigana?.beforeLanguageChange();current=next;missing.clear();
    try{localStorage.setItem(languageKey,next)}catch(_){}
    if(w.NPStorage?.meta){w.NPStorage.meta.setItem(languageKey,next);w.NPStorage.flush().catch(()=>{})}
    finishLoading();
    w.dispatchEvent(new CustomEvent('np-language-change',{detail:{locale:next}}));
    for(const frame of document.querySelectorAll('iframe'))try{if(frame.contentWindow?.NPI18n&&frame.contentWindow.NPI18n.get()!==next)frame.contentWindow.NPI18n.set(next)}catch(_){}
    return true;
  }
  function set(value) {
    const next=language(value);if(!next)throw new Error('Unknown language');
    const request=++requestNumber;
    if(loaded.has(next))return commit(next);
    return load(next).then(()=>request===requestNumber?commit(next):false,error=>{
      if(request!==requestNumber)return false;
      if(!initialComplete){loadingFailed=true;showLoading()}
      else w.alert?.(translate('表示を読み込めませんでした。通信を確認して、もう一度お試しください。'));
      return false;
    });
  }
  function show() {
    let dialog=document.getElementById('np-language-dialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='np-language-dialog';document.body.appendChild(dialog)}
    dialog.replaceChildren();
    const heading=document.createElement('h2');heading.textContent=translate('言語を選ぶ');dialog.appendChild(heading);
    const label=document.createElement('label');label.htmlFor='np-language-select';label.textContent=translate('言語');dialog.appendChild(label);
    const select=document.createElement('select');select.id='np-language-select';select.setAttribute('translate','no');
    for(const [code,name]of Object.entries(names)){const option=document.createElement('option');option.value=code;option.textContent=name;option.lang=htmlLanguage(code);select.appendChild(option)}
    select.value=current;select.onchange=()=>{select.disabled=true;Promise.resolve(set(select.value)).then(()=>{if(dialog.open)show()})};dialog.appendChild(select);
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
    document.head.appendChild(style);addBar();observer=new MutationObserver(changed);if(loaded.has(current))finishLoading();else showLoading();
  }
  w.NPI18n={t:translate,react:reactTranslate,set,load,ready,get:()=>current,names,apply,show,htmlLanguage,missing:()=>[...missing],closeIfOpen:()=>{const dialog=document.getElementById('np-language-dialog');if(!dialog?.open)return false;dialog.close();return true}};
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
  if(!loaded.has(current)){
    // Installed while parsing the head, before untranslated content can paint.
    const style=document.createElement('style');style.textContent='html[data-i18n-loading] body>*:not(#np-i18n-load){visibility:hidden!important}#np-i18n-load{box-sizing:border-box;max-width:36rem;margin:10vh auto;padding:24px;font:17px/1.6 system-ui;color:#243c34;background:#fffef9;border:1px solid #cbd8ce;border-radius:16px;text-align:center}#np-i18n-load button{min-height:44px;padding:10px 18px;font:inherit;cursor:pointer}';document.head.appendChild(style);
    document.documentElement.setAttribute('data-i18n-loading','');
    const request=++requestNumber;
    load(current).then(()=>{if(request===requestNumber)finishLoading()},()=>{if(request===requestNumber){loadingFailed=true;showLoading()}});
  }else finishLoading();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);
