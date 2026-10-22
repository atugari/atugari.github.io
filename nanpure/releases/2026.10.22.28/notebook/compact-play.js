(()=>{
 'use strict';let pending=false,lastKey='';
 function update(){pending=false;const app=document.getElementById('app'),board=document.getElementById('board-scroll'),dock=app?.querySelector('.play-dock');const active=!!(board&&dock);document.body.classList.toggle('compact-playing',active);if(!active){lastKey='';return;}
 const screen=board.closest('.screen')||app;
 let dialog=screen.querySelector('.fit-options-dialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.className='fit-options-dialog';dialog.setAttribute('aria-label','設定・ルール');const close=document.createElement('button');close.textContent='閉じる ×';close.className='fit-close';close.onclick=()=>dialog.close();dialog.append(close);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 const details=Array.from(screen.querySelectorAll('details')).filter(d=>!d.parentElement.closest('details'));for(const d of details)dialog.append(d);screen.append(dialog);
 const btn=document.createElement('button');btn.className='fit-options';btn.textContent='設定・ルール';btn.onclick=()=>dialog.showModal();dock.append(btn);
 }
 const status=document.getElementById('play-status');if(status&&status.parentElement!==dock)dock.append(status);
 const current=window.NanpureAppTest?.getCurrent?.(),ratio=current?.linked?current.linked.width/current.linked.height:1;
 let used=0;for(const el of Array.from(screen.children)){if(el===board||el.tagName==='DIALOG'||getComputedStyle(el).display==='none'||getComputedStyle(el).position==='fixed')continue;const cs=getComputedStyle(el);used+=el.getBoundingClientRect().height+(parseFloat(cs.marginTop)||0)+(parseFloat(cs.marginBottom)||0)}
 const css=getComputedStyle(app),availableH=Math.max(100,window.innerHeight-used-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)-14),availableW=app.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
 const width=Math.floor(Math.min(availableW,availableH*ratio,720));const key=width+':'+ratio;if(key!==lastKey){lastKey=key;board.style.width=width+'px';board.style.height=Math.floor(width/ratio)+'px';window.dispatchEvent(new Event('resize'));}
 }
 function schedule(){if(!pending){pending=true;requestAnimationFrame(update)}}
 const start=()=>{const app=document.getElementById('app');if(!app)return;new MutationObserver(schedule).observe(app,{childList:true,subtree:true});window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);schedule()};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
