/* Exact 9x9 solution counting. Candidate generation and difficulty grading stay unchanged. */
(function(root){
 'use strict';
 const normal=root.Nanpure;
 if(!normal||normal.fastUniqueVersion===1)return;
 const legacyCount=normal.countSolutions;
 const rows=new Uint8Array(81),cols=new Uint8Array(81),boxes=new Uint8Array(81);
 const units=Array.from({length:27},()=>[]),peers=[];
 const sizes=new Uint8Array(1024);
 for(let mask=1;mask<1024;mask++)sizes[mask]=sizes[mask>>>1]+(mask&1);
 for(let i=0;i<81;i++){
  const row=i/9|0,col=i%9,box=(row/3|0)*3+(col/3|0);
  rows[i]=row;cols[i]=col;boxes[i]=box;
  units[row].push(i);units[9+col].push(i);units[18+box].push(i);
 }
 for(let i=0;i<81;i++){
  peers.push([...new Set([...units[rows[i]],...units[9+cols[i]],...units[18+boxes[i]]])].filter(j=>j!==i));
 }
 function countSolutions(grid,limit){
  // Preserve the public two-dimensional-grid contract, including the old fallback
  // for unsupported inputs and the historical omitted/zero-limit default of two.
  if(!grid||grid.length!==9||Array.from(grid).some(row=>!row||row.length!==9))return legacyCount(grid,limit);
  limit=limit||2;
  if(limit<=0)return 0;
  const filled=new Uint8Array(81),masks=new Uint16Array(81),used=new Uint16Array(27);
  const trailCells=[],trailMasks=[],pending=[];
  let remaining=81,found=0;
  for(let i=0;i<81;i++){
   const value=grid[rows[i]][cols[i]];
   if(!Number.isInteger(value)||value<0||value>9)return 0;
   if(!value)continue;
   const bit=1<<value,row=rows[i],col=9+cols[i],box=18+boxes[i];
   if((used[row]|used[col]|used[box])&bit)return 0;
   filled[i]=1;remaining--;used[row]|=bit;used[col]|=bit;used[box]|=bit;
  }
  for(let i=0;i<81;i++)if(!filled[i]){
   const mask=1022&~(used[rows[i]]|used[9+cols[i]]|used[18+boxes[i]]);
   if(!mask)return 0;
   masks[i]=mask;
   if(!(mask&(mask-1)))pending.push(i);
  }
  function change(i,mask){trailCells.push(i);trailMasks.push(masks[i]);masks[i]=mask;}
  function restore(length){
   while(trailCells.length>length){
    const i=trailCells.pop(),old=trailMasks.pop();
    if(!masks[i]&&old)remaining++;
    masks[i]=old;
   }
  }
  function propagate(queue){
   for(let cursor=0;cursor<queue.length;cursor++){
    const i=queue[cursor],bit=masks[i];
    if(!bit||(bit&(bit-1)))continue;
    change(i,0);remaining--;
    for(const peer of peers[i])if(masks[peer]&bit){
     const mask=masks[peer]&~bit;
     if(!mask)return false;
     change(peer,mask);
     if(!(mask&(mask-1)))queue.push(peer);
    }
   }
   return true;
  }
  function search(queue){
   const start=trailCells.length;
   if(!propagate(queue)){restore(start);return;}
   if(!remaining){found++;restore(start);return;}
   let cell=-1,smallest=10;
   for(let i=0;i<81;i++)if(masks[i]){
    const size=sizes[masks[i]];
    if(size<smallest){smallest=size;cell=i;if(size===2)break;}
   }
   let options=masks[cell];
   while(options&&found<limit){
    const bit=options&-options;options^=bit;
    const branch=trailCells.length;
    change(cell,bit);search([cell]);restore(branch);
   }
   restore(start);
  }
  search(pending);
  return found;
 }
 normal.countSolutions=countSolutions;
 normal.hasUniqueSolution=grid=>countSolutions(grid,2)===1;
 Object.defineProperty(normal,'fastUniqueVersion',{value:1,configurable:true});
})(typeof window!=='undefined'?window:typeof self!=='undefined'?self:globalThis);
