// Exercise the actual solver against an independent enumerator, including
// multiple solutions and exhausted budgets (which must never certify uniqueness).
const assert=require('node:assert/strict'),fs=require('node:fs');
require('./client-overrides/public/notebook/magic-square-engine.js');
const magic=globalThis.NPMagicSquare;
function lines(n){const out=[];for(let r=0;r<n;r++)out.push(Array.from({length:n},(_,c)=>r*n+c));for(let c=0;c<n;c++)out.push(Array.from({length:n},(_,r)=>r*n+c));out.push(Array.from({length:n},(_,i)=>i*n+i),Array.from({length:n},(_,i)=>i*n+n-1-i));return out;}
function valid(values,n){return new Set(values).size===n*n&&values.every(v=>Number.isInteger(v)&&v>=1&&v<=n*n)&&lines(n).every(line=>line.reduce((s,i)=>s+values[i],0)===n*(n*n+1)/2);}
function enumerate(givens,n,limit=Infinity){
 const grid=givens.slice(),used=new Set(grid.filter(Boolean)),ranges=lines(n),target=n*(n*n+1)/2;let count=0;
 function walk(){
  for(const line of ranges){let sum=0,blank=false;for(const cell of line){sum+=grid[cell];blank||=!grid[cell];}if(sum>target||!blank&&sum!==target)return;}
  const cell=grid.indexOf(0);if(cell<0){count++;return;}
  for(let value=1;value<=n*n&&count<limit;value++)if(!used.has(value)){grid[cell]=value;used.add(value);walk();used.delete(value);}grid[cell]=0;
 }
 walk();return count;
}
let tested=0;
for(const n of [3,4,5])for(const blankStyle of ['few','standard','many'])for(let seed=0;seed<50;seed++){
 const p=magic.generate({n,blankStyle,seed});assert(valid(p.solution,n));assert(p.puzzle.includes(0));assert.equal(p.puzzle.filter(v=>!v).length,p.blanks);assert(p.blanks<=p.requestedBlanks);assert(p.puzzle.every((v,i)=>!v||v===p.solution[i]));
 const proof=magic.countSolutions(p.puzzle,n,{maxNodes:500000});assert.equal(proof.complete,true);assert.equal(proof.count,1);assert.deepEqual(proof.solution,p.solution);assert.deepEqual(magic.generate({n,blankStyle,seed}),p,'seeds are reproducible');tested++;
}
assert.equal(enumerate(Array(9).fill(0),3),8);assert.equal(magic.countSolutions(Array(9).fill(0),3,{limit:9}).count,8);
for(let seed=0;seed<20;seed++){
 const p=magic.generate({n:3,blankStyle:'many',seed});
 for(const cell of [0,2,5,8]){const clues=p.puzzle.slice();clues[cell]=0;assert.equal(magic.countSolutions(clues,3,{limit:9}).count,enumerate(clues,3));}
}
for(const blankStyle of ['few','standard','many'])for(let seed=0;seed<4;seed++){const p=magic.generate({n:4,blankStyle,seed});assert.equal(enumerate(p.puzzle,4,2),1,'independent 4×4 uniqueness');}
const exhausted=magic.countSolutions(Array(9).fill(0),3,{maxNodes:0});assert.equal(exhausted.complete,false);assert.equal(exhausted.count,0);
assert.throws(()=>magic.generate({n:3,maxNodes:0}));assert.equal(magic.countSolutions([1,1,0,0,0,0,0,0,0],3).count,0);
assert.equal(magic.validSolution([1,5,9,6,7,2,8,3,4],3),false,'row/column-only square fails the two diagonal rules');
const good=magic.generate();for(const corrupt of [{...good,blanks:'<img onerror=alert(1)>'},{...good,solution:good.solution.map(v=>v===1?2:v)},{...good,target:1},{...good,n:6},{...good,puzzle:good.solution}])assert.throws(()=>magic.validate(corrupt));
for(const n of [2,6,9,NaN])assert.throws(()=>magic.generate({n}));
assert(fs.readFileSync('scripts/client-overrides/lib/backup.ts','utf8').includes("'np-magic-square-v1'"),'magic questions travel with website backups');
console.log('PASS magic squares:',tested,'generated puzzles; independent 3×3/4×4 enumeration, both diagonals, reproducibility, malformed data and budget exhaustion');
