/* Exact givens masks for classic 9x9. Search exhaustion is never an impossibility proof. */
(function(root){
 'use strict';
 function create(){
  const ALL=511,box=i=>Math.floor(i/27)*3+Math.floor(i%9/3);
  const maskOf=mask=>{if(!Array.isArray(mask)||mask.length!==81||mask.some(v=>![true,false,0,1].includes(v)))throw Error('Invalid mask');return mask.map(Boolean);};
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  // Algorithm X: choose the most constrained of cell, row-digit, column-digit and box-digit.
  // This is an independently written exact-cover solver; the normal difficulty evaluator is unchanged.
  function solve(input,{limit=2,random=false,deadline=Infinity,maxNodes=200000}={}){
   if(!Array.isArray(input)||input.length!==81)return{count:0,invalid:true};
   const grid=input.slice(),rows=new Uint16Array(9),cols=new Uint16Array(9),boxes=new Uint16Array(9);
   for(let i=0;i<81;i++){const v=grid[i];if(!Number.isInteger(v)||v<0||v>9)return{count:0,invalid:true};if(!v)continue;const bit=1<<(v-1),r=Math.floor(i/9),c=i%9,b=box(i);if((rows[r]|cols[c]|boxes[b])&bit)return{count:0,invalid:true};rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;}
   const L=new Int32Array(3241),R=new Int32Array(3241),U=new Int32Array(3241),D=new Int32Array(3241),C=new Int32Array(3241),A=new Int32Array(3241),S=new Int32Array(325),given=[],chosen=[];
   for(let c=0;c<=324;c++){L[c]=c-1;R[c]=c+1;U[c]=D[c]=c;C[c]=c;}L[0]=324;R[324]=0;let next=325;
   for(let i=0;i<81;i++){
    const r=Math.floor(i/9),c=i%9,b=box(i),bits=grid[i]?1<<(grid[i]-1):ALL&~(rows[r]|cols[c]|boxes[b]);
    for(let m=bits;m;m&=m-1){const bit=m&-m,d=Math.log2(bit),columns=[1+i,82+r*9+d,163+c*9+d,244+b*9+d],first=next;
     for(const col of columns){const n=next++;C[n]=col;A[n]=i*9+d;U[n]=U[col];D[n]=col;D[U[col]]=n;U[col]=n;S[col]++;L[n]=n-1;R[n]=n+1;}
     L[first]=next-1;R[next-1]=first;if(grid[i])given.push(first);
    }
   }
   function cover(c){R[L[c]]=R[c];L[R[c]]=L[c];for(let i=D[c];i!==c;i=D[i])for(let j=R[i];j!==i;j=R[j]){D[U[j]]=D[j];U[D[j]]=U[j];S[C[j]]--;}}
   function uncover(c){for(let i=U[c];i!==c;i=U[i])for(let j=L[i];j!==i;j=L[j]){S[C[j]]++;D[U[j]]=j;U[D[j]]=j;}R[L[c]]=c;L[R[c]]=c;}
   for(const row of given){let j=row;do{cover(C[j]);j=R[j];}while(j!==row);}
   let count=0,nodes=0,solution=null,aborted=false;
   function visit(){
    if(++nodes>maxNodes||(nodes%64===1&&Date.now()>=deadline)){aborted=true;return;}
    if(!R[0]){count++;if(!solution){solution=grid.slice();for(const row of chosen){const a=A[row];solution[Math.floor(a/9)]=a%9+1;}}return;}
    let col=R[0],best=S[col],ties=1;
    for(let c=R[col];c;c=R[c]){if(S[c]<best){col=c;best=S[c];ties=1;}else if(random&&S[c]===best&&Math.random()<1/++ties)col=c;if(!best)return;}
    if(!best)return;const options=[];for(let row=D[col];row!==col;row=D[row])options.push(row);if(random)shuffle(options);cover(col);
    for(const row of options){chosen.push(row);for(let j=R[row];j!==row;j=R[j])cover(C[j]);visit();for(let j=L[row];j!==row;j=L[j])uncover(C[j]);chosen.pop();if(count>=limit||aborted)break;}
    uncover(col);
   }
   visit();return{count,solution,nodes,aborted};
  }
  function transformIndex(i,operation){let r=Math.floor(i/9),c=i%9;if(operation>=4)c=8-c;for(let t=0;t<operation%4;t++)[r,c]=[c,8-r];return r*9+c;}
  function transform(grid,operation){if(!Array.isArray(grid)||grid.length!==81||!Number.isInteger(operation)||operation<0||operation>7)throw Error('Invalid transform');const out=Array(81);grid.forEach((v,i)=>{out[transformIndex(i,operation)]=v;});return out;}
  function symmetricCells(i,mode){const operations={none:[0],horizontal:[0,4],vertical:[0,6],point:[0,2],both:[0,2,4,6]}[mode];if(!operations||!Number.isInteger(i)||i<0||i>=81)throw Error('Invalid symmetry');return [...new Set(operations.map(t=>transformIndex(i,t)))];}
  // One omitted digit needs one unpainted cell per row, column and box.
  function digitPlacements(mask,firstOnly=false){
   const result=[],cells=[];function visit(r,cols,boxes){if(r===9){result.push(cells.slice());return firstOnly;}for(let c=0;c<9;c++){const i=r*9+c,b=box(i);if(mask[i]||(cols&(1<<c))||(boxes&(1<<b)))continue;cells.push(i);const stop=visit(r+1,cols|1<<c,boxes|1<<b);cells.pop();if(stop)return true;}return false;}
   visit(0,0,0);return result;
  }
  function analyze(input,omit=0){
   const mask=maskOf(input),count=mask.filter(Boolean).length;
   if(!Number.isInteger(omit)||omit<0||omit>9)throw Error('Invalid omitted digit');
   if(count<17)return{state:'impossible',reason:'few',count,needed:17-count};
   if(count===81)return{state:'impossible',reason:'full',count};
   for(let band=0;band<3;band++){
    const rows=[0,1,2].filter(r=>!mask.slice((band*3+r)*9,(band*3+r+1)*9).some(Boolean));
    const cols=[0,1,2].filter(c=>!mask.some((v,i)=>v&&i%9===band*3+c));
    if(rows.length>=2){const indices=rows.map(r=>band*3+r);return{state:'impossible',reason:'rows',count,indices,needed:indices.length-1,cells:Array.from({length:81},(_,i)=>i).filter(i=>indices.includes(Math.floor(i/9))) };}
    if(cols.length>=2){const indices=cols.map(c=>band*3+c);return{state:'impossible',reason:'cols',count,indices,needed:indices.length-1,cells:Array.from({length:81},(_,i)=>i).filter(i=>indices.includes(i%9))};}
   }
   if(omit&&!digitPlacements(mask,true).length){
    for(const unit of ['row','col','box'])for(let at=0;at<9;at++){const cells=Array.from({length:81},(_,i)=>i).filter(i=>(unit==='row'?Math.floor(i/9):unit==='col'?i%9:box(i))===at);if(cells.every(i=>mask[i]))return{state:'impossible',reason:'digit',count,unit,index:at,cells};}
    return{state:'impossible',reason:'digit',count};
   }
   return{state:'unknown',count};
  }
  // Verified starting solutions make the included presets immediate; every result is still counted.
  const starts=["872156934694328517351497628218739465467581392935264871583972146129645783746813259", "986352147532471689714896352145739826879264531263518974657943218398127465421685793", "426587139981432576357619842238791654675243918194856723563128497742965381819374265"].map(s=>s.split('').map(Number));
  const startingGrids=Array.from({length:8},(_,t)=>starts.map(grid=>transform(grid,t))).flat();
  const techniques=[['hidden-single-box','隠れシングル（枠）'],['hidden-single-line','隠れシングル（行列）'],['naked-single','裸のシングル'],['locked-candidates','予約（ポインティング／クレーム）'],['naked-pair','裸のペア'],['hidden-pair','隠れペア'],['naked-triple','裸のトリプル'],['hidden-triple','隠れトリプル'],['x-wing','X-ウィング'],['swordfish','ソードフィッシュ'],['xy-wing','XY-ウィング'],['xyz-wing','XYZ-ウィング'],['colouring','色ぬり（同じ数字の鎖）'],['xy-chain','XY-チェーン']];
  function optionsOf(input={}){
   const targetLevel=input.targetLevel??0,levelPolicy=input.levelPolicy??'exact',required=input.required??[],excluded=input.excluded??[];
   if(!Number.isInteger(targetLevel)||targetLevel<0||targetLevel>18||!['exact','easier'].includes(levelPolicy)||!Array.isArray(required)||!Array.isArray(excluded))throw Error('Invalid search options');
   const ids=new Set(techniques.map(t=>t[0]));
   if([...required,...excluded].some(id=>!ids.has(id))||required.some(id=>excluded.includes(id)))throw Error('Invalid technique constraints');
   return{targetLevel,levelPolicy,required:[...new Set(required)],excluded:[...new Set(excluded)]};
  }
  function matchesRating(rating,input={}){
   const options=optionsOf(input),{targetLevel,levelPolicy,required,excluded}=options;
   if(!targetLevel&&!required.length&&!excluded.length)return true;
   if(!rating?.humanSolvable||!Number.isInteger(rating.level)||rating.level<1||rating.level>18)return false;
   if(targetLevel&&(levelPolicy==='exact'?rating.level!==targetLevel:rating.level>targetLevel))return false;
   if((required.length||excluded.length)&&!Array.isArray(rating.techniques))return false;
   const used=new Set((rating.techniques||[]).map(t=>t.id));
   return required.every(id=>used.has(id))&&excluded.every(id=>!used.has(id));
  }
  function search(input,omit=0,{milliseconds=2500,maxAttempts=20000,rate,targetLevel=0,levelPolicy='exact',required=[],excluded=[],offset=0}={}){
   const options=optionsOf({targetLevel,levelPolicy,required,excluded});
   if(!Number.isInteger(targetLevel)||targetLevel<0||targetLevel>18||!Number.isInteger(offset)||offset<0)throw Error('Invalid search options');
   if((targetLevel||required.length||excluded.length)&&!rate)throw Error('Difficulty evaluator required');
   const mask=maskOf(input),analysis=analyze(mask,omit);if(analysis.state==='impossible')return analysis;
   const deadline=Date.now()+Math.max(0,milliseconds),placements=omit?digitPlacements(mask):null;let attempts=0;
   while(attempts<maxAttempts&&Date.now()<deadline){
    attempts++;let solution;
    if(offset+attempts<=startingGrids.length){
     const start=startingGrids[offset+attempts-1],digits=shuffle([1,2,3,4,5,6,7,8,9]);
     if(omit){const allowed=digits.filter(d=>!start.some((v,i)=>mask[i]&&v===d));if(!allowed.length)continue;const d=allowed[0],at=digits.indexOf(omit);[digits[at],digits[d-1]]=[digits[d-1],digits[at]];}
     solution=start.map(v=>digits[v-1]);
    }else{
     const seed=Array(81).fill(0);if(omit)for(const i of placements[Math.floor(Math.random()*placements.length)])seed[i]=omit;
     const full=solve(seed,{limit:1,random:true,deadline,maxNodes:30000});if(full.aborted||!full.count)continue;solution=full.solution;
    }
    const puzzle=solution.map((v,i)=>mask[i]?v:0),unique=solve(puzzle,{deadline,maxNodes:50000});
    if(unique.aborted||unique.count!==1)continue;
    const rating=rate?rate(Array.from({length:9},(_,r)=>puzzle.slice(r*9,r*9+9))):null;
    // Easier results are accepted only with explicit permission; technique constraints never relax.
    if(!matchesRating(rating,options))continue;
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
  return{maskOf,analyze,solve,search,validate,presets,digitPlacements,transform,transformIndex,symmetricCells,techniques,optionsOf,matchesRating};
 }
 root.NPPatternModel=Object.assign(create(),{create});
})(typeof window!=='undefined'?window:typeof self!=='undefined'?self:globalThis);
