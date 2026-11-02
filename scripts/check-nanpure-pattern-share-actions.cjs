// Run the real share controller with controllable OS/clipboard adapters.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require(process.argv[2]||'linkedom');
const {window:w}=parseHTML('<!doctype html><html><body><button id="origin">Open</button></body></html>'),calls={files:[],text:[],native:[]};
const settings={files:true,copyDenied:false,shareError:null};
const navigator={canShare:()=>settings.files,clipboard:{write:items=>{calls.files.push(items);return settings.copyDenied?Promise.reject(new Error('Denied')):Promise.resolve();},writeText:text=>{calls.text.push(text);return settings.copyDenied?Promise.reject(new Error('Denied')):Promise.resolve();}},share:data=>{calls.native.push(data);return settings.shareError?Promise.reject(Object.assign(new Error('Failed'),{name:settings.shareError})):Promise.resolve();}};
const sandbox={window:w,self:w,document:w.document,navigator,Blob,File,URL,btoa,atob,location:{href:'https://atugari.github.io/nanpure/'},ClipboardItem:class {constructor(data){this.data=data;}},queueMicrotask};
w.HTMLElement.prototype.showModal=function(){this.open=true;};w.HTMLElement.prototype.close=function(){this.open=false;};
w.HTMLInputElement.prototype.select=function(){this.selectionStart=0;this.selectionEnd=this.value.length;};
w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});
w.HTMLCanvasElement.prototype.toBlob=function(callback){queueMicrotask(()=>callback(new Blob(['png'],{type:'image/png'})));};
const context=vm.createContext(sandbox);for(const name of ['pattern-share-model.js','pattern-share.js'])vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/'+name,'utf8'),context);
const tick=()=>new Promise(setImmediate),clues=Array.from({length:81},(_,i)=>i%2?i%9+1:0),open=async()=>{w.NPPatternShare.open(clues);await tick();return w.document.querySelector('.pattern-share-dialog');};
const click=async node=>{const event=new w.Event('click',{bubbles:true,cancelable:true});if(typeof node.onclick==='function')node.onclick(event);else node.dispatchEvent(event);await tick();return event;};
(async()=>{
 let dialog=await open();const find=s=>dialog.querySelector(s),link=find('[data-share-link]').value;
 assert.deepEqual(Array.from(w.NPShareModel.decode(new URL(link).hash).clues),clues);assert(!link.includes('solution'));
 find('[data-share-text]').value='Test & # 日本語';find('[data-share-text]').dispatchEvent(new w.Event('input'));
 const x=find('[data-share-x]'),event=await click(x);assert(!event.defaultPrevented,'Ready X links navigate normally');assert.equal(calls.files.length,1,'X also attempts the PNG clipboard');assert.equal(new URL(x.getAttribute('href')).searchParams.get('text'),'Test & # 日本語');assert.equal(new URL(x.getAttribute('href')).searchParams.get('url'),link);
 const line=find('[data-share-line]');await click(line);assert.equal(new URL(line.getAttribute('href')).searchParams.get('text'),'Test & # 日本語\n'+link);
 await click(find('[data-share-native]'));assert.deepEqual(Object.keys(calls.native.at(-1)),['files']);assert.equal(calls.native.at(-1).files[0].type,'image/png');
 await click(find('[data-share-link-copy]'));assert.equal(calls.text.at(-1),link);
 settings.copyDenied=true;await click(find('[data-share-link-copy]'));assert(find('.pattern-share-more').open);assert.equal(find('[data-share-link]').selectionEnd,link.length);
 assert(!(await click(x)).defaultPrevented,'Clipboard denial still opens X with a usable puzzle link');assert(find('[data-share-status]').textContent.includes('問題リンクで共有'));
 settings.shareError='AbortError';await click(find('[data-share-native]'));assert.equal(find('[data-share-status]').textContent,'');assert(w.NPPatternShare.isOpen());
 settings.shareError='NotAllowedError';await click(find('[data-share-native]'));assert(find('[data-share-status]').textContent.includes('X・LINE'));
 settings.files=false;settings.shareError=null;dialog=await open();await click(find('[data-share-native]'));assert.deepEqual(Object.keys(calls.native.at(-1)),['text','url']);assert.equal(calls.native.at(-1).url,link);
 navigator.share=undefined;navigator.clipboard=undefined;dialog=await open();assert(find('[data-share-native]').hidden);assert(find('[data-share-copy]').hidden);assert(!(await click(find('[data-share-x]'))).defaultPrevented);await click(find('[data-share-link-copy]'));assert(find('.pattern-share-more').open);
 w.NPPatternShare.close();assert(!w.document.querySelector('.pattern-share-dialog'));
 // An older exporter may omit the separate model script tag. The public asset loads it itself.
 delete w.NPShareModel;let loadedModel=false;const append=w.document.head.append.bind(w.document.head);
 w.document.head.append=function(script){append(script);if(script.tagName==='SCRIPT'&&script.src.endsWith('pattern-share-model.js'))queueMicrotask(()=>{loadedModel=true;vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/pattern-share-model.js','utf8'),context);script.onload();});};
 dialog=await open();await tick();assert(loadedModel);assert.equal(find('[data-share-x]').getAttribute('aria-disabled'),null);assert.equal(new URL(find('[data-share-x]').getAttribute('href')).searchParams.get('url'),link);w.NPPatternShare.close();
 console.log('PASS share actions: prefilled X/LINE links, PNG clipboard, image-only native sharing, text-only/no-API fallback, clipboard denial and share cancellation; no download-only dead end');
})().catch(error=>{console.error(error);process.exit(1);});
