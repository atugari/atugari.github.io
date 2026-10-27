// Normal magic squares: every number 1..n² occurs once; both diagonals count.
// This module is shared by the generation worker and the read-only previews.
(function(root){
 'use strict';
 const sizes=Object.freeze([3,4,5]),blankStyles=Object.freeze(['few','standard','many']);
 const cache=new Map();
 function spec(n){
  if(!sizes.includes(n))throw Error('MAGIC_SIZE');
  if(cache.has(n))return cache.get(n);
  const lines=[];
  for(let r=0;r<n;r++)lines.push(Array.from({length:n},(_,c)=>r*n+c));
  for(let c=0;c<n;c++)lines.push(Array.from({length:n},(_,r)=>r*n+c));
  lines.push(Array.from({length:n},(_,i)=>i*n+i),Array.from({length:n},(_,i)=>i*n+n-1-i));
  const cells=Array.from({length:n*n},()=>[]);
  lines.forEach((line,index)=>line.forEach(cell=>cells[cell].push(index)));
  const result={n,total:n*n,target:n*(n*n+1)/2,lines,cells};cache.set(n,result);return result;
 }
 function validNumbers(values,n,partial=false){
  const total=spec(n).total;
  if(!Array.isArray(values)||values.length!==total)return false;
  let used=0;
  for(const value of values){
   if(!Number.isInteger(value)||value<(partial?0:1)||value>total)return false;
   if(!value)continue;
   const bit=1<<(value-1);if(used&bit)return false;used|=bit;
  }
  return true;
 }
 function validSolution(values,n){
  return validNumbers(values,n)&&spec(n).lines.every(line=>line.reduce((sum,cell)=>sum+values[cell],0)===spec(n).target);
 }
 function validate(p){
  if(!p||p.kind!=='magic-square'||p.version!==1||!sizes.includes(p.n)||p.target!==spec(p.n).target||!validSolution(p.solution,p.n)||!validNumbers(p.puzzle,p.n,true)||!p.puzzle.includes(0)||p.puzzle.some((value,i)=>value&&value!==p.solution[i])||p.blanks!==p.puzzle.filter(v=>!v).length||!blankStyles.includes(p.blankStyle)||!Number.isInteger(p.requestedBlanks)||p.requestedBlanks<p.blanks||p.requestedBlanks>=p.n*p.n||!Number.isInteger(p.seed)||p.seed<0||p.seed>4294967295)throw Error('MAGIC_INVALID_DATA');
  return p;
 }
 function countSolutions(puzzle,n,{limit=2,maxNodes=100000}={}){
  const s=spec(n);
  if(!Number.isInteger(limit)||limit<1||!Number.isInteger(maxNodes)||maxNodes<0)throw Error('MAGIC_LIMIT');
  if(!validNumbers(puzzle,n,true))return{count:0,complete:true,nodes:0,solution:null};
  const grid=puzzle.slice(),sum=s.lines.map(()=>0),left=s.lines.map(()=>n);
  let used=0,empty=0,nodes=0,count=0,aborted=false,solution=null;
  grid.forEach((value,cell)=>{if(!value){empty++;return}used|=1<<(value-1);for(const line of s.cells[cell]){sum[line]+=value;left[line]--;}});
  function search(mask,remaining){
   if(count>=limit||aborted)return;
   if(remaining===0){if(sum.every(value=>value===s.target)){count++;if(!solution)solution=grid.slice()}return;}
   if(++nodes>maxNodes){aborted=true;return;}
   const available=[];for(let value=1;value<=s.total;value++)if(!(mask&(1<<(value-1))))available.push(value);
   const prefix=[0];for(const value of available)prefix.push(prefix[prefix.length-1]+value);
   const m=available.length;
   for(let line=0;line<left.length;line++){
    const k=left[line],need=s.target-sum[line];
    if(need<prefix[k]||need>prefix[m]-prefix[m-k])return;
   }
   let chosen=-1,candidates=null;
   for(let cell=0;cell<grid.length;cell++){
    if(grid[cell])continue;
    const values=[];
    for(let index=0;index<m;index++){
     const value=available[index];let valid=true;
     for(const line of s.cells[cell]){
      const k=left[line]-1,need=s.target-sum[line]-value;
      const low=prefix[k+(index<k?1:0)]-(index<k?value:0);
      const high=prefix[m]-prefix[m-k-(index>=m-k?1:0)]-(index>=m-k?value:0);
      if(need<low||need>high){valid=false;break;}
     }
     if(valid)values.push(value);
    }
    if(!values.length)return;
    if(!candidates||values.length<candidates.length){chosen=cell;candidates=values;if(values.length===1)break;}
   }
   for(const value of candidates){
    grid[chosen]=value;for(const line of s.cells[chosen]){sum[line]+=value;left[line]--;}
    search(mask|(1<<(value-1)),remaining-1);
    for(const line of s.cells[chosen]){sum[line]-=value;left[line]++;}grid[chosen]=0;
    if(aborted||count>=limit)break;
   }
  }
  search(used,empty);return{count,complete:!aborted,nodes,solution};
 }
 function random(seed){let state=seed>>>0;return()=>{state=(state+0x6d2b79f5)>>>0;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};}
 function shuffled(values,rng){const result=values.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
 function makeSolution(n,rng){
  const total=n*n,base=Array(total).fill(0);
  if(n%2){
   let row=0,column=Math.floor(n/2);
   for(let value=1;value<=total;value++){
    base[row*n+column]=value;
    const nextRow=(row+n-1)%n,nextColumn=(column+1)%n;
    if(base[nextRow*n+nextColumn])row=(row+1)%n;else{row=nextRow;column=nextColumn;}
   }
  }else for(let cell=0;cell<total;cell++){
   const row=Math.floor(cell/n),column=cell%n,value=cell+1;
   base[cell]=row%4===column%4||row%4+column%4===3?total+1-value:value;
  }
  // Applying the same reflection-symmetric permutation to rows and columns
  // preserves every row, column and diagonal sum.
  const half=Math.floor(n/2),pairs=shuffled(Array.from({length:half},(_,i)=>i),rng),perm=Array(n);
  for(let i=0;i<half;i++){const value=rng()<.5?pairs[i]:n-1-pairs[i];perm[i]=value;perm[n-1-i]=n-1-value;}if(n%2)perm[half]=half;
  const transpose=rng()<.5,complement=rng()<.5;
  return Array.from({length:total},(_,cell)=>{const r=Math.floor(cell/n),c=cell%n,value=base[(transpose?perm[c]:perm[r])*n+(transpose?perm[r]:perm[c])];return complement?total+1-value:value;});
 }
 function generate({n=3,blankStyle='standard',seed=1,maxNodes=40000}={}){
  spec(n);if(!blankStyles.includes(blankStyle)||!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('MAGIC_OPTIONS');
  const rng=random(seed),solution=makeSolution(n,rng),puzzle=solution.slice();
  if(!validSolution(solution,n))throw Error('MAGIC_SOLUTION');
  const requested=Math.round(n*n*({few:.35,standard:.5,many:.65}[blankStyle]));
  let blanks=0;
  for(const cell of shuffled(Array.from({length:n*n},(_,i)=>i),rng)){
   if(blanks>=requested)break;
   const old=puzzle[cell];puzzle[cell]=0;
   const proof=countSolutions(puzzle,n,{maxNodes});
   if(proof.complete&&proof.count===1)blanks++;else puzzle[cell]=old;
  }
  if(!blanks)throw Error('MAGIC_GENERATION');
  const record={kind:'magic-square',version:1,n,target:spec(n).target,puzzle,solution,blankStyle,requestedBlanks:requested,blanks,seed};
  validate(record);return record;
 }
 root.NPMagicSquare=Object.freeze({sizes,blankStyles,validate,validSolution,countSolutions,generate});
})(typeof window!=='undefined'?window:globalThis);
