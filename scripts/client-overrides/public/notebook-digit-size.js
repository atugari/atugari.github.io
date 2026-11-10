/* Correct digit sizing on the active Nanpure notebook after the immutable release check. */
(()=>{'use strict';
 const root=document.documentElement;
 const px=n=>(Math.round(n*100)/100)+'px';
 let queued=false,last='';
 const readPrefs=()=>{try{const v=JSON.parse(localStorage.getItem('collection-workspace-v1')||'{}');return [100,125,150,175,200].includes(v.digitSize)?v.digitSize:100}catch{return 100}};
 function apply(){
  queued=false;
  const board=document.querySelector('#board');
  if(!board)return;
  const scale={small:.85,normal:1,large:1.15}[root.dataset.digitSize]||1;
  const workspace=readPrefs();
  const cells=Array.from(board.querySelectorAll('.cell'));
  const cell=cells[0];if(!cell)return;
  const digits=board.querySelectorAll('.cell>span.np-workspace-digit');
  const contentLength=Array.from(digits).reduce((n,span)=>n+span.textContent.length,0);
  const signature=[scale,workspace,board.dataset.digitSize,board.className,board.clientWidth,board.clientHeight,cell.clientWidth,cell.clientHeight,cells.length,digits.length,contentLength].join('|');
  if(signature===last)return;last=signature;
  const columns=getComputedStyle(board).gridTemplateColumns.trim().split(/\s+/).length||9;
  const digitCount=String(board.classList.contains('hundred-board')?100:columns).length;
  const limit=Math.max(1,Math.min(cell.clientHeight*(board.querySelector('.cage-label') ? 0.7 : 0.88),cell.clientWidth/(digitCount*.64)));
  for(const span of board.querySelectorAll('.cell>span.np-workspace-digit')){
   if(span.classList.contains('notes')||span.classList.contains('hundred-notes')||span.classList.contains('cage-label')||span.classList.contains('cage-border'))continue;
   const parentSize=parseFloat(getComputedStyle(span.parentElement).fontSize)||16;
   let size=Math.max(1,Math.min(parentSize*scale*workspace/100,limit));
   span.style.setProperty('font-size',px(size),'important');
   span.style.setProperty('line-height','1','important');
   span.style.setProperty('white-space','nowrap','important');
   const width=span.getBoundingClientRect().width,available=Math.max(1,span.parentElement.clientWidth-Math.min(2,span.parentElement.clientWidth*.04));
   if(width>available&&width>0){size=Math.max(1,size*available/width);span.style.setProperty('font-size',px(size),'important')}
  }
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(apply)}}
 const watch=()=>{const board=document.querySelector('#board');if(board&&!board.dataset.npDigitFixObserved){board.dataset.npDigitFixObserved='true';new MutationObserver(schedule).observe(board,{attributes:true,attributeFilter:['data-digit-size','class','style'],childList:true,subtree:true})}schedule()};
 new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.removedNodes.length))watch()}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-digit-size']});
 window.addEventListener('resize',schedule);window.addEventListener('orientationchange',schedule);window.addEventListener('storage',e=>{if(e.key==='collection-workspace-v1')schedule()});
 watch();
})();
