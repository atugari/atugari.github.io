/* Portable problem links contain initial clues and board geometry only. */
(function(root){
 'use strict';
 const digits='0123456789abcdefghijklmnop';
 function cluesOf(value,length,max){
  if(!Array.isArray(value)||value.length!==length||Array.from(value).some(n=>!Number.isInteger(n)||n<0||n>max))throw Error('Invalid clues');
  return value.slice();
 }
 function layoutOf(spec){
  if(!Array.isArray(spec)||spec.length<2||spec.length>8)throw Error('Invalid boards');
  const positions=new Map();let width=0,height=0;
  const boards=spec.map(b=>{
   if(!Array.isArray(b)||b.length!==5||b.some(v=>!Number.isInteger(v)))throw Error('Invalid board');
   const [x,y,n,blockRows,blockCols]=b;
   if(x<0||y<0||n<4||n>25||blockRows<1||blockCols<1||blockRows*blockCols!==n||x+n>256||y+n>256)throw Error('Invalid board');
   width=Math.max(width,x+n);height=Math.max(height,y+n);
   for(let r=0;r<n;r++)for(let c=0;c<n;c++)positions.set((x+c)+','+(y+r),{x:x+c,y:y+r});
   return {x,y,n,blockRows,blockCols};
  });
  if(positions.size>5000)throw Error('Too many cells');
  const cells=[...positions.values()].sort((a,b)=>a.y-b.y||a.x-b.x),indices=new Map(cells.map((c,i)=>[c.x+','+c.y,i]));
  for(const b of boards)b.map=Array.from({length:b.n*b.n},(_,i)=>indices.get((b.x+i%b.n)+','+(b.y+Math.floor(i/b.n))));
  return {width,height,cells,boards};
 }
 function validateMulti(clues,layout){
  if(!layout||!Array.isArray(layout.cells)||!Array.isArray(layout.boards))throw Error('Invalid layout');
  const linked=layoutOf(layout.boards.map(b=>[b.x,b.y,b.n||9,b.blockRows||3,b.blockCols||3])),values=cluesOf(clues,linked.cells.length,25);
  if(layout.width!==linked.width||layout.height!==linked.height||layout.cells.length!==linked.cells.length)throw Error('Invalid dimensions');
  const byPosition=new Map();
  layout.cells.forEach((c,i)=>{if(!c||!Number.isInteger(c.x)||!Number.isInteger(c.y)||byPosition.has(c.x+','+c.y))throw Error('Invalid cells');byPosition.set(c.x+','+c.y,values[i]);});
  const canonical=linked.cells.map(c=>{const v=byPosition.get(c.x+','+c.y);if(v===undefined)throw Error('Missing cell');return v;});
  linked.boards.forEach((b,at)=>{const original=layout.boards[at];if(!Array.isArray(original.map)||original.map.length!==b.n*b.n)throw Error('Invalid map');b.map.forEach((i,k)=>{const c=linked.cells[i],old=original.map[k];if(!Number.isInteger(old)||layout.cells[old]?.x!==c.x||layout.cells[old]?.y!==c.y||canonical[i]>b.n)throw Error('Invalid map or digit');});});
  return {clues:canonical,layout:linked};
 }
 function encode(clues,layout=null){
  if(!layout)return '#p='+cluesOf(clues,81,9).join('');
  const clean=validateMulti(clues,layout),data={v:1,b:clean.layout.boards.map(b=>[b.x,b.y,b.n,b.blockRows,b.blockCols]),d:clean.clues.map(n=>digits[n]).join('')};
  return '#m='+btoa(JSON.stringify(data)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 }
 function decode(fragment){
  if(typeof fragment!=='string'||fragment.length>14000)throw Error('Invalid problem link');
  if(/^#p=[0-9]{81}$/.test(fragment))return {clues:fragment.slice(3).split('').map(Number),layout:null};
  if(!/^#m=[A-Za-z0-9_-]+$/.test(fragment))throw Error('Invalid problem link');
  const encoded=fragment.slice(3).replaceAll('-','+').replaceAll('_','/'),data=JSON.parse(atob(encoded+'='.repeat((4-encoded.length%4)%4)));
  if(data?.v!==1||typeof data.d!=='string'||!/^[0-9a-p]+$/.test(data.d))throw Error('Invalid problem data');
  const layout=layoutOf(data.b),clues=cluesOf(data.d.split('').map(n=>digits.indexOf(n)),layout.cells.length,25);
  for(const b of layout.boards)if(b.map.some(i=>clues[i]>b.n))throw Error('Invalid digit');
  return {clues,layout};
 }
 function links(text,url){
  const x=new URL('https://x.com/intent/tweet');if(text)x.searchParams.set('text',text);x.searchParams.set('url',url);
  const line=new URL('https://line.me/R/share');line.searchParams.set('text',[text,url].filter(Boolean).join('\n'));
  return {x:x.href,line:line.href};
 }
 root.NPShareModel={encode,decode,links,validateMulti};
})(typeof window!=='undefined'?window:globalThis);
