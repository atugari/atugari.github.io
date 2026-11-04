// Independent checks for exact counting; the difficulty engines and seed stream remain untouched.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))).version;
const base=path.join(root,'nanpure/releases',version,'notebook'),html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const normal=html.match(/<script id="core-normal">([\s\S]*?)<\/script>/)?.[1];assert(normal,'normal worker source');
const source=fs.readFileSync(path.join(root,'scripts/client-overrides/public/notebook/unique-solver.js'),'utf8');
const inline=html.match(/<script id="core-unique-solver">([\s\S]*?)<\/script>/)?.[1];
if(!process.argv.includes('--source'))assert.equal(inline,source,'shipped worker counter matches its reviewed source');
const context=vm.createContext({console,Date,performance,Uint8Array,Uint16Array});context.window=context;context.self=context;context.global=context;
vm.runInContext(normal,context);const legacy=context.Nanpure.countSolutions;
vm.runInContext(process.argv.includes('--source')?source:inline,context,{filename:'unique-solver.js'});
const count=context.Nanpure.countSolutions,unique=context.Nanpure.hasUniqueSolution;
assert.notEqual(count,legacy);assert.equal(context.Nanpure.fastUniqueVersion,1);
vm.runInContext(source,context);assert.equal(context.Nanpure.countSolutions,count,'idempotent registration');
function oracle(source,limit=2){
 const grid=source.map(row=>Array.from(row));let total=0;
 function valid(row,col,value){
  for(let k=0;k<9;k++)if(k!==col&&grid[row][k]===value||k!==row&&grid[k][col]===value)return false;
  for(let r=row-row%3;r<row-row%3+3;r++)for(let c=col-col%3;c<col-col%3+3;c++)if((r!==row||c!==col)&&grid[r][c]===value)return false;
  return true;
 }
 for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!Number.isInteger(grid[r][c])||grid[r][c]<0||grid[r][c]>9||grid[r][c]&&!valid(r,c,grid[r][c]))return 0;
 function visit(){
  let best;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!grid[r][c]){
   const choices=[];for(let value=1;value<=9;value++)if(valid(r,c,value))choices.push(value);
   if(!choices.length)return;
   if(!best||choices.length<best.choices.length)best={r,c,choices};
  }
  if(!best){total++;return;}
  for(const value of best.choices){grid[best.r][best.c]=value;visit();grid[best.r][best.c]=0;if(total>=limit)return;}
 }
 visit();return total;
}
const completed=Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>(r*3+(r/3|0)+c)%9+1));
const empty=completed.map(row=>row.map(()=>0));
assert.equal(count(completed),1);assert.equal(count(empty,3),3);assert.equal(unique(completed),true);assert.equal(unique(empty),false);
let state=173;const random=()=>{state=Math.imul(state,1664525)+1013904223|0;return(state>>>0)/4294967296;};
let compared=0;const samples=[];
for(let k=0;k<120;k++){
 const grid=completed.map(row=>row.slice());
 for(let i=0;i<81;i++)if(random()<.35+k%5*.12)grid[i/9|0][i%9]=0;
 if(k%3===0){const i=random()*81|0;grid[i/9|0][i%9]=(random()*9|0)+1;}
 const before=JSON.stringify(grid),expected=oracle(grid);assert.equal(count(grid),expected,'independent oracle case '+k);assert.equal(unique(grid),expected===1);assert.equal(JSON.stringify(grid),before,'input retained');compared++;
 if(k%3!==0&&samples.length<5)samples.push(grid);
}
for(const limit of [undefined,null,0,-1,1,2,2.5,3,'2',true])for(const grid of [completed,...samples])assert.equal(count(grid,limit),legacy(grid,limit),'legacy valid-input limit semantics');
for(const value of [10,-1,NaN,1.5,'1',null]){const grid=empty.map(row=>row.slice());grid[0][0]=value;assert.equal(count(grid),0,'invalid value is rejected');}
for(const [a,b] of [[0,1],[0,9],[0,10]]){const grid=empty.map(row=>row.slice());grid[a/9|0][a%9]=grid[b/9|0][b%9]=1;assert.equal(count(grid),0,'duplicate givens are rejected');}
const stock=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(root,'nanpure/collection/data/C149/0000.gz.b64'),'utf8'),'base64')));
for(const item of stock){const puzzle=item.puzzle,grid=Array.from({length:9},(_,r)=>puzzle.puzzle.slice(r*9,r*9+9));assert.equal(puzzle.level,18);assert.equal(count(grid),1,'published level18 remains unique: '+puzzle.id);assert.equal(count(grid),legacy(grid),'published level18 legacy agreement');}
let otherHighCount=0;
for(const [cid,level] of [['C146',15],['C147',16],['C148',17]]){
 const records=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(root,'nanpure/collection/data',cid,'0000.gz.b64'),'utf8'),'base64')));
 for(const item of records){const puzzle=item.puzzle,grid=Array.from({length:9},(_,r)=>puzzle.puzzle.slice(r*9,r*9+9));assert.equal(puzzle.level,level);assert.equal(count(grid),1,'published high-level unique: '+puzzle.id);assert.equal(count(grid),legacy(grid),'published high-level legacy agreement');otherHighCount++;}
}
const hard=stock[0].puzzle;const impossible=Array.from({length:9},(_,r)=>hard.puzzle.slice(r*9,r*9+9));
let wrong=false;
for(let i=0;i<81&&!wrong;i++)if(!hard.puzzle[i])for(let value=1;value<=9;value++){
 const r=i/9|0,c=i%9;if(value===hard.solution[i])continue;
 if(impossible[r].includes(value)||impossible.some(row=>row[c]===value))continue;
 let conflict=false;for(let a=r-r%3;a<r-r%3+3;a++)for(let b=c-c%3;b<c-c%3+3;b++)if(impossible[a][b]===value)conflict=true;
 if(!conflict){impossible[r][c]=value;wrong=true;break;}
}
assert(wrong);assert.equal(count(impossible),0,'locally legal but globally impossible');assert.equal(oracle(impossible),0,'independent impossible proof');
assert.throws(()=>count([]));
console.log('PASS fast exact9 counter: '+compared+' independent cases, semantic limits, contradictory/invalid givens, immutable inputs and '+stock.length+' published level18 puzzles and '+otherHighCount+' published level15–17 puzzles');
