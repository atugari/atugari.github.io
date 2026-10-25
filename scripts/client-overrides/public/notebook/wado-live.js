(function(g){
 'use strict';
 function create(config){
  const $=id=>document.getElementById(id),stage=$('live-stage'),viewport=$('live-viewport'),keys=['problemSize','printText','kanjiSize','kanjiWeight','printWeight','spacing','hint','separateHints',...WadoPaper.flags];
  let history=[],timer=0,dirty=true,packed=null,position=0,mode='page',kind='questions';
  const snapshot=()=>Object.fromEntries(keys.map(k=>[k,config.preferences()[k]]));
  const visible=()=>!$('workspace-print').hidden;
  function capture(){const p=snapshot();if(JSON.stringify(history.at(-1))!==JSON.stringify(p))history.push(p);if(history.length>30)history.shift();$('live-undo').disabled=!history.length;}
  function category(name){for(const b of document.querySelectorAll('[data-live-category]')){const on=b.dataset.liveCategory===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}for(const p of document.querySelectorAll('[data-live-panel]'))p.hidden=p.dataset.livePanel!==name;}
  const categories=[...document.querySelectorAll('[data-live-category]')];categories.forEach((b,i)=>{b.addEventListener('click',()=>category(b.dataset.liveCategory));b.addEventListener('keydown',e=>{const n=e.key==='ArrowRight'?(i+1)%4:e.key==='ArrowLeft'?(i+3)%4:e.key==='Home'?0:e.key==='End'?3:-1;if(n<0)return;e.preventDefault();category(categories[n].dataset.liveCategory);categories[n].focus();});});
  function fit(){
   if(!visible()||typeof viewport.getBoundingClientRect!=='function')return;
   const frames=[...stage.children],items=[...stage.querySelectorAll('.wp-item')],total=mode==='page'?frames.length:items.length;position=Math.max(0,Math.min(position,total-1));
   const target=mode==='detail'?items[position]:null,frame=target?.closest('.live-page')||frames[position];
   frames.forEach(f=>f.hidden=f!==frame);stage.classList.toggle('live-detail',mode==='detail');for(const n of items)n.removeAttribute('data-live-focus');if(target)target.setAttribute('data-live-focus','');
   $('live-page-number').textContent=total?(position+1)+' / '+total+(mode==='page'?'ページ':'問'):'';$('live-previous').disabled=position<=0;$('live-next').disabled=position>=total-1;
   if(!frame){stage.style.height='220px';return;}const canvas=frame.firstElementChild;canvas.style.transform='none';const c=canvas.getBoundingClientRect(),r=target?.getBoundingClientRect()||c,w=viewport.clientWidth-24;if(w<=0||r.width<=0)return;
   const zoom=$('live-scale').value,scale=zoom==='width'?w/r.width:Number(zoom),x=12-(r.left-c.left)*scale,y=12-(r.top-c.top)*scale;
   frame.style.width=stage.style.width=Math.ceil(r.width*scale+24)+'px';frame.style.height=stage.style.height=Math.ceil(r.height*scale+24)+'px';
   canvas.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
  }
  function refresh(){clearTimeout(timer);timer=0;if(!visible()){dirty=true;return false;}dirty=false;stage.replaceChildren();packed=null;$('live-print').disabled=true;
   if(!config.ready()){$('live-empty').hidden=false;$('live-empty').textContent='「選ぶ」で印刷する問題を選んでください。';$('live-status').textContent='';fit();return false;}
   try{kind=config.preferences().printKind||kind;$('live-kind').value=kind;$('wado-separateHints').disabled=kind!=='cut';$('live-layout-help').textContent=kind==='cut'?'問題を上に、解答例を下にまとめます。点線で切り分けられます。対応する番号は必ず載ります。':kind==='together'?'各問題のすぐ下に解答例を載せます。用紙を分けずに印刷できます。対応する番号は必ず載ります。':'拡大率を上げると横にもスクロールできます。';packed=config.build(stage,kind);for(const sheet of [...stage.children]){const frame=document.createElement('div'),canvas=document.createElement('div');frame.className='live-page';canvas.className='live-canvas';canvas.append(sheet);frame.append(canvas);stage.append(frame);}
    $('live-empty').hidden=true;$('live-status').textContent=packed.counts.reduce((a,b)=>a+b,0)+'問 · '+packed.pages+'ページ · 最大'+Math.max(...packed.counts)+'問/ページ';$('live-print').disabled=false;fit();return true;
   }catch(e){stage.replaceChildren();$('live-empty').hidden=false;$('live-empty').textContent=e.message;$('live-status').textContent='設定を調整してください';fit();return false;}
  }
  function schedule(){dirty=true;clearTimeout(timer);if(visible())timer=setTimeout(refresh,120);}
  $('live-kind').addEventListener('change',()=>{kind=$('live-kind').value;config.selectKind(kind);position=0;refresh();});
  $('live-scale').addEventListener('change',()=>{viewport.scrollLeft=0;fit();});
  $('live-zoom').addEventListener('click',()=>{const items=[...stage.querySelectorAll('.wp-item')],frames=[...stage.children];if(mode==='page'){position=items.findIndex(n=>n.closest('.live-page')===frames[position]);mode='detail';}else{position=frames.indexOf(items[position]?.closest('.live-page'));mode='page';}$('live-zoom').textContent=mode==='page'?'1問ずつ見る':'用紙全体へ';$('live-zoom').setAttribute('aria-pressed',String(mode==='detail'));viewport.scrollLeft=0;fit();});
  $('live-previous').addEventListener('click',()=>{position--;fit();});$('live-next').addEventListener('click',()=>{position++;fit();});
  $('live-undo').addEventListener('click',()=>{if(!history.length)return;config.restore(history.pop());$('live-undo').disabled=!history.length;refresh();});
  $('live-print').addEventListener('click',()=>{if(refresh())config.print(kind);});
  document.addEventListener('wado-workspace-change',()=>{if(visible()){if(dirty)refresh();else fit();}});
  window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);if(typeof ResizeObserver!=='undefined')new ResizeObserver(fit).observe(viewport);
  category('size');return{capture,schedule,refresh,fit};
 }
 g.WadoLive={create};
})(globalThis);
