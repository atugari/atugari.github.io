/* Exact givens masks for classic 9x9. Search exhaustion is never an impossibility proof. */
(function(root){
 'use strict';
 function create(){
  const ALL=511,box=i=>Math.floor(i/27)*3+Math.floor(i%9/3),pop=n=>{let c=0;for(;n;n&=n-1)c++;return c;};
  const maskOf=mask=>{if(!Array.isArray(mask)||mask.length!==81||mask.some(v=>![true,false,0,1].includes(v)))throw Error('Invalid mask');return mask.map(Boolean);};
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  function solve(input,{limit=2,random=false,deadline=Infinity,maxNodes=200000}={}){
   const grid=input.slice(),rows=new Uint16Array(9),cols=new Uint16Array(9),boxes=new Uint16Array(9);let count=0,nodes=0,solution=null,aborted=false;
   for(let i=0;i<81;i++){const v=grid[i];if(!Number.isInteger(v)||v<0||v>9)return{count:0,invalid:true};if(!v)continue;const bit=1<<(v-1),r=Math.floor(i/9),c=i%9,b=box(i);if((rows[r]|cols[c]|boxes[b])&bit)return{count:0,invalid:true};rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;}
   function visit(){
    if(++nodes>maxNodes||(nodes%128===0&&Date.now()>=deadline)){aborted=true;return;}
    let at=-1,bits=0,best=10,ties=0;
    for(let i=0;i<81;i++)if(!grid[i]){const m=ALL&~(rows[Math.floor(i/9)]|cols[i%9]|boxes[box(i)]),n=pop(m);if(!n)return;if(n<best||(random&&n===best&&Math.random()<1/++ties)){at=i;bits=m;if(n<best)ties=1;best=n;if(n===1)break;}}
    if(at<0){count++;if(!solution)solution=grid.slice();return;}
    const r=Math.floor(at/9),c=at%9,b=box(at),values=[];for(let m=bits;m;m&=m-1)values.push(m&-m);if(random)shuffle(values);
    for(const bit of values){grid[at]=Math.log2(bit)+1;rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;visit();grid[at]=0;rows[r]^=bit;cols[c]^=bit;boxes[b]^=bit;if(count>=limit||aborted)return;}
   }
   visit();return{count,solution,nodes,aborted};
  }
  // One omitted digit needs one unpainted cell per row, column and box.
  function digitPlacements(mask,firstOnly=false){
   const result=[],cells=[];function visit(r,cols,boxes){if(r===9){result.push(cells.slice());return firstOnly;}for(let c=0;c<9;c++){const i=r*9+c,b=box(i);if(mask[i]||(cols&(1<<c))||(boxes&(1<<b)))continue;cells.push(i);const stop=visit(r+1,cols|1<<c,boxes|1<<b);cells.pop();if(stop)return true;}return false;}
   visit(0,0,0);return result;
  }
  function analyze(input,omit=0){
   const mask=maskOf(input),count=mask.filter(Boolean).length;
   if(!Number.isInteger(omit)||omit<0||omit>9)throw Error('Invalid omitted digit');
   if(count<17)return{state:'impossible',reason:'few',count};
   if(count===81)return{state:'impossible',reason:'full',count};
   for(let band=0;band<3;band++){
    const rows=[0,1,2].filter(r=>!mask.slice((band*3+r)*9,(band*3+r+1)*9).some(Boolean));
    const cols=[0,1,2].filter(c=>!mask.some((v,i)=>v&&i%9===band*3+c));
    if(rows.length>=2)return{state:'impossible',reason:'rows',count};
    if(cols.length>=2)return{state:'impossible',reason:'cols',count};
   }
   if(omit&&!digitPlacements(mask,true).length)return{state:'impossible',reason:'digit',count};
   return{state:'unknown',count};
  }
  // Verified starting solutions make the included presets immediate; every result is still counted.
  const starts=["872156934694328517351497628218739465467581392935264871583972146129645783746813259", "986352147532471689714896352145739826879264531263518974657943218398127465421685793", "426587139981432576357619842238791654675243918194856723563128497742965381819374265"].map(s=>s.split('').map(Number));
  function search(input,omit=0,{milliseconds=2500,maxAttempts=20000,rate}={}){
   const mask=maskOf(input),analysis=analyze(mask,omit);if(analysis.state==='impossible')return analysis;
   const deadline=Date.now()+Math.max(0,milliseconds),placements=omit?digitPlacements(mask):null;let attempts=0;
   while(attempts<maxAttempts&&Date.now()<deadline){
    attempts++;let solution;
    if(attempts<=starts.length){
     const start=starts[attempts-1],digits=shuffle([1,2,3,4,5,6,7,8,9]);
     if(omit){const allowed=digits.filter(d=>!start.some((v,i)=>mask[i]&&v===d));if(!allowed.length)continue;const d=allowed[0],at=digits.indexOf(omit);[digits[at],digits[d-1]]=[digits[d-1],digits[at]];}
     solution=start.map(v=>digits[v-1]);
    }else{
     const seed=Array(81).fill(0);if(omit)for(const i of placements[Math.floor(Math.random()*placements.length)])seed[i]=omit;
     const full=solve(seed,{limit:1,random:true,deadline,maxNodes:30000});if(full.aborted||!full.count)continue;solution=full.solution;
    }
    const puzzle=solution.map((v,i)=>mask[i]?v:0),unique=solve(puzzle,{deadline,maxNodes:50000});
    if(unique.aborted||unique.count!==1)continue;
    const rating=rate?rate(Array.from({length:9},(_,r)=>puzzle.slice(r*9,r*9+9))):null;
    return{state:'ready',count:analysis.count,attempts,puzzle,solution,rating,mask:mask.map(Number),omittedDigit:omit};
   }
   return{state:'unknown',count:analysis.count,attempts};
  }
  function validate(result){
   if(!result||result.state!=='ready')throw Error('Pattern is not ready');
   const mask=maskOf(result.mask),omit=result.omittedDigit;
   if(analyze(mask,omit).state==='impossible'||!Array.isArray(result.puzzle)||!Array.isArray(result.solution)||result.puzzle.length!==81||result.solution.length!==81)throw Error('Invalid pattern result');
   if(result.puzzle.some((v,i)=>mask[i]?v<1||v>9||v!==result.solution[i]||v===omit:v!==0))throw Error('Pattern mismatch');
   const completed=solve(result.solution,{limit:1}),unique=solve(result.puzzle,{maxNodes:200000});
   if(completed.invalid||completed.count!==1||unique.aborted||unique.count!==1||unique.solution.some((v,i)=>v!==result.solution[i]))throw Error('Pattern must have exactly one solution');
   return true;
  }
  const fromRows=rows=>rows.join('').split('').map(v=>v==='1');
  const presets={
   heart:fromRows(['011000110','111101111','111111111','111111111','111111111','011111110','001111100','000111000','000010000']),
   diamond:fromRows(['000010000','000111000','001111100','011111110','111111111','011111110','001111100','000111000','000010000']),
   dots:Array.from({length:81},(_,i)=>(Math.floor(i/9)+i%9)%2===0),
   omit:Array.from({length:81},(_,i)=>(Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9!==8)
  };
  return{maskOf,analyze,solve,search,validate,presets,digitPlacements};
 }
 root.NPPatternModel=Object.assign(create(),{create});
})(typeof window!=='undefined'?window:typeof self!=='undefined'?self:globalThis);
