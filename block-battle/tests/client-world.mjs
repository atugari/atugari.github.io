import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=await readFile('game/client.js','utf8');
export function world({storage={},pads=[]}={}){
 const elements=new Map(),events={},scrolls=[];
 const context2d=new Proxy({},{get:()=>()=>{}});
 let document;
 function create(id){
  const e={value:({das:'140',arr:'35',music:'.35',se:'.6',n:'9'})[id]||'',style:{},dataset:{},children:[],textContent:'',tagName:'DIV',getContext:()=>context2d,append(...a){this.children.push(...a)},replaceChildren(...a){this.children=a},blur(){if(document.activeElement===this)document.activeElement=document.body},focus(){document.activeElement=this},scrollIntoView(o){scrolls.push({id:this.id,...o})},setPointerCapture(){},click(){return this.onclick?.()},classList:{remove(){},add(){}}};
  let name=id;Object.defineProperty(e,'id',{get:()=>name,set:v=>{name=v;elements.set(v,e)}});Object.defineProperty(e,'firstChild',{get:()=>e.children[0]});elements.set(id,e);return e;
 }
 const element=id=>elements.get(id)||create(id);
 document={getElementById:element,querySelectorAll:()=>[],hidden:false};
 // Preserve the id setter for the binding buttons created by the client.
 document.createElement=()=>{let e=create(Math.random());e.tagName='BUTTON';return e};
 document.body=element('body');document.activeElement=document.body;
 const c=vm.createContext({document,performance:{now:()=>10000},navigator:{getGamepads:()=>pads},localStorage:storage,structuredClone,crypto:webcrypto,Uint32Array,Uint8Array,TextEncoder,TextDecoder,Date,console,requestAnimationFrame(){},addEventListener:(k,f)=>events[k]=f,setTimeout(){},clearTimeout(){},setInterval(){return 1},clearInterval(){},AbortController,Blob,fetch(){throw Error('Unexpected network in client test')}});
 vm.runInContext(source,c);
 const key=(code,type='keydown',target=document.activeElement)=>events[type]({code,target,repeat:false,preventDefault(){}});
 return{run:s=>vm.runInContext(s,c),elements,events,document,key,scrolls,pads,storage};
}
