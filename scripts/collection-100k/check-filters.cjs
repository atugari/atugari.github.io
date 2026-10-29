'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'nanpure/collection/app.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'nanpure/collection/catalog.json'),'utf8'));
new vm.SourceTextModule(source);
class Select{
 constructor(){this.options=[];this._value='';this.disabled=false;}
 set innerHTML(s){this.options=[...s.matchAll(/<option\b([^>]*)>(.*?)<\/option>/g)].map(([,a,t])=>({value:a.match(/value="([^"]*)"/)?.[1]||'',textContent:t,disabled:/disabled/.test(a)}));this._value=this.options[0]?.value||'';}
 get value(){return this._value;}
 set value(v){this._value=this.options.some(o=>o.value===String(v))?String(v):'';}
 get selectedOptions(){return this.options.filter(o=>o.value===this._value);}
}
const fields=['kind','size','level','state'],els=Object.fromEntries(fields.map(k=>[k,new Select()]));
els.state.innerHTML='<option value="all">すべて</option>';
for(const k of ['search','summary','count','cards','more','quick','back','next','background','game','notice','player-status'])els[k]={value:'',checked:true,scrollIntoView(){}};
const context=vm.createContext({document:{getElementById:k=>els[k],addEventListener(){}},window:{addEventListener(){}},setTimeout(){},fetch(){throw Error('Selection must not fetch packs');}});
const end=source.lastIndexOf('try{const loaded=await Promise.all');
vm.runInContext(source.slice(source.indexOf('\n')+1,end)+'\nglobalThis.test={init(c){catalog=c;progress=new Map();render()},render,matching};',context);
context.test.init(catalog);
assert.equal(els.size.disabled,true);assert.equal(els.level.disabled,true);assert.equal(els.quick.disabled,true);assert.ok(!els.cards.innerHTML.includes('data-id='));
const offered=k=>els[k].options.filter(o=>o.value&&!o.disabled).map(o=>o.value);
const choose=(k,v)=>{assert.ok(offered(k).includes(String(v)),k+' offers '+v);els[k].value=v;els[k].onchange();};
const sizeKey=c=>[c.n,c.multiShape||c.linkedShape||'',c.complexity||''].join(':');
let cases=0;
for(const c of catalog.configs){
 choose('kind',c.kind);
 assert.equal(offered('kind').length,23,'Earlier rules stay reachable');
 const sizes=new Set(catalog.configs.filter(x=>x.kind===c.kind).map(sizeKey));
 assert.deepEqual(new Set(offered('size')),sizes);
 if(sizes.size>1){assert.equal(els.size.value,'');assert.equal(els.level.disabled,true);assert.equal(els.quick.disabled,true);}
 else assert.equal(els.size.value,sizeKey(c),'Only size is selected automatically');
 choose('size',sizeKey(c));choose('level',c.level);
 const list=context.test.matching();assert.equal(list.length,c.count);
 assert.ok(list.every(n=>n>=c.start&&n<c.start+c.count));
 assert.equal(els.quick.disabled,false);assert.ok((els.cards.innerHTML.match(/data-id=/g)||[]).length<=36);
 choose('kind',c.kind==='normal'?'antiknight':'normal');
 assert.equal(els.level.value,'','Changing a rule resets its difficulty');
 assert.ok(!els.size.options.some(o=>o.value&&!o.disabled&&!catalog.configs.some(x=>x.kind===els.kind.value&&sizeKey(x)===o.value)));
 cases++;
}
choose('kind','normal');choose('size','25::');choose('level','6');
els.size.value='9::';els.size.onchange();assert.equal(els.level.value,'');assert.ok(offered('level').includes('18'));
choose('kind','jigsaw');choose('size','9::4');choose('level','3');assert.equal(context.test.matching().length,6);
els.kind.value='';els.kind.onchange();assert.equal(els.size.disabled,true);assert.equal(els.level.disabled,true);assert.equal(els.quick.disabled,true);
console.log(cases+' catalog conditions passed: ordered steps, resets, all rules reachable, exact counts, page size.');
