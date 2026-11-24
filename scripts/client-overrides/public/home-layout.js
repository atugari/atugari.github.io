(function(w){'use strict';
if(w.NPHomeLayout)return;
const asset=new URL('./',document.currentScript?.src||location.href);
if(!document.querySelector('link[data-home-layout]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('home-layout.css',asset).href;style.dataset.homeLayout='';document.head.append(style)}
const t=text=>w.NPI18n?.t(text)||text;
// The site footer sits after the app shell in the document, which makes the
// page itself slightly taller than the screen. On phones that extra scroll
// can leave the shell (and its header) pushed out of view with no way back.
// Keep a reference to the footer and, on the home screen only, move it to
// the end of the shell's own scrolling area; the shell re-renders its main
// area, so pdFooterMove is re-run from the observer below whenever the
// footer gets dropped. On every other screen the footer stays after the
// shell as before: inside a play screen's main it would become a layout
// item and squeeze the board.
const pdFooterNode=document.querySelector('.nanpure-site-footer');
function pdFooterMove(){
 if(!pdFooterNode)return;
 const shell=document.querySelector('.site-shell');if(!shell)return;
 if(shell.classList.contains('mode-home')){
  const main=shell.querySelector('main');
  if(main&&pdFooterNode.parentElement!==main)main.append(pdFooterNode);
 }else if(pdFooterNode.parentElement!==document.body){
  document.body.append(pdFooterNode);
 }
}
pdFooterMove();
function showGuide(){
 const main=document.querySelector('.designed-home'),source=main?.querySelector('.site-intro'),button=main?.querySelector('[data-home-guide]');if(!source)return;
 const box=document.createElement('dialog');box.className='np-home-guide';box.setAttribute('aria-labelledby','np-home-guide-heading');
 const head=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.id='np-home-guide-heading';title.textContent=t('ナンプレ帳でできること');close.type='button';close.textContent=t('閉じる');close.addEventListener('click',()=>box.close());head.append(title,close);
 const content=source.cloneNode(true);content.classList.add('np-home-guide-content');content.removeAttribute('aria-labelledby');content.querySelector('h2')?.remove();content.querySelectorAll('[data-np-titles]').forEach(n=>n.remove());
 const actions=document.createElement('div');actions.className='np-home-guide-actions';const original=main.querySelector('.tutorial-entry');if(original){const b=document.createElement('button');b.type='button';b.textContent=original.textContent;b.onclick=()=>{box.close();original.click()};actions.append(b)}
 box.append(head,content,actions);box.addEventListener('close',()=>{box.remove();button?.focus({preventScroll:true})});document.body.append(box);box.showModal();
}
function mount(){document.querySelectorAll('[data-home-title],[data-home-guide]').forEach(node=>{if(!node.closest('.designed-home'))node.remove()});const main=document.querySelector('.designed-home');if(!main)return null;main.classList.add('np-home-ready');return main.querySelector('.home-topline')}
w.NPHomeLayout={mount,showGuide};let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}).observe(document.documentElement,{childList:true,subtree:true});mount();
// Pare Asobi daily puzzle: same stock and same date pick as the top page.
function pdHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function pdRng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let x=Math.imul(a^a>>>15,1|a);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296;};}
function pdBuild(sec,body,pz,dateStr){
 const givens=pz.givens.split('').map(Number),sol=pz.solution.split('').map(Number);
 let state=givens.slice(),sel=-1,cleared=false;const wrong=new Set();
 body.innerHTML='';
 const board=document.createElement('div');board.className='pd-board';board.setAttribute('role','grid');
 const cells=[];
 const peer=(a,b)=>{if(a===b)return false;const ra=Math.floor(a/9),ca=a%9,rb=Math.floor(b/9),cb=b%9;return ra===rb||ca===cb||(Math.floor(ra/3)===Math.floor(rb/3)&&Math.floor(ca/3)===Math.floor(cb/3));};
 const paint=()=>{cells.forEach((el,i)=>{const c=i%9,r=Math.floor(i/9);el.className='pd-cell'+(givens[i]?' pd-given':'')+(sel>=0&&peer(i,sel)?' pd-peer':'')+(i===sel?' pd-sel':'')+(wrong.has(i)?' pd-wrong':'')+(c%3===2&&c<8?' pd-b3r':'')+(r%3===2&&r<8?' pd-b3b':'');el.textContent=state[i]||'';});};
 for(let i=0;i<81;i++){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',(Math.floor(i/9)+1)+'行'+(i%9+1)+'列');b.addEventListener('click',()=>{sel=i;paint();});cells.push(b);board.append(b);}
 const pad=document.createElement('div');pad.className='pd-pad';
 const input=d=>{if(cleared||sel<0||givens[sel])return;state[sel]=d;wrong.delete(sel);paint();};
 for(let d=1;d<=9;d++){const b=document.createElement('button');b.type='button';b.className='pd-padbtn';b.textContent=String(d);b.addEventListener('click',()=>input(d));pad.append(b);}
 const er=document.createElement('button');er.type='button';er.className='pd-padbtn pd-erase';er.textContent=t('消す');er.addEventListener('click',()=>input(0));pad.append(er);
 const msg=document.createElement('p');msg.className='pd-msg';msg.setAttribute('role','status');
 const btns=document.createElement('div');btns.className='pd-btns';
 const check=document.createElement('button');check.type='button';check.className='pd-btn pd-btn-main';check.textContent=t('答え合わせ');
 check.addEventListener('click',()=>{if(cleared)return;let wc=0,em=0;wrong.clear();state.forEach((v,j)=>{if(v!==0&&v!==sol[j]){wrong.add(j);wc++;}if(v===0)em++;});paint();if(!wc&&!em){cleared=true;msg.textContent=t('クリア！');msg.classList.add('pd-msg-clear');try{localStorage.setItem('pareDailyCleared',dateStr);}catch(e){}return;}msg.classList.remove('pd-msg-clear');msg.textContent=t(wc?'赤いマスが間違っているよ':'まだ空いているマスがあるよ');});
 const reset=document.createElement('button');reset.type='button';reset.className='pd-btn';reset.textContent=t('全てリセット');
 reset.addEventListener('click',()=>{cleared=false;state=givens.slice();wrong.clear();msg.textContent='';msg.classList.remove('pd-msg-clear');paint();});
 btns.append(check,reset);
 body.append(board,pad,msg,btns);
 try{if(localStorage.getItem('pareDailyCleared')===dateStr){cleared=true;msg.textContent=t('クリア！');msg.classList.add('pd-msg-clear');}}catch(e){}
 paint();
 sec.dataset.pdReady='ready';
}
function pdEnhance(){
 const sec=document.querySelector('#pare-daily');if(!sec||sec.dataset.pdReady)return;
 const body=sec.querySelector('[data-pd-body]');if(!body)return;
 sec.dataset.pdReady='loading';
 const now=new Date(),Y=now.getFullYear(),M=now.getMonth(),D=now.getDate();
 const days=Math.floor(Date.UTC(Y,M,D)/86400000),pad2=n=>(n<10?'0':'')+n,dateStr=Y+'-'+pad2(M+1)+'-'+pad2(D);
 const dateEl=sec.querySelector('[data-pd-date]');if(dateEl)dateEl.textContent=(M+1)+'月'+D+'日（'+'日月火水木金土'.charAt(now.getDay())+'）';
 fetch('/assets/daily-sudoku-stock.json').then(r=>{if(!r.ok)throw new Error('ng');return r.json();}).then(stock=>{
  const normal=(stock||[]).filter(p=>p.rule==='normal');if(!normal.length)throw new Error('empty');
  const idxs=normal.map((_,i)=>i),rng=pdRng(pdHash('pare-daily-stock-v1'));
  for(let i=idxs.length-1;i>0;i--){const j=Math.floor(rng()*(i+1)),tmp=idxs[i];idxs[i]=idxs[j];idxs[j]=tmp;}
  pdBuild(sec,body,normal[idxs[((days%normal.length)+normal.length)%normal.length]],dateStr);
 }).catch(()=>{sec.dataset.pdReady='failed';body.innerHTML='';const p=document.createElement('p');p.className='pd-msg';p.textContent=t('今日の問題を読み込めませんでした。時間をおいて開き直してね');body.append(p);});
}
let pdQueued=false;new MutationObserver(()=>{if(pdQueued)return;pdQueued=true;requestAnimationFrame(()=>{pdQueued=false;pdFooterMove();pdEnhance();});}).observe(document.documentElement,{childList:true,subtree:true});pdEnhance();

})(window);
