// Shared translations, reversible DOM updates, user content and shipped HTML.
// node scripts/check-nanpure-i18n.cjs [path-to-linkedom]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[2]||'linkedom');
const repo=path.resolve(__dirname,'..'),catalog=require('./i18n/catalog.cjs'),runtime=fs.readFileSync(path.join(__dirname,'i18n/runtime.js'),'utf8');
const inlineMessages=JSON.parse(fs.readFileSync(path.join(__dirname,'i18n/inline-messages.json'),'utf8')),inlineFixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'i18n/inline-fixtures.json'),'utf8'));
const intentional=JSON.parse(fs.readFileSync(path.join(__dirname,'i18n/intentional-japanese.json'),'utf8'));
const checkedText=(key,value)=>{for(const part of intentional[key]?.retained_japanese||[])value=value.replaceAll(part,'');return value};
const names=require('./i18n/languages.json'),langs=Object.keys(names).filter(code=>code!=='ja'),japanese=/[\u3041-\u3096\u30a1-\u30fa]/,cjk=/[\u3400-\u9fff]/,checks=[],failures=[];
function check(name,fn){try{fn();checks.push(name)}catch(e){failures.push({name,error:e.message})}}
function boot(html='<html><head><title>ナンプレ帳</title></head><body><div id="root"></div></body></html>',locale='en',options={}){
 const {window:w}=parseHTML(html),values=new Map(),calls=[],frames=[];
 Object.assign(w,{window:w,self:w,NodeFilter:{SHOW_TEXT:4},URLSearchParams,URL,location:{search:'?lang='+locale},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))},requestAnimationFrame:cb=>{frames.push(cb);return frames.length},cancelAnimationFrame(){},alert:(...v)=>calls.push(['alert',...v]),confirm:(...v)=>{calls.push(['confirm',...v]);return true},prompt:(...v)=>{calls.push(['prompt',...v]);return '入力内容'},NPTranslations:structuredClone(catalog),NPInlineMessages:structuredClone(inlineMessages)});
 w.NPTranslationAssets=options.assets;
 if(options.assets)w.NPTranslations={};
 w.CanvasRenderingContext2D=function(){};for(const n of ['fillText','strokeText','measureText'])w.CanvasRenderingContext2D.prototype[n]=function(...v){calls.push([n,...v]);return {width:42}};
 Object.defineProperty(w.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.selected)?.value||this.options[0]?.value||''},set(v){for(const o of this.options)o.selected=o.value===v}});
 w.HTMLElement.prototype.showModal=function(){this.open=true};w.HTMLElement.prototype.close=function(){this.open=false};
 vm.runInContext(runtime,vm.createContext(w));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {w,values,calls,frames};
}
function visibleJapanese(doc){const skip='script,style,textarea,[translate="no"],[contenteditable="true"],[data-i18n-skip],noscript',bad=[],walker=doc.createTreeWalker(doc.body,4);let node;while(node=walker.nextNode())if(node.parentElement&&!node.parentElement.closest(skip)&&japanese.test(node.nodeValue))bad.push(node.nodeValue.trim());for(const el of doc.querySelectorAll('[aria-label],[title],[placeholder],[alt]'))if(!el.closest('script,style,[translate="no"],[data-i18n-skip]'))for(const n of ['aria-label','title','placeholder','alt']){const s=el.getAttribute(n)||'';if(japanese.test(s))bad.push(s)}return [...new Set(bad)]}
const params=s=>[...new Set([...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m=>m[1]))].sort();
for(const locale of langs){
 const {w,values,calls}=boot(undefined,locale),t=w.NPI18n.t;
 if(!['en','zh-Hans','zh-Hant','ko','es','fr','de','pt'].includes(locale))check(`${locale}: puzzle symbols and draft token removal`,()=>{
  const symbols=s=>[...s.matchAll(/[●○▲△□✕]/g)].map(m=>m[0]).sort();
  for(const[key,values]of Object.entries(catalog)){assert(!/\{keep\d+\}/.test(values[locale]),key);if(/[●○▲△□✕]/.test(values.en))assert.deepEqual(symbols(values[locale]),symbols(values.en),key)}
 });
 const fixture=html=>{const p=w.document.createElement('div');p.innerHTML=html;w.document.body.appendChild(p);w.NPI18n.apply();return p};
 check(`${locale}: complete catalogue and placeholders`,()=>{const bad=[];for(const[k,all]of Object.entries(catalog)){const v=all[locale];if(!v)bad.push('missing '+k);else if(JSON.stringify(params(k))!==JSON.stringify(params(v)))bad.push('parameters '+k)}assert.deepEqual(bad,[])});
 check(`${locale}: no Japanese text in translations`,()=>{assert.deepEqual(Object.entries(catalog).filter(([k,v])=>!['简','繁'].includes(k)&&(japanese.test(checkedText(k,v[locale]||''))||(!locale.startsWith('zh')&&cjk.test(checkedText(k,v[locale]||''))))).map(([k,v])=>({key:k,value:v[locale]})),[])});
 check(`${locale}: row and column computed numbers`,()=>{for(const[r,c]of [[1,2],[12,7],[16,11]]){const v=t(`${r}行${c}列`);assert.notEqual(v,`${r}行${c}列`);assert.deepEqual((v.match(/\d+/g)||[]).sort(),[String(r),String(c)].sort())}});
 check(`${locale}: named hint parameters`,()=>{const v=t('{r}行{c}列に注目してください。',locale,{r:12,c:7});assert(!japanese.test(v));assert(v.includes('12')&&v.includes('7'));assert(!/\{[rc]\}/.test(v))});
 check(`${locale}: locale metadata and persistence`,()=>{assert.equal(w.NPI18n.get(),locale);assert.equal(w.document.documentElement.dir,locale==='ar'?'rtl':'ltr');w.NPI18n.set(locale);assert.equal(values.get('nanpure-language-v1'),locale);assert.equal(w.document.documentElement.lang,locale==='zh-Hans'?'zh-CN':locale==='zh-Hant'?'zh-TW':locale)});
 check(`${locale}: reversible text and accessibility labels`,()=>{const p=fixture('<p title="閉じる" aria-label="設定">保存</p>').firstChild;assert.equal(p.textContent,t('保存'));assert.equal(p.title,t('閉じる'));assert.equal(p.getAttribute('aria-label'),t('設定'));w.NPI18n.set('ja');assert.equal(p.textContent,'保存');assert.equal(p.title,'閉じる');w.NPI18n.set(locale);assert.equal(p.textContent,t('保存'))});
 check(`${locale}: changes to existing text nodes`,()=>{const p=fixture('<p>保存</p>').firstChild;p.firstChild.nodeValue='閉じる';w.NPI18n.apply();assert.equal(p.textContent,t('閉じる'));w.NPI18n.set('ja');assert.equal(p.textContent,'閉じる');w.NPI18n.set(locale)});
 check(`${locale}: user input and crossword answers`,()=>{const p=fixture('<input value="保存" placeholder="ニックネーム"><textarea>保存</textarea><span translate="no">保存</span><div contenteditable="true">保存</div><div class="cluelist"><button>数字の問題</button></div>');assert.equal(p.querySelector('input').value,'保存');assert.equal(p.querySelector('textarea').value,'保存');assert.equal(p.querySelector('span').textContent,'保存');assert.equal(p.querySelector('[contenteditable]').textContent,'保存');assert.equal(p.querySelector('.cluelist').textContent,'数字の問題');assert.equal(p.querySelector('input').placeholder,t('ニックネーム'));p.remove()});
 check(`${locale}: literal digits and identifiers survive every language`,()=>{
  w.NPI18n.react('数',locale); // This logo translation is "9"; it must not claim puzzle digits.
  const p=w.document.createElement('section');p.innerHTML='<span data-literal="9">9</span><button data-literal="9" aria-label="9" data-number="9">9</button><span data-literal="９">９</span><span data-literal="009">009</span><span data-literal="9.9">9.9</span><span data-literal="100%">100%</span><span data-literal="NP-0009">NP-0009</span><input value="9"><textarea>9</textarea><svg><text data-literal="9">9</text><text data-literal="19">19</text></svg>';w.document.getElementById('root').appendChild(p);
  const verify=()=>{for(const el of p.querySelectorAll('[data-literal]'))assert.equal(el.textContent,el.getAttribute('data-literal'));assert.equal(p.querySelector('button').getAttribute('aria-label'),'9');assert.equal(p.querySelector('button').dataset.number,'9');assert.equal(p.querySelector('input').value,'9');assert.equal(p.querySelector('textarea').value,'9')};
  for(const lang of ['ja',...langs]){w.NPI18n.set(lang);verify();w.dispatchEvent(new w.Event('beforeprint'));verify()}
  p.querySelector('span').firstChild.nodeValue='8';w.NPI18n.apply();p.querySelector('span').firstChild.nodeValue='9';w.NPI18n.apply();verify();p.remove();w.NPI18n.set(locale);
 });
 check(`${locale}: Sudoku type and pause action have separate meanings`,()=>{assert.notEqual(t('通常ナンプレ'),t('ふつう'));assert.notEqual(t('一時停止する'),t('一時停止'));if(locale==='en'){assert.equal(t('通常ナンプレ'),'Classic Sudoku');assert.equal(t('ふつう'),'Medium');assert.equal(t('一時停止する'),'Pause');assert.equal(t('一時停止'),'Paused')}});
 check(`${locale}: zoom controls translate while numeric percentages stay fixed`,()=>{const p=fixture('<div><button aria-label="盤面を縮小する">−</button><button aria-label="倍率を100%に戻す"><span data-i18n-skip>100%</span></button><button aria-label="盤面を拡大する">＋</button><button aria-label="盤面全体を表示する">全体を表示</button></div>');const controls=[...p.querySelectorAll('button')],keys=['盤面を縮小する','倍率を100%に戻す','盤面を拡大する','盤面全体を表示する'];for(const lang of ['ja',locale]){w.NPI18n.set(lang);controls.forEach((control,i)=>assert.equal(control.getAttribute('aria-label'),lang==='ja'?keys[i]:catalog[keys[i]][lang]));assert.equal(controls[1].textContent,'100%');assert.equal(controls[3].textContent,lang==='ja'?'全体を表示':catalog['全体を表示'][lang])}p.remove()});
 check(`${locale}: select machine values`,()=>{const p=fixture('<select><option>保存</option><option value="cancel">キャンセル</option></select>').firstChild;assert.equal(p.children[0].getAttribute('value'),'保存');assert.equal(p.children[1].value,'cancel');assert.equal(p.children[0].textContent,t('保存'));p.remove()});
 check(`${locale}: native dialogs and canvas`,()=>{w.alert('保存');w.confirm('閉じる');w.prompt('言語','保存');const ctx=new w.CanvasRenderingContext2D();ctx.fillText('答え',10,20);ctx.measureText('答え');assert.deepEqual(calls.slice(-5).map(x=>x[1]),[t('保存'),t('閉じる'),t('言語'),t('答え'),t('答え')]);assert.equal(calls.at(-3)[2],'保存');assert.equal(calls.at(-2)[2],10)});
 check(`${locale}: translated values stay text`,()=>{const p=w.document.createElement('p');p.textContent='<img src=x onerror=alert(1)> 保存';w.document.body.appendChild(p);w.NPI18n.apply();assert.equal(p.children.length,0);assert(p.textContent.includes('<img'));p.remove()});
 check(`${locale}: English-only registration cannot erase translations`,()=>{const expected=t('保存');w.NPTranslations['保存']={en:'WRONG REPLACEMENT'};assert.equal(t('保存'),expected);assert.equal(t('保存','en'),catalog['保存'].en)});
 check(`${locale}: print-only labels`,()=>{const p=fixture('<div class="print-only"><span>問題</span><span>答え</span></div>').firstChild;w.dispatchEvent(new w.Event('beforeprint'));assert.equal(p.children[0].textContent,t('問題'));assert.equal(p.children[1].textContent,t('答え'));p.remove()});
 check(`${locale}: missing-label diagnostics`,()=>{const v='未登録の架空ラベル';assert.equal(t(v),v);assert(w.NPI18n.missing().includes(v))});
 check(`${locale}: language dialog endonyms and explanation`,()=>{w.NPI18n.show();const d=w.document.getElementById('np-language-dialog');assert(d.open);assert.equal(d.querySelectorAll('option').length,Object.keys(names).length);assert.equal(d.querySelector('option').textContent,'日本語');assert(d.textContent.includes(t('クロスワードの単語・ヒントは日本語です。')));assert(w.NPI18n.closeIfOpen())});
 check(`${locale}: React translations are not reinterpreted as Japanese`,()=>{const root=w.document.getElementById('root');for(const key of ['答え','解答','行','列']){const p=w.document.createElement('p');p.textContent=w.NPI18n.react(key,locale);root.appendChild(p);w.NPI18n.apply();assert.equal(p.textContent,catalog[key][locale]);w.NPI18n.set('ja');assert.equal(p.textContent,key);w.NPI18n.set(locale);assert.equal(p.textContent,catalog[key][locale]);p.remove()}});
 check(`${locale}: numeric units without broad matching`,()=>{for(const value of ['12問','32件','8回']){const rendered=t(value);assert.notEqual(rendered,value);assert(rendered.includes(value.match(/\d+/)[0]))}assert.equal(t('田中問'),'田中問')});
 check(`${locale}: chained candidate coordinates preserve every number`,()=>{const v=t('12行7列の3、2行11列の8');assert.deepEqual((v.match(/\d+/g)||[]).sort(),['12','7','3','2','11','8'].sort());assert(!/[の]/.test(v));assert.notEqual(v,'12行7列の3、2行11列の8')});

 check(`${locale}: generated print and crossword accessibility`,()=>{for(const key of ['前のページ','次のページ','見本を縮小する','見本を拡大する','黒マスを1個減らす','黒マスを1個増やす']){const p=fixture('<button aria-label="'+key+'">＋</button>');assert.equal(p.firstChild.getAttribute('aria-label'),catalog[key][locale]);w.NPI18n.set('ja');assert.equal(p.firstChild.getAttribute('aria-label'),key);w.NPI18n.set(locale);assert.equal(p.firstChild.getAttribute('aria-label'),catalog[key][locale]);p.remove()}});
 check(`${locale}: numbered complexity and legacy qualifiers`,()=>{for(const [i,label]of ['シンプル','少し複雑','複雑','とても複雑'].entries()){const value=t(`${i+1}：${label}`);assert(!japanese.test(value));assert(value.includes(String(i+1)));assert(value.includes(t(label)))}for(const raw of ['1：シンプル（旧方式）','Lv.01 / 02（旧基準）','Lv.01 / 05（旧基準）'])assert(!japanese.test(t(raw)),raw)});
 check(`${locale}: spaced singular puzzle count`,()=>{assert.equal(t('1 問'),catalog['1問'][locale]);assert.equal(t('12 問'),t('12問'));assert.equal(t('田中 問'),'田中 問')});
 check(`${locale}: textarea metadata with untouched user text`,()=>{const p=fixture('<textarea aria-label="メモ" placeholder="ニックネーム">日本語の大切なメモ</textarea><div contenteditable="true" aria-label="メモ">日本語の入力内容</div>');const note=p.querySelector('textarea');assert.equal(note.value,'日本語の大切なメモ');assert.equal(note.getAttribute('aria-label'),t('メモ'));assert.equal(note.getAttribute('placeholder'),t('ニックネーム'));assert.equal(p.querySelector('[contenteditable]').textContent,'日本語の入力内容');assert.equal(p.querySelector('[contenteditable]').getAttribute('aria-label'),t('メモ'));w.NPI18n.set('ja');assert.equal(note.getAttribute('aria-label'),'メモ');assert.equal(note.value,'日本語の大切なメモ');w.NPI18n.set(locale);p.remove()});
 check(`${locale}: specific coordinate context and blank cell`,()=>{for(const raw of ['選択：12行 7列','12行7列 空白','12行7列 空白 メモ 3、4','12行7列 16 固定']){const result=t(raw);assert(!japanese.test(result),result);assert(result.includes('12')&&result.includes('7'));if(locale==='en')assert(!result.includes('Row Selected'))}});
 check(`${locale}: optional-empty branches and generation counts`,()=>{for(const raw of ['3条件から 12問を選択。','3問を追加しました。','／ この中で選択済み 3問','3問保存しました。','この問題の線をすべて消しますか？','この端末に 1 問を保存しました。','ミス 0 / 3','残り 1'])assert(!japanese.test(t(raw)),raw)});
 check(`${locale}: dynamic hints survive a language round trip`,()=>{const p=fixture('<p>12行7列に注目してください。</p>').firstChild;const expected=t('12行7列に注目してください。');assert.equal(p.textContent,expected);w.NPI18n.set(locale==='fr'?'en':'fr');assert.equal(p.textContent,t('12行7列に注目してください。'));w.NPI18n.set('ja');assert.equal(p.textContent,'12行7列に注目してください。');w.NPI18n.set(locale);assert.equal(p.textContent,expected);p.remove()});
 for(const example of inlineFixtures)check(`${locale}: whole sentence ${example.id}`,()=>{
  const wrapper=w.document.createElement('section');
  const inside=example.sampleHtml;
  wrapper.innerHTML=example.selector.startsWith('#dialog')?'<div id="dialog">'+(example.selector.includes('ol')?'<ol>'+inside+'</ol>':inside)+'</div>':'<div id="app">'+(example.selector.includes('.proto-rules')?'<ol class="proto-rules">'+inside+'</ol>':example.selector.includes('.tutorial-game')?'<div class="tutorial-game">'+inside+'</div>':example.selector.includes('.neighbor-rules')?'<div class="neighbor-rules">'+inside+'</div>':inside)+'</div>';
  w.document.body.appendChild(wrapper);const element=wrapper.querySelector(example.selector),original=element.textContent,markup=element.innerHTML,children=[...element.children];
  w.NPI18n.apply();assert(!japanese.test(element.textContent),element.textContent);assert(!/\{[a-zA-Z0-9_]+\}/.test(element.textContent));assert.equal(element.querySelectorAll('b,strong,em,span,br').length,children.length);for(const child of children)assert.equal(child.parentElement,element);
  if(example.id==='shirupure-course-help'&&locale==='en')assert.equal(element.textContent,'Play 10 puzzles at your current difficulty, then try 1 puzzle at the next level.');
  if(example.id==='shirupure-help-room-size'&&locale==='en')assert.equal(element.textContent,'Draw lines to divide the board into rooms of 6 cells each.');
  const translated=element.textContent;w.NPI18n.set('ja');assert.equal(element.textContent,original);assert.equal(element.innerHTML,markup);for(const child of children)assert.equal(child.parentElement,element);w.NPI18n.set(locale);assert.equal(element.textContent,translated);
  if(example.id==='shirupure-help-room-size'){children[0].textContent='7マスずつの部屋';w.NPI18n.apply();assert(element.textContent.includes('7'));assert(!japanese.test(element.textContent));w.NPI18n.set('ja');assert.equal(children[0].textContent,'7マスずつの部屋');w.NPI18n.set(locale);assert(element.textContent.includes('7'))}
  // Re-rendered source must be matched afresh, never overwritten by old nodes.
  element.innerHTML=markup;w.NPI18n.apply();assert.equal(element.textContent,translated);wrapper.remove();
 });
 check(`${locale}: inline translator leaves interactive children intact`,()=>{const p=fixture('<div id="dialog"><p>今の難易度を<a href="#keep">10問</a>遊んだら、一つ上の難易度に<strong>1問</strong>挑戦。</p></div>');const link=p.querySelector('a');assert.equal(link.getAttribute('href'),'#keep');assert.equal(link.parentElement.tagName,'P');p.remove()});

 for(const name of ['index','print','shirupure','crossword','tenbin'])check(`${locale}: shipped ${name}.html labels`,()=>{const m=JSON.parse(fs.readFileSync(path.join(repo,'nanpure/release-manifest.json'),'utf8')),html=fs.readFileSync(path.join(repo,m.base,'notebook',name+'.html'),'utf8'),{w:page}=boot(html,locale);assert.deepEqual(visibleJapanese(page.document),[]);assert(!japanese.test(page.document.title))});
}
check('regional language tags',()=>{const{w}=boot(undefined,'zh-TW');assert.equal(w.NPI18n.get(),'zh-Hant');w.NPI18n.set('pt-BR');assert.equal(w.NPI18n.get(),'pt');w.NPI18n.set('zh-CN');assert.equal(w.NPI18n.get(),'zh-Hans')});
check('invalid language preserves current locale',()=>{const{w}=boot();assert.throws(()=>w.NPI18n.set('xx'));assert.equal(w.NPI18n.get(),'en')});
check('shipped inline and external Sudoku metadata use the type-specific source label',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(repo,'nanpure/release-manifest.json'),'utf8'));
 const common=fs.readFileSync(path.join(repo,manifest.base,'notebook/common.js'),'utf8'),html=fs.readFileSync(path.join(repo,manifest.base,'notebook/index.html'),'utf8');
 const {document}=parseHTML(html),inline=[...document.querySelectorAll('script:not([src])')].find(script=>script.textContent.includes('ふつうのナンプレ'));assert(inline,'Missing inline puzzle metadata');
 // Distribution protection rewrites syntax and string references. Check the
 // resulting API, not a brittle match against the unobfuscated source.
 for(const [file,source]of [['common.js',common],['index.html',inline.textContent]]){const window={};vm.runInNewContext(source,{window},{timeout:1000});assert.equal(window.NP.KIND.normal.short,'通常ナンプレ',file+' has an ambiguous type label')}
 const video=fs.readFileSync(path.join(repo,'scripts/client-overrides/public/notebook/video-features.js'),'utf8');assert(video.includes('data-video="pause">一時停止する</button>'));assert(video.includes('<h2>一時停止</h2>'));
});
async function checkAsync(name,fn){try{await fn();checks.push(name)}catch(e){failures.push({name,error:e.stack||e.message})}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function drainFrames(frames){for(let i=0;i<4;i++){await tick();for(const frame of frames.splice(0))frame()}}
const packFor=locale=>Object.fromEntries(Object.entries(catalog).map(([key,values])=>[key,values[locale]]));
function controlledAssets(){
 const requests=[],messages=Object.fromEntries(['読み込み中…','表示を読み込めませんでした。通信を確認して、もう一度お試しください。','もう一度読み込む'].map(key=>[key,{ja:key,...catalog[key]}]));
 const assets={messages,load(locale){return new Promise((resolve,reject)=>requests.push({locale,resolve,reject}))}};
 return {assets,requests,finish(locale){const request=requests.findLast(request=>request.locale===locale);assert(request,'Missing request for '+locale);request.resolve(packFor(locale))}};
}
async function asyncChecks(){
 await checkAsync('cold startup loads only the selected language before revealing content',async()=>{
  const control=controlledAssets(),{w}=boot('<html><head><title>ナンプレ帳</title></head><body><div id="root"><p>保存</p><svg><text>9</text></svg></div></body></html>','en',{assets:control.assets});
  assert.deepEqual(control.requests.map(item=>item.locale),['en']);assert(w.document.documentElement.hasAttribute('data-i18n-loading'));assert.equal(w.document.getElementById('np-i18n-load').textContent,catalog['読み込み中…'].en);
  assert.equal(w.NPI18n.t('保存'),'保存');assert.equal(w.NPI18n.missing().length,0);
  // A module may register stale English while the reviewed file is in flight.
  w.NPTranslations['保存']={en:'WRONG EARLY LABEL'};
  control.finish('en');await w.NPI18n.ready;
  assert.equal(w.document.querySelector('#root p').textContent,catalog['保存'].en);assert.equal(w.document.querySelector('svg text').textContent,'9');assert(!w.document.documentElement.hasAttribute('data-i18n-loading'));assert(!w.document.getElementById('np-i18n-load'));
  assert.equal(w.NPI18n.set('ja'),true);assert.equal(w.document.querySelector('#root p').textContent,'保存');assert.equal(w.NPI18n.set('en'),true);assert.equal(control.requests.length,1);
 });
 await checkAsync('Japanese startup requires no translation dictionary',async()=>{
  const control=controlledAssets(),{w}=boot(undefined,'ja',{assets:control.assets});await w.NPI18n.ready;assert.equal(control.requests.length,0);assert(!w.document.documentElement.hasAttribute('data-i18n-loading'));
 });
 await checkAsync('last language selection wins even when downloads finish out of order',async()=>{
  const control=controlledAssets(),{w,values}=boot('<html><head></head><body><div id="root"><p>保存</p></div></body></html>','ja',{assets:control.assets});await w.NPI18n.ready;
  const first=w.NPI18n.set('fr'),second=w.NPI18n.set('de');assert.equal(w.NPI18n.get(),'ja');assert.equal(w.document.querySelector('p').textContent,'保存');
  control.finish('de');assert.equal(await second,true);assert.equal(w.NPI18n.get(),'de');control.finish('fr');assert.equal(await first,false);assert.equal(w.NPI18n.get(),'de');assert.equal(values.get('nanpure-language-v1'),'de');assert.equal(w.document.querySelector('p').textContent,catalog['保存'].de);
  const pending=w.NPI18n.set('es');assert.equal(w.NPI18n.set('ja'),true);control.finish('es');assert.equal(await pending,false);assert.equal(w.NPI18n.get(),'ja');assert.equal(values.get('nanpure-language-v1'),'ja');
 });
 await checkAsync('a failed language switch preserves the current UI and can be retried',async()=>{
  const control=controlledAssets(),{w,values,calls}=boot('<html><head></head><body><div id="root"><p>保存</p></div></body></html>','ja',{assets:control.assets});w.NPI18n.set('ja');
  const failed=w.NPI18n.set('pt');control.requests.at(-1).reject(new Error('offline'));assert.equal(await failed,false);assert.equal(w.NPI18n.get(),'ja');assert.equal(w.document.querySelector('p').textContent,'保存');assert.equal(values.get('nanpure-language-v1'),'ja');assert.equal(calls.at(-1)[0],'alert');
  const retried=w.NPI18n.set('pt');assert.equal(control.requests.length,2);control.finish('pt');assert.equal(await retried,true);assert.equal(w.document.querySelector('p').textContent,catalog['保存'].pt);
 });
 await checkAsync('initial download failure offers a localized retry and ready resolves after success',async()=>{
  const control=controlledAssets(),{w}=boot(undefined,'fr',{assets:control.assets});let ready=false;w.NPI18n.ready.then(()=>{ready=true});
  control.requests[0].reject(new Error('offline'));await tick();assert.equal(ready,false);assert(w.document.documentElement.hasAttribute('data-i18n-loading'));
  const panel=w.document.getElementById('np-i18n-load');assert.equal(panel.querySelector('p').textContent,catalog['表示を読み込めませんでした。通信を確認して、もう一度お試しください。'].fr);assert.equal(panel.querySelector('button').textContent,catalog['もう一度読み込む'].fr);panel.querySelector('button').onclick();assert.equal(control.requests.length,2);
  control.finish('fr');await w.NPI18n.ready;assert.equal(ready,true);assert(!w.document.documentElement.hasAttribute('data-i18n-loading'));
 });
 await checkAsync('mutation-observed numeric replacements remain numbers in Japanese',async()=>{
  const {w,frames}=boot('<html><head></head><body><div id="root"><span>8</span><svg><text>8</text></svg></div></body></html>','ja');
  w.document.querySelector('span').textContent='9';w.document.querySelector('svg text').textContent='9';await tick();for(const frame of frames.splice(0))frame();assert.equal(w.document.querySelector('span').textContent,'9');assert.equal(w.document.querySelector('svg text').textContent,'9');
 });
 await checkAsync('real incremental renderer and access labels translate after every language round trip',async()=>{
  const source=fs.readFileSync(path.join(repo,'scripts/client-overrides/public/notebook/app.js'),'utf8');
  const begin=source.indexOf('const boardRenderCache='),end=source.indexOf('function paintPlayEdit(',begin);assert(begin>=0&&end>begin);
  const manifest=JSON.parse(fs.readFileSync(path.join(repo,'nanpure/release-manifest.json'),'utf8')),access=fs.readFileSync(path.join(repo,manifest.base,'notebook/access-tools.js'),'utf8');
  const a=access.indexOf("const board=document.getElementById('board'),p="),b=access.indexOf('\n}\nfunction schedule',a);assert(a>=0&&b>a);
  const {w,frames}=boot('<html><head></head><body><main id="app"><div id="board"></div></main></body></html>','en'),puzzle={n:9,grid:[8,9,0],puzzle:[8,0,0],notes:{}};
  w.NanpureAppTest={getCurrent:()=>puzzle};vm.runInContext(source.slice(begin,end)+'\nfunction refreshAccessLabels(){const t=s=>s;'+access.slice(a,b)+'}',vm.createContext(w));
  const board=w.document.getElementById('board'),views=puzzle.grid.map((n,i)=>({classes:'cell',style:'',label:'1行'+(i+1)+'列 '+(n?'数字'+n:'空きマス'),selected:false,html:n?'<span>'+n+'</span>':''}));
  w.updateBoardCells(board,puzzle,views);w.refreshAccessLabels();await drainFrames(frames);const cells=[...board.children];
  for(const locale of langs){
   w.NPI18n.set('ja');w.updateBoardCells(board,puzzle,views);w.refreshAccessLabels();await drainFrames(frames);assert.equal(cells[0].getAttribute('aria-label'),'1行1列 8 固定');
   w.NPI18n.set(locale);w.updateBoardCells(board,puzzle,views);w.refreshAccessLabels();
   const modal=w.document.createElement('section');modal.id='video-pause';modal.innerHTML='<h2>一時停止</h2><button>再開する</button>';w.document.body.append(modal);await drainFrames(frames);
   ['1行1列 8 固定','1行2列 9','1行3列 空白'].forEach((raw,i)=>assert.equal(cells[i].getAttribute('aria-label'),w.NPI18n.t(raw)));
   assert.equal(cells[1].textContent,'9');assert([...board.children].every((cell,i)=>cell===cells[i]));assert.equal(modal.querySelector('h2').textContent,catalog['一時停止'][locale]);assert.equal(modal.querySelector('button').textContent,catalog['再開する'][locale]);modal.remove();
  }
 });
 await checkAsync('a caught translation error cannot leave future DOM and aria updates unobserved',async()=>{
  const {w,frames}=boot('<html><head></head><body><div id="root"><button id="cell" aria-label="1行2列 9">9</button></div></body></html>','en'),cell=w.document.getElementById('cell'),closest=cell.closest;
  w.NPI18n.set('ja');cell.closest=()=>{throw new Error('Synthetic node failure')};assert.throws(()=>w.NPI18n.set('en'),/Synthetic node failure/);cell.closest=closest;
  assert(w.document.documentElement.dataset.i18nError.includes('Synthetic node failure'));
  cell.setAttribute('aria-label','1行3列 空白');const modal=w.document.createElement('section');modal.innerHTML='<h2>一時停止</h2><button>再開する</button>';w.document.body.append(modal);await drainFrames(frames);
  assert.equal(cell.getAttribute('aria-label'),w.NPI18n.t('1行3列 空白'));assert.equal(modal.querySelector('h2').textContent,'Paused');assert.equal(modal.querySelector('button').textContent,'Resume');assert.equal(cell.textContent,'9');
  // The same guarantee applies when a mutation batch, rather than set(), fails.
  cell.closest=()=>{throw new Error('Synthetic batch failure')};cell.setAttribute('aria-label','1行4列 9');await tick();assert.throws(()=>frames.shift()(),/Synthetic batch failure/);cell.closest=closest;
  cell.setAttribute('aria-label','1行5列 9');await drainFrames(frames);assert.equal(cell.getAttribute('aria-label'),w.NPI18n.t('1行5列 9'));
 });
 const {buildTranslationAssets}=await import('./i18n/build-assets.mjs');
 const folder=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'nanpure-i18n-assets-'));
 try{
  const sizes=buildTranslationAssets(folder,'i18n-regression'),source=fs.readFileSync(path.join(folder,'i18n-data.js'),'utf8');
  check('translation assets contain complete independent language packs and a small bootstrap',()=>{
   assert.deepEqual(fs.readdirSync(path.join(folder,'i18n')).sort(),langs.map(lang=>lang+'.json').sort());const fullSize=Buffer.byteLength(JSON.stringify(catalog));assert(sizes.bootstrapBytes<fullSize/100);
   for(const locale of langs){const pack=JSON.parse(fs.readFileSync(path.join(folder,'i18n',locale+'.json'),'utf8'));assert.deepEqual(pack,packFor(locale));assert(sizes.bootstrapBytes+sizes.localeBytes[locale]<fullSize*0.3)}
  });
  function bootstrap(fetch,parent){const w={};w.parent=parent||w;vm.runInNewContext(source,{window:w,document:{currentScript:{src:'https://example.test/release/notebook/i18n-data.js'}},URL,fetch});return w}
  await checkAsync('asset loader coalesces same-language requests and shares the parent cache',async()=>{
   const requests=[];const parent=bootstrap((url,options)=>new Promise(resolve=>requests.push({url:String(url),options,resolve}))),assets=parent.NPTranslationAssets;
   const a=assets.load('en'),b=assets.load('en');assert.equal(a,b);assert.equal(requests.length,1);assert.equal(requests[0].url,'https://example.test/release/notebook/i18n/en.json');assert.equal(requests[0].options.credentials,'same-origin');requests[0].resolve({ok:true,json:async()=>packFor('en')});assert.deepEqual(await a,packFor('en'));assert(assets.has('en'));
   const frame=bootstrap(()=>{throw new Error('Frame must reuse parent loader')},parent);assert.equal(frame.NPTranslationAssets,assets);await frame.NPTranslationAssets.load('en');assert.equal(requests.length,1);await assets.load('ja');assert.equal(requests.length,1);
  });
  await checkAsync('asset loader retries rejected and malformed files without caching failures',async()=>{
   let attempts=0;const w=bootstrap(async()=>{attempts++;if(attempts===1)return{ok:false,status:503};if(attempts===2)return{ok:true,json:async()=>({bad:{nested:'invalid'}})};return{ok:true,json:async()=>packFor('en')}});
   await assert.rejects(w.NPTranslationAssets.load('en'),/503/);assert(!w.NPTranslationAssets.has('en'));await assert.rejects(w.NPTranslationAssets.load('en'),/Invalid translation pack/);assert(!w.NPTranslationAssets.has('en'));assert.deepEqual(await w.NPTranslationAssets.load('en'),packFor('en'));assert.equal(attempts,3);
  });
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
}
asyncChecks().catch(error=>failures.push({name:'async regression setup',error:error.stack||error.message})).then(()=>{
 const result={date:new Date().toISOString(),passed:checks.length,failed:failures.length,checks,failures};
 fs.writeFileSync(process.env.NP_I18N_REPORT||'/tmp/nanpure-i18n-checks.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({passed:checks.length,failed:failures.length,failures:failures.map(f=>({name:f.name,error:f.error.slice(0,200)}))},null,2));process.exit(failures.length?1:0);
});
