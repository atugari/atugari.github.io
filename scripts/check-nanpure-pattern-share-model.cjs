// Problem links must survive sharing with no answers, progress or personal data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {c}=require('./collection-100k/engines.cjs').load();
Object.assign(c,{URL,btoa,atob});
vm.runInContext(fs.readFileSync('scripts/client-overrides/public/notebook/pattern-share-model.js','utf8'),c);
const model=c.NPShareModel,plain=v=>JSON.parse(JSON.stringify(v));
const clues=Array.from({length:81},(_,i)=>i%3?i%9+1:0),fragment=model.encode(clues);
assert.equal(fragment,'#p='+clues.join(''));assert.deepEqual(plain(model.decode(fragment)),{clues,layout:null});
for(const input of ['','#p=123','#p='+'1'.repeat(80)+'a','#m=e30','#m=AA','#m='+'a'.repeat(14000),'#p='+'0'.repeat(81)+'&solution=123'])assert.throws(()=>model.decode(input));
for(const input of [Array(80).fill(0),Array(81),Array(81).fill(10),Array(81).fill(-1)])assert.throws(()=>model.encode(input));
let checked=0;
for(const [sizes,links] of [[[9,9],[{parent:0,dx:0,dy:6}]],[[4,9],[{parent:0,dx:3,dy:2}]],[[9,4,6],[{parent:0,corner:'nw'},{parent:0,corner:'sw'}]],[Array(8).fill(25),Array.from({length:7},(_,i)=>({parent:i,corner:'se'}))]]){
 const layout=plain(c.NanpureMulti.mixedLayout('custom',sizes,links)),limits=layout.cells.map(()=>25);
 for(const b of layout.boards)for(const i of b.map)limits[i]=Math.min(limits[i],b.n);
 const values=limits.map((limit,i)=>i%3?Math.min(limit,12):0),hash=model.encode(values,layout),decoded=plain(model.decode(hash));
 const expected=new Map(layout.cells.map((cell,i)=>[cell.x+','+cell.y,values[i]]));
 assert.equal(decoded.layout.width,layout.width);assert.equal(decoded.layout.height,layout.height);
 decoded.layout.cells.forEach((cell,i)=>assert.equal(decoded.clues[i],expected.get(cell.x+','+cell.y)));
 assert.deepEqual(decoded.layout.boards.map(b=>[b.x,b.y,b.n,b.blockRows,b.blockCols]),layout.boards.map(b=>[b.x,b.y,b.n,b.blockRows,b.blockCols]));
 assert.equal(model.encode(decoded.clues,decoded.layout),hash);assert(hash.length<14000);
 const payload=JSON.parse(atob(hash.slice(3).replaceAll('-','+').replaceAll('_','/')));assert.deepEqual(Object.keys(payload).sort(),['b','d','v']);
 const bad=plain(layout);bad.boards[0].map[0]=-1;assert.throws(()=>model.encode(values,bad));
 const wrong=values.slice();wrong[layout.boards[0].map[0]]=26;assert.throws(()=>model.encode(wrong,layout));
 checked++;
}
const url='https://atugari.github.io/nanpure/share.html'+fragment,text='問題です！ & # ? 😀',links=model.links(text,url);
assert.equal(new URL(links.x).origin,'https://x.com');assert.equal(new URL(links.x).searchParams.get('text'),text);assert.equal(new URL(links.x).searchParams.get('url'),url);
assert.equal(new URL(links.line).origin,'https://line.me');assert.equal(new URL(links.line).searchParams.get('text'),text+'\n'+url);
assert(!new URL(model.links('',url).x).searchParams.has('text'));
console.log('PASS portable puzzle links: exact clues, '+checked+' mixed/large multi layouts, malformed inputs, and encoded X/LINE composers; no solutions or progress');
