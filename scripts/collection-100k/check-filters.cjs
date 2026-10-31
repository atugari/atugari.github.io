'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'nanpure/collection/app.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'nanpure/collection/catalog.json'),'utf8'));
async function main(){
const {lastPlayedTime,progressDate,nextProgress}=await import('../../nanpure/collection/progress-model.mjs');
new vm.SourceTextModule(source);
class Select{
 constructor(){this.options=[];this._value='';this.disabled=false;}
 set innerHTML(s){this.options=[...s.matchAll(/<option\b([^>]*)>(.*?)<\/option>/g)].map(([,a,t])=>({value:a.match(/value="([^"]*)"/)?.[1]||'',textContent:t,disabled:/disabled/.test(a)}));this._value=this.options[0]?.value||'';}
 get value(){return this._value;}
 set value(v){this._value=this.options.some(o=>o.value===String(v))?String(v):'';}
 get selectedOptions(){return this.options.filter(o=>o.value===this._value);}
}
const fields=['kind','size','level','state','sort'],els=Object.fromEntries(fields.map(k=>[k,new Select()]));
els.state.innerHTML='<option value="all">すべて</option>';
els.sort.innerHTML='<option value="number">問題番号順</option><option value="recent">最近遊んだ順</option>';
for(const k of ['search','summary','count','cards','more','quick','back','next','background','game','notice','player-status'])els[k]={value:'',checked:true,scrollIntoView(){}};
const context=vm.createContext({lastPlayedTime,progressDate,nextProgress,URLSearchParams,location:{search:''},document:{getElementById:k=>els[k],addEventListener(){}},window:{addEventListener(){}},setTimeout(){},fetch(){throw Error('Selection must not fetch packs');}});
const end=source.lastIndexOf('try{const loaded=await Promise.all');
vm.runInContext(source.slice(0,end).replace(/^import .*;\n/gm,'')+'\nglobalThis.test={init(c){catalog=selectCatalog(c);progress=new Map();render()},render,matching,nextNumber,setProgress(rows){progress=new Map(rows.map(row=>[row.id,row]));render()}};',context);
context.test.init(catalog);
assert.equal(els.size.disabled,true);assert.equal(els.level.disabled,true);assert.equal(els.quick.disabled,true);assert.ok(!els.cards.innerHTML.includes('data-id='));
const offered=k=>els[k].options.filter(o=>o.value&&!o.disabled).map(o=>o.value);
assert.ok(!offered('kind').includes('cross'),'Cross is owned by Pareasobi');
const choose=(k,v)=>{assert.ok(offered(k).includes(String(v)),k+' offers '+v);els[k].value=v;els[k].onchange();};
const sizeKey=c=>[c.n,c.multiShape||c.linkedShape||'',c.complexity||''].join(':');
let cases=0;
for(const c of catalog.configs.filter(c=>c.kind!=='cross')){
 choose('kind',c.kind);
 assert.equal(offered('kind').length,23,'Earlier rules stay reachable');
 const sizes=new Set(catalog.configs.filter(x=>x.kind===c.kind).map(sizeKey));
 assert.deepEqual(new Set(offered('size')),sizes);
 if(sizes.size>1){assert.equal(els.size.value,'');assert.equal(els.level.disabled,true);assert.equal(els.quick.disabled,true);}
 else assert.equal(els.size.value,sizeKey(c),'Only size is selected automatically');
 choose('size',sizeKey(c));choose('level',c.level);
 const list=context.test.matching();const expected=catalog.configs.filter(x=>x.kind===c.kind&&sizeKey(x)===sizeKey(c)&&x.level===c.level);assert.equal(list.length,expected.reduce((n,x)=>n+x.count,0));
 assert.ok(list.every(n=>expected.some(x=>n>=x.start&&n<x.start+x.count)));
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
const first=catalog.configs.find(c=>c.kind==='normal'&&c.n===9);
context.test.init({...catalog,total:catalog.total+2,configs:[...catalog.configs,{...first,cid:'CAPPENDTEST',start:catalog.total+1,count:2}]});
assert.equal(context.test.nextNumber(first.start+first.count-1),catalog.total+1,'Next reaches a later imported segment with the same configuration');
assert.equal(context.test.nextNumber(catalog.total+2),first.start,'Next wraps to the original segment');
console.log(cases+' catalog conditions passed: ordered steps, resets, all rules reachable, exact counts, page size.');

context.test.init(catalog);
choose('kind','all');
assert.equal(context.test.matching().length,98279);
assert.equal(els.quick.disabled,false);
assert.equal((els.cards.innerHTML.match(/data-id=/g)||[]).length,36);
assert.equal(els.size.value,'');
assert.equal(els.level.disabled,false);
const normal=catalog.configs.find(c=>c.kind==='normal'),jigsaw=catalog.configs.find(c=>c.kind==='jigsaw'),cross=catalog.configs.find(c=>c.kind==='cross');
const id=n=>'P-'+String(n).padStart(6,'0'),now=new Date(2026,9,31,15,30).getTime();
const rows=[
 {id:id(normal.start),state:'playing',updated:now-86400000,lastPlayedAt:now-3600000,extra:'keep'},
 {id:id(jigsaw.start),state:'playing',updated:now-86400000,lastPlayedAt:now},
 {id:id(normal.start+1),state:'done',updated:now+3600000},
 {id:id(cross.start),state:'playing',lastPlayedAt:now+7200000}
];
context.test.setProgress(rows);choose('state','playing');choose('sort','recent');
assert.deepEqual(Array.from(context.test.matching()),[jigsaw.start,normal.start],'Existing unfinished filter works across rules, excluding Pareasobi');
assert.match(els.cards.innerHTML,/最終プレイ：/);
assert.equal((els.cards.innerHTML.match(/data-id=/g)||[]).length,2);
choose('kind','normal');choose('size',sizeKey(normal));choose('kind','all');
assert.equal(els.state.value,'playing');assert.equal(els.sort.value,'recent');assert.equal(els.size.value,'');assert.equal(els.level.value,'');
assert.deepEqual(Array.from(context.test.matching()),[jigsaw.start,normal.start]);
choose('state','all');
assert.equal(context.test.matching()[0],normal.start+1,'All-rule view includes completed puzzles and honors legacy date order');
assert.match(progressDate({lastPlayedAt:now},now).text,/最終プレイ：.*今日/);
assert.match(progressDate({lastPlayedAt:now-86400000},now).text,/昨日/);
assert.match(progressDate({updated:now},now).text,/記録日時：/);
assert.equal(progressDate({state:'playing',createdAt:now},now),null);
assert.equal(progressDate({lastPlayedAt:Infinity,updated:NaN},now),null);
assert.equal(progressDate({lastPlayedAt:8640000000000001},now),null);
assert.equal(lastPlayedTime({lastPlayedAt:NaN,updated:now}),now);
const previous=rows[0];
assert.equal(nextProgress(previous,previous.id,'playing',previous.lastPlayedAt,now+5000),null,'Idle polls do not change activity time');
assert.equal(nextProgress(previous,previous.id,'playing',previous.lastPlayedAt-1000,now),null,'Activity timestamps never move backwards');
const recent=nextProgress(previous,previous.id,'playing',now,now+1000);
assert.equal(recent.lastPlayedAt,now);assert.equal(recent.updated,previous.updated);assert.equal(recent.extra,'keep');assert.equal(previous.lastPlayedAt,now-3600000);
assert.equal(nextProgress(recent,recent.id,'done',now,now+2000).updated,now+2000);
console.log('PASS all-rule + existing state filter, recent order, page limit, historical/unknown dates, idle clock, metadata preservation.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
