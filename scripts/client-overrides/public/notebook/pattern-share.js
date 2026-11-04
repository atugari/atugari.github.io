(function(){
 'use strict';
 let active=null;
 const t=text=>window.NPI18n?.t(text)||text;
 // Keep the public sharing asset usable with the existing exporter as well.
 const modelURL=new URL('pattern-share-model.js',document.currentScript?.src||location.href).href;
 let modelRequest=null;
 function loadModel(){
  if(window.NPShareModel)return Promise.resolve();
  if(modelRequest)return modelRequest;
  modelRequest=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=modelURL;
   const fail=()=>{modelRequest=null;script.remove();reject(Error('Share model unavailable'));};
   script.onload=()=>window.NPShareModel?resolve():fail();script.onerror=fail;document.head.append(script);
  });
  return modelRequest;
 }
 // Accept only the initial clues. Saved answers, notes and the live grid never enter the renderer.
 function canvasFor(clues){
  if(!Array.isArray(clues)||clues.length!==81||clues.some(n=>!Number.isInteger(n)||n<0||n>9))throw Error('Invalid clues');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1080;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  const margin=45,cell=110,edge=990;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1080,1080);
  ctx.fillStyle='#111111';ctx.font='600 68px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  clues.forEach((n,i)=>{if(n)ctx.fillText(String(n),margin+(i%9+.5)*cell,margin+(Math.floor(i/9)+.5)*cell+2);});
  for(let i=0;i<=9;i++){
   ctx.strokeStyle=i%3===0?'#111111':'#777777';ctx.lineWidth=i%3===0?6:2;ctx.beginPath();
   ctx.moveTo(margin+i*cell,margin);ctx.lineTo(margin+i*cell,margin+edge);
   ctx.moveTo(margin,margin+i*cell);ctx.lineTo(margin+edge,margin+i*cell);ctx.stroke();
  }
  return canvas;
 }
 function multiCanvasFor(clues,layout){
  const clean=window.NPShareModel.validateMulti(clues,layout),{width,height,cells,boards}=clean.layout;
  const legend=boards.length>8||boards.some(b=>b.rule),margin=32;
  const legendCols=legend?Math.min(4,Math.ceil(boards.length/4)):0,legendRow=32,legendWidth=240;
  const legendHeight=legend?Math.ceil(boards.length/legendCols)*legendRow+8:0;
  const cell=Math.min(110,Math.floor((3960-legendHeight)/Math.max(width,height)));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(width*cell,legendCols*legendWidth)+margin*2;
  canvas.height=height*cell+margin*2+legendHeight;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const left=x=>margin+x*cell,top=y=>margin+y*cell;
  const line=(x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(left(x1),top(y1));ctx.lineTo(left(x2),top(y2));ctx.stroke();};
  const color=i=>`hsl(${(i*137.5+130)%360} 65% 36%)`;
  ctx.fillStyle='#e7eefb';
  for(const {x,y,rule} of boards)if(rule==='hyper'){
   for(const r of [1,5])for(const c of [1,5])ctx.fillRect(left(x+c),top(y+r),3*cell,3*cell);
  }
  ctx.strokeStyle='#bbc9e7';ctx.lineWidth=Math.max(1,cell/9);
  for(const {x,y,n,rule} of boards)if(rule==='diagonal'){
   line(x,y,x+n,y+n);line(x+n,y,x,y+n);
  }
  // Draw only occupied cells; gaps between boards stay empty. Shared clues are drawn once.
  ctx.strokeStyle='#777';ctx.lineWidth=Math.max(1,cell/55);
  for(const c of cells)ctx.strokeRect(left(c.x),top(c.y),cell,cell);
  ctx.strokeStyle='#111';ctx.lineWidth=Math.max(2,cell/20);
  for(const {n,x,y,blockRows,blockCols} of boards){
   for(let r=0;r<=n;r+=blockRows)line(x,y+r,x+n,y+r);
   for(let c=0;c<=n;c+=blockCols)line(x+c,y,x+c,y+n);
  }
  if(legend){
   ctx.textAlign='left';ctx.textBaseline='top';ctx.lineWidth=Math.max(1,cell/25);
   for(const [i,{n,x,y,rule}] of boards.entries()){
    const letter=String.fromCharCode(65+i);
    ctx.strokeStyle=color(i);ctx.fillStyle=ctx.strokeStyle;
    ctx.strokeRect(left(x)+1,top(y)+1,n*cell-2,n*cell-2);
    ctx.font='700 '+Math.max(7,Math.min(16,cell*.24))+'px Arial, sans-serif';
    ctx.fillText(letter,left(x)+3,top(y)+3);
    ctx.font='600 17px Arial, sans-serif';
    ctx.fillText(letter+' · '+n+'×'+n+' · '+t(window.NPShareModel.ruleLabel(rule)),
      margin+(i%legendCols)*legendWidth,top(height)+18+Math.floor(i/legendCols)*legendRow,legendWidth-12);
   }
  }
  ctx.fillStyle='#111';ctx.textAlign='center';ctx.textBaseline='middle';
  clean.clues.forEach((n,i)=>{if(!n)return;const c=cells[i];ctx.font='600 '+Math.round(cell*(n>=10?.48:.62))+'px Arial, sans-serif';ctx.fillText(String(n),left(c.x+.5),top(c.y+.518));});
  return canvas;
 }
 function close(){if(!active)return;const state=active;active=null;if(state.url)URL.revokeObjectURL(state.url);if(state.dialog.open)state.dialog.close();state.dialog.remove();if(state.focus?.isConnected)state.focus.focus({preventScroll:true});}
 function open(clues,layout=null){
  const initial=Array.isArray(clues)?clues.slice():null;close();
  const dialog=document.createElement('dialog');dialog.className='pattern-share-dialog';dialog.setAttribute('aria-labelledby','pattern-share-title');
  dialog.innerHTML='<header><h2 id="pattern-share-title">'+t('問題を投稿・共有')+'</h2><button type="button" data-share-close aria-label="'+t('閉じる')+'">'+t('閉じる')+'</button></header><p class="pattern-share-description">'+t(Array.isArray(layout?.boards)&&layout.boards.some(b=>b?.rule)?'初期数字と各盤面のルールを表示します。':'初期数字だけの画像です。')+'</p><div class="pattern-share-preview"><img data-share-image alt="'+(layout?t('マルチナンプレ'):'9×9 '+t('ふつうのナンプレ'))+'" hidden></div><label class="pattern-share-field">'+t('投稿文（自由に変更できます）')+'<textarea data-share-text rows="2"></textarea></label><p class="pattern-share-status" data-share-status role="status" aria-live="polite">'+t('読み込み中…')+'</p><div class="pattern-share-actions"><a data-share-x aria-disabled="true" href="https://x.com/intent/tweet" target="_blank" rel="noopener noreferrer">'+t('Xに投稿する')+'</a><a data-share-line aria-disabled="true" target="_blank" rel="noopener noreferrer">'+t('LINEで送る')+'</a><button type="button" data-share-native hidden disabled>'+t('ほかのアプリに送る')+'</button><button type="button" data-share-link-copy disabled>'+t('問題リンクをコピー')+'</button></div><p class="pattern-share-help" data-share-help>'+t('X・LINEには投稿文と、この問題を開けるリンクを渡します。画像の自動添付はできません。')+'</p><details class="pattern-share-more"><summary>'+t('画像の保存・コピーなど')+'</summary><div class="pattern-share-actions"><a data-share-save aria-disabled="true">'+t('画像を保存')+'</a><button type="button" data-share-copy hidden disabled>'+t('画像をコピー')+'</button></div><label class="pattern-share-field">'+t('この問題のリンク')+'<input data-share-link type="text" readonly></label></details><section class="pattern-share-permission" aria-labelledby="pattern-share-permission-title"><h3 id="pattern-share-permission-title">'+t('掲載について')+'</h3><p>'+t('この問題は、XなどのSNSやブログに自由に掲載できます。')+'</p><p>'+t('ナンプレ帳の名前・リンクの記載や事前連絡は任意です。')+'</p></section>';
  const state={dialog,focus:document.activeElement,url:null,file:null,busy:false,link:null,shareFiles:false};active=state;
  const $=selector=>dialog.querySelector(selector),message=text=>{if(active===state)$('[data-share-status]').textContent=t(text);};
  $('[data-share-text]').value=t(document.body.classList.contains('shared-puzzle-page')?'共有されたナンプレ':'ナンプレを作りました。よかったら解いてみてね！');
  const updateLinks=()=>{if(!state.link)return;const links=window.NPShareModel.links($('[data-share-text]').value,state.link);$('[data-share-x]').setAttribute('href',links.x);$('[data-share-line]').setAttribute('href',links.line);};
  $('[data-share-text]').addEventListener('input',updateLinks);
  const canCopyImage=()=>!!navigator.clipboard?.write&&typeof ClipboardItem==='function';
  const copyImage=()=>{try{return Promise.resolve(navigator.clipboard.write([new ClipboardItem({'image/png':state.file})]));}catch(error){return Promise.reject(error);}};
  $('[data-share-x]').onclick=event=>{
   if(!state.file||!state.link){event.preventDefault();return;}
   updateLinks();
   // Do not await before the anchor opens X: that would lose the click's popup activation.
   if(canCopyImage())copyImage().then(()=>message('画像もコピーしました。Xの投稿画面で貼り付けてください。'),()=>message('問題リンクで共有できます。画像も付ける場合は「画像を保存」から添付してください。'));
   else message('問題リンクで共有できます。画像も付ける場合は「画像を保存」から添付してください。');
  };
  $('[data-share-line]').onclick=event=>{if(!state.file||!state.link){event.preventDefault();return;}updateLinks();message('送信先で投稿文と問題リンクを確認してください。');};
  $('[data-share-link-copy]').onclick=()=>{
   if(!state.link)return;
   const selectLink=()=>{if(active!==state)return;$('.pattern-share-more').open=true;const input=$('[data-share-link]');input.focus();input.select();message('リンク欄を長押しするか、選択してコピーしてください。');};
   try{if(!navigator.clipboard?.writeText)return selectLink();Promise.resolve(navigator.clipboard.writeText(state.link)).then(()=>message('問題リンクをコピーしました。投稿先に貼り付けてください。'),selectLink);}catch(_){selectLink();}
  };
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(active===state)close();});
  $('[data-share-close]').onclick=close;
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
  $('[data-share-native]').onclick=()=>{
   if(!state.file||state.busy)return;state.busy=true;$('[data-share-native]').disabled=true;
   // The PNG is already prepared, so sharing retains the click's user activation.
   let request;try{request=navigator.share(state.shareFiles?{files:[state.file]}:{text:$('[data-share-text]').value,url:state.link});}catch(error){request=Promise.reject(error);}
   Promise.resolve(request).then(()=>message('共有先で投稿内容を確認してください。'),error=>message(error?.name==='AbortError'?'':'共有できませんでした。X・LINEのボタンか、問題リンクのコピーを使ってください。')).finally(()=>{state.busy=false;if(active===state)$('[data-share-native]').disabled=false;});
  };
  $('[data-share-copy]').onclick=()=>{
   if(!state.file||state.busy)return;state.busy=true;$('[data-share-copy]').disabled=true;
   const request=copyImage();
   Promise.resolve(request).then(()=>message('コピーしました。'),()=>message('画像をコピーできませんでした。「画像を保存」を使ってください。')).finally(()=>{state.busy=false;if(active===state)$('[data-share-copy]').disabled=false;});
  };
  $('[data-share-save]').onclick=event=>{if(!state.file)event.preventDefault();};
  document.body.append(dialog);dialog.showModal();
  const prepare=()=>{
  if(active!==state)return;
  try{
   if(!window.NPShareModel)throw Error('Share model unavailable');
   const canvas=layout?multiCanvasFor(initial,layout):canvasFor(initial);
   try{
    state.link=new URL('/nanpure/share.html',location.href).href+window.NPShareModel.encode(initial,layout);
    $('[data-share-link]').value=state.link;updateLinks();
   }catch(error){if(error.code!=='NP_SHARE_TOO_LONG')throw error;}
   canvas.toBlob(blob=>{
    if(active!==state)return;
    if(!blob){message('画像を作れませんでした。閉じて、もう一度お試しください。');return;}
    const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15),name='nanpure-'+(layout?'multi':'pattern')+'-'+stamp+'.png';
    state.file=new File([blob],name,{type:'image/png'});state.url=URL.createObjectURL(state.file);
    $('[data-share-image]').src=state.url;$('[data-share-image]').hidden=false;
    const save=$('[data-share-save]');save.href=state.url;save.download=name;save.removeAttribute('aria-disabled');
    if(state.link){
     for(const name of ['x','line'])$('[data-share-'+name+']').removeAttribute('aria-disabled');
     $('[data-share-link-copy]').disabled=false;
    }else{
     for(const name of ['x','line','link-copy'])$('[data-share-'+name+']').hidden=true;
     $('[data-share-link]').parentElement.hidden=true;
     $('.pattern-share-more').open=true;
    }
    try{state.shareFiles=!!navigator.canShare?.({files:[state.file]});}catch(_){}
    if(typeof navigator.share==='function'&&(state.shareFiles||state.link)){$('[data-share-native]').hidden=false;$('[data-share-native]').disabled=false;}
    if(canCopyImage()){$('[data-share-copy]').hidden=false;$('[data-share-copy]').disabled=false;if(state.link)$('[data-share-help]').textContent=t('Xには投稿文と問題リンクを渡し、画像もコピーします。画像を付けるには投稿画面で貼り付けてください。');}
    if(!state.link)$('[data-share-help]').textContent=t('画像を保存、コピー、または共有先に送れます。');
    message(state.link?'':'問題リンクの長さの上限を超えました。画像で共有できます。');
   },'image/png');
  }catch(_){message('画像を作れませんでした。閉じて、もう一度お試しください。');}
  };
  if(window.NPShareModel)prepare();else loadModel().then(prepare,()=>message('画像を作れませんでした。閉じて、もう一度お試しください。'));
 }
 window.NPPatternShare={open,openMulti:(clues,layout)=>open(clues,layout),close,isOpen:()=>!!active,canvasFor:(clues,layout)=>layout?multiCanvasFor(clues,layout):canvasFor(clues)};
})();
