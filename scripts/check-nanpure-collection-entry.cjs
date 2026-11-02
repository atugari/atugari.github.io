// A rendered/translated home may temporarily clone its externally inserted entry.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.argv[2]||'linkedom'),source=fs.readFileSync(path.join(__dirname,'../nanpure/collection/entry.js'),'utf8');
const {document}=parseHTML('<html><head></head><body><main class="designed-home"><div class="start-choices"></div></main></body></html>'),observers=[],frames=[],w={document};
const context=vm.createContext({window:w,document,MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}},requestAnimationFrame:fn=>frames.push(fn)});
vm.runInContext(source,context);const count=()=>document.querySelectorAll('[data-collection-entry]').length;assert.equal(count(),1);const original=document.querySelector('[data-collection-entry]');assert.equal(original.getAttribute('href'),'/nanpure/collection/');
original.parentNode.append(original.cloneNode(true));assert.equal(count(),2);observers[0]();assert.equal(count(),1,'Normalize duplicate entries before another frame or interaction');assert.strictEqual(document.querySelector('[data-collection-entry]'),original,'Keep the existing live entry');assert.equal(frames.length,0,'Repair does not wait for a later animation frame');
document.body.append(original.cloneNode(true));document.body.append(document.querySelector('.designed-home').cloneNode(true));observers[0]();assert.equal(count(),1,'A transient second home and orphan entry cannot duplicate the global destination');
document.querySelectorAll('.designed-home').forEach(node=>node.remove());observers[0]();assert.equal(count(),0);
const next=document.createElement('main');next.className='designed-home';next.innerHTML='<div class="start-choices"></div>';document.body.append(next);observers[0]();assert.equal(count(),1,'Returning home creates one fresh entry');
vm.runInContext(source,context);w.NPCollectionEntry.mount();assert.equal(count(),1);assert.equal(document.head.querySelectorAll('script').length,1,'Repeated installation preserves one adapter');
console.log('PASS collection entry: same-turn deduplication, retained live link, transient homes, route return and idempotent installation');
