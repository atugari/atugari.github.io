/* Portable links contain the givens, board geometry, and the rules needed to play. */
(function(root){
 'use strict';
 const digits='0123456789abcdefghijklmnop';
 const rules=Object.freeze({diagonal:'対角線ナンプレ',hyper:'ハイパーナンプレ',antiknight:'アンチナイトナンプレ',antiking:'アンチキングナンプレ',disjoint:'ディスジョイントナンプレ'});
 const maxFragment=14000;
 function boardRule(rule,n){
  if(rule===undefined||rule==='normal')return undefined;
  if(n!==9||typeof rule!=='string'||!Object.hasOwn(rules,rule))throw Error('Invalid board rule');
  return rule;
 }
 function cluesOf(value,length,max){
  if(!Array.isArray(value)||value.length!==length||Array.from(value).some(n=>!Number.isInteger(n)||n<0||n>max))throw Error('Invalid clues');
  return value.slice();
 }
 function layoutOf(spec,version=2){
  const legacy=version===1,extent=legacy?256:7500;
  if(!Array.isArray(spec)||spec.length<2||spec.length>(legacy?8:300))throw Error('Invalid boards');
  const positions=new Map();let width=0,height=0;
  const boards=spec.map(b=>{
   if(!Array.isArray(b)||(b.length!==5&&(legacy||b.length!==6))||b.slice(0,5).some(v=>!Number.isInteger(v)))throw Error('Invalid board');
   const [x,y,n,blockRows,blockCols,rawRule]=b,rule=boardRule(rawRule,n);
   if(x<0||y<0||n<4||n>25||blockRows<1||blockCols<1||blockRows*blockCols!==n||x+n>extent||y+n>extent||rule&&(blockRows!==3||blockCols!==3))throw Error('Invalid board');
   width=Math.max(width,x+n);height=Math.max(height,y+n);
   for(let r=0;r<n;r++)for(let c=0;c<n;c++)positions.set((x+c)+','+(y+r),{x:x+c,y:y+r});
   return {x,y,n,blockRows,blockCols,...(rule?{rule}:{})};
  });
  if(positions.size>(legacy?5000:187500))throw Error('Too many cells');
  const cells=[...positions.values()].sort((a,b)=>a.y-b.y||a.x-b.x),indices=new Map(cells.map((c,i)=>[c.x+','+c.y,i]));
  for(const b of boards)b.map=Array.from({length:b.n*b.n},(_,i)=>indices.get((b.x+i%b.n)+','+(b.y+Math.floor(i/b.n))));
  return {width,height,cells,boards};
 }
 function boardSpec(board){
  const {x,y,n=9,blockRows=3,blockCols=3}=board,rule=boardRule(board.rule,n);
  return [x,y,n,blockRows,blockCols,...(rule?[rule]:[])];
 }
 function validateMulti(clues,layout){
  if(!layout||!Array.isArray(layout.cells)||!Array.isArray(layout.boards))throw Error('Invalid layout');
  const linked=layoutOf(layout.boards.map(boardSpec)),values=cluesOf(clues,linked.cells.length,25);
  if(layout.width!==linked.width||layout.height!==linked.height||layout.cells.length!==linked.cells.length)throw Error('Invalid dimensions');
  const byPosition=new Map();
  layout.cells.forEach((c,i)=>{if(!c||!Number.isInteger(c.x)||!Number.isInteger(c.y)||byPosition.has(c.x+','+c.y))throw Error('Invalid cells');byPosition.set(c.x+','+c.y,values[i]);});
  const canonical=linked.cells.map(c=>{const v=byPosition.get(c.x+','+c.y);if(v===undefined)throw Error('Missing cell');return v;});
  linked.boards.forEach((b,at)=>{const original=layout.boards[at];if(!Array.isArray(original.map)||original.map.length!==b.n*b.n)throw Error('Invalid map');b.map.forEach((i,k)=>{const c=linked.cells[i],old=original.map[k];if(!Number.isInteger(old)||layout.cells[old]?.x!==c.x||layout.cells[old]?.y!==c.y||canonical[i]>b.n)throw Error('Invalid map or digit');});});
  return {clues:canonical,layout:linked};
 }
 function encode(clues,layout=null){
  if(!layout)return '#p='+cluesOf(clues,81,9).join('');
  if(Array.isArray(clues)&&4*Math.ceil(clues.length/3)+3>maxFragment)throw Object.assign(Error('The share link is too long.'),{code:'NP_SHARE_TOO_LONG'});
  const clean=validateMulti(clues,layout),{width,height,cells,boards}=clean.layout;
  const legacy=boards.length<=8&&width<=256&&height<=256&&cells.length<=5000&&boards.every(b=>!b.rule);
  const data={v:legacy?1:2,b:boards.map(boardSpec),d:clean.clues.map(n=>digits[n]).join('')};
  const fragment='#m='+btoa(JSON.stringify(data)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(fragment.length>maxFragment)throw Object.assign(Error('The share link is too long.'),{code:'NP_SHARE_TOO_LONG'});
  return fragment;
 }
 function decode(fragment){
  if(typeof fragment!=='string'||fragment.length>maxFragment)throw Error('Invalid problem link');
  if(/^#p=[0-9]{81}$/.test(fragment))return {clues:fragment.slice(3).split('').map(Number),layout:null};
  if(!/^#m=[A-Za-z0-9_-]+$/.test(fragment))throw Error('Invalid problem link');
  const encoded=fragment.slice(3).replaceAll('-','+').replaceAll('_','/'),data=JSON.parse(atob(encoded+'='.repeat((4-encoded.length%4)%4)));
  if(![1,2].includes(data?.v)||typeof data.d!=='string'||!/^[0-9a-p]+$/.test(data.d))throw Error('Invalid problem data');
  const layout=layoutOf(data.b,data.v),clues=cluesOf(data.d.split('').map(n=>digits.indexOf(n)),layout.cells.length,25);
  for(const b of layout.boards)if(b.map.some(i=>clues[i]>b.n))throw Error('Invalid digit');
  return {clues,layout};
 }
 function links(text,url){
  const x=new URL('https://x.com/intent/tweet');if(text)x.searchParams.set('text',text);x.searchParams.set('url',url);
  const line=new URL('https://line.me/R/share');line.searchParams.set('text',[text,url].filter(Boolean).join('\n'));
  return {x:x.href,line:line.href};
 }
 root.NPShareModel={encode,decode,links,validateMulti,ruleLabel:rule=>Object.hasOwn(rules,rule)?rules[rule]:'ふつうのナンプレ'};
})(typeof window!=='undefined'?window:globalThis);
