// Test the actual shipped shell in a DOM, plus its versioned asset references.
// node --experimental-vm-modules scripts/check-nanpure-pages.cjs /path/to/linkedom
const log=console;
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const {parseHTML}=require(process.argv[2]||'linkedom');
const repo=path.resolve(__dirname,'..'),manifest=require('../nanpure/release-manifest.json');
const base=path.join(repo,manifest.base),html=fs.readFileSync(path.join(repo,'nanpure/index.html'),'utf8');
const {window:w}=parseHTML(html),values=new Map(),requests=[],errors=[];
Object.assign(w,{window:w,self:w,Headers,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},location:{origin:'https://atugari.github.io',href:'https://atugari.github.io/nanpure/',pathname:'/nanpure/',search:'',hash:''},history:{replaceState(){},pushState(){},go(){}},performance,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,structuredClone,queueMicrotask,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},scrollTo(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),fetch:async url=>{requests.push(url);if(url==='/nanpure/version.json')return{ok:true,json:async()=>({version:manifest.version})};assert(String(url).startsWith(manifest.online+'/api/'),'Unexpected endpoint '+url);return {ok:true,json:async()=>({day:'2026-10-21',serverNow:Date.now(),challenges:[{day:'2026-10-21',level:1,n:9,kind:'normal',title:'Test',rules:'Test'}],records:[],rows:[],items:[],days:[],signedIn:true,save:null})}},console:{...console,error:(...e)=>errors.push(e.map(String).join(' '))}});
w.parent=w;w.HTMLElement.prototype.showModal=function(){this.open=true};w.HTMLElement.prototype.close=function(){this.open=false};
Object.defineProperty(w.document,'hidden',{value:false});
const context=vm.createContext(w),modules=new Map();
async function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,importModuleDynamically:async(spec,ref)=>{const next=await load(path.resolve(path.dirname(ref.identifier),spec));await next.evaluate();return next}});modules.set(file,m);await m.link((spec,ref)=>load(path.resolve(path.dirname(ref.identifier),spec)));return m}
const settle=()=>new Promise(r=>setTimeout(r,80));
function button(text){const b=[...w.document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);assert(b,'Button missing: '+text);b.click();return b}
(async()=>{
 // Every declared script/style URL and CSS asset must exist in the shipped tree.
 for(const file of Object.keys(manifest.files).filter(x=>/\.(html|css)$/.test(x))){const text=fs.readFileSync(path.join(repo,file),'utf8');const refs=[...text.matchAll(/(?:src|href)=["']([^"']+)["']|url\(["']?([^\s)'";]+)["']?\)/g)];for(const m of refs){let url=m[1]||m[2];if(!url||!url.startsWith(manifest.base))continue;url=url.split(/[?#]/)[0];assert(fs.existsSync(path.join(repo,url)),'Missing local asset '+url)}}
 for(const name of ['site-theme.js','ui-text.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),context);
 const entry=await load(path.join(base,'shell/main.js'));await entry.evaluate();await settle();
 assert(w.document.querySelector('h1')?.textContent.includes('ナンプレ帳'));
 const daily=w.document.querySelector('button.daily-choice');assert(daily);assert(!w.document.querySelector('a.daily-choice'));
 button('☰●');await settle();assert(w.document.querySelector('.site-menu'));button('閉じる ×');await settle();
 const free=w.document.querySelector('.main-choice');free.click();await settle();assert(w.document.querySelector('.site-shell').classList.contains('mode-practice'));
 const iframe=w.document.querySelector('iframe.notebook');assert.equal(iframe.getAttribute('src'),manifest.base+'notebook/index.html');
 button('‹ 戻る');await settle();assert(w.document.querySelector('.site-shell').classList.contains('mode-home'));
 button('お問い合わせ');await settle();assert(w.document.querySelector('.contact-form'));assert(!w.document.querySelector('.pages-online'));
 button('閉じる ×');await settle();button('ランキング');await settle();assert(w.document.querySelector('.ranking'));
 assert.equal(errors.length,0,errors.join('\n'));assert(requests.some(x=>x===manifest.online+'/api/contact?summary=1'));
 assert(!html.includes('chatgpt.site'));
 log.log('PASS shipped shell: startup, free-play/back, native daily/contact/ranking, Cloudflare API transport, versioned assets');
 process.exit(0);
})().catch(e=>{log.error(e);process.exit(1)});
