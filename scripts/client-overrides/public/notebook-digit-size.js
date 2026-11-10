/* Correct notebook digit sizing and expose an independent Killer cage-sum size setting. */
(()=>{'use strict';
 const root=document.documentElement,px=n=>(Math.round(n*100)/100)+'px';
 let queued=false,last='',cageLast='';
 const readPrefs=()=>{try{const v=JSON.parse(localStorage.getItem('collection-workspace-v1')||'{}');return [100,125,150,175,200].includes(v.digitSize)?v.digitSize:100}catch{return 100}};
 const readCageSize=()=>{try{const n=Number(localStorage.getItem('np-killer-sum-size-v1'));return [100,125,150,175,200].includes(n)?n:100}catch{return 100}};
 function apply(){
  queued=false;const board=document.querySelector('#board');if(!board)return;
  const scale={small:.85,normal:1,large:1.15}[root.dataset.digitSize]||1,workspace=readPrefs();
  const cells=Array.from(board.querySelectorAll('.cell')),cell=cells[0];if(!cell)return;
  const digits=board.querySelectorAll('.cell>span.np-workspace-digit'),contentLength=Array.from(digits).reduce((n,span)=>n+span.textContent.length,0);
  const signature=[scale,workspace,board.dataset.digitSize,board.className,board.clientWidth,board.clientHeight,cell.clientWidth,cell.clientHeight,cells.length,digits.length,contentLength].join('|');
  if(signature!==last){last=signature;
   const columns=getComputedStyle(board).gridTemplateColumns.trim().split(/\\s+/).length||9,digitCount=String(board.classList.contains('hundred-board')?100:columns).length;
   const limit=Math.max(1,Math.min(cell.clientHeight*(board.querySelector('.cage-label')?.7:.88),cell.clientWidth/(digitCount*.64)));
   for(const span of digits){
    if(span.classList.contains('notes')||span.classList.contains('hundred-notes')||span.classList.contains('cage-label')||span.classList.contains('cage-border'))continue;
    const parentSize=parseFloat(getComputedStyle(span.parentElement).fontSize)||16;
    let size=Math.max(1,Math.min(parentSize*scale*workspace/100,limit));
    span.style.setProperty('font-size',px(size),'important');span.style.setProperty('line-height','1','important');span.style.setProperty('white-space','nowrap','important');
    const width=span.getBoundingClientRect().width,available=Math.max(1,span.parentElement.clientWidth-Math.min(2,span.parentElement.clientWidth*.04));
    if(width>available&&width>0)span.style.setProperty('font-size',px(Math.max(1,size*available/width)),'important');
   }
  }
  applyCage(board);
 }
 function applyCage(board){
  const labels=Array.from(board.querySelectorAll('.cell>.cage-label'));if(!labels.length){cageLast='';return}
  const size=readCageSize(),cell=labels[0].parentElement;
  const sig=[size,cell.clientWidth,cell.clientHeight,labels.length,labels.map(x=>x.textContent).join('|')].join(':');if(sig===cageLast)return;cageLast=sig;
  for(const label of labels){
   if(!label.dataset.npCageBase)label.dataset.npCageBase=String(parseFloat(getComputedStyle(label).fontSize)||8);
   const base=Number(label.dataset.npCageBase)||8,box=label.parentElement,textLength=Math.max(1,label.textContent.trim().length);
   const maxByWidth=Math.max(1,box.clientWidth*.72/(textLength*.62)),maxByHeight=Math.max(1,box.clientHeight*.34);
   label.style.setProperty('font-size',px(Math.min(base*size/100,maxByWidth,maxByHeight)),'important');
   label.style.setProperty('line-height','1','important');label.style.setProperty('white-space','nowrap','important');
  }
 }
 function ensureCageControl(){
  const board=document.querySelector('#board');if(!board?.querySelector('.cage-label'))return;
  const dialog=document.querySelector('.np-workspace-dialog');if(!dialog||dialog.querySelector('[data-cage-sum-size]'))return;
  const size=[100,125,150,175,200].includes(readCageSize())?readCageSize():100;
  const label=document.createElement('label');label.dataset.cageSumSetting='true';label.append('キラー合計の数字サイズ');
  const select=document.createElement('select');select.dataset.cageSumSize='true';select.setAttribute('aria-label','キラー合計の数字サイズ');
  for(const n of [100,125,150,175,200]){const option=document.createElement('option');option.value=String(n);option.textContent=n+'%'+(n===100?'（標準）':'');select.append(option)}
  select.value=String(size);select.addEventListener('change',()=>{try{localStorage.setItem('np-killer-sum-size-v1',select.value)}catch{}cageLast='';schedule()});
  label.append(select);const digit=dialog.querySelector('[data-digit-size]')?.closest('label');if(digit?.parentNode)digit.parentNode.insertBefore(label,digit.nextSibling);else dialog.prepend(label);
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(apply)}}
 const watch=()=>{const board=document.querySelector('#board');if(board&&!board.dataset.npDigitFixObserved){board.dataset.npDigitFixObserved='true';new MutationObserver(schedule).observe(board,{attributes:true,attributeFilter:['data-digit-size','class','style'],childList:true,subtree:true})}ensureCageControl();schedule()};
 new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.removedNodes.length)){watch();ensureCageControl()}}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
 new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-digit-size']});
 window.addEventListener('resize',()=>{last='';cageLast='';schedule()});window.addEventListener('orientationchange',()=>{last='';cageLast='';schedule()});
 window.addEventListener('storage',e=>{if(e.key==='collection-workspace-v1'||e.key==='np-killer-sum-size-v1'){last='';cageLast='';schedule()}});
 watch();
})();