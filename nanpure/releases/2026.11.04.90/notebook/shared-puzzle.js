(function(){
 'use strict';
 const image=document.querySelector('[data-shared-image]'),status=document.querySelector('[data-shared-status]'),button=document.querySelector('[data-shared-share]');
 if(!image||!status||!button)return;
 const t=text=>window.NPI18n?.t(text)||text;
 let url=null;
 try{
  const {clues,layout}=window.NPShareModel.decode(location.hash),canvas=window.NPPatternShare.canvasFor(clues,layout);
  canvas.toBlob(blob=>{
   if(!blob){status.textContent=t('画像を作れませんでした。閉じて、もう一度お試しください。');return;}
   url=URL.createObjectURL(blob);image.src=url;image.hidden=false;
   status.textContent=t('リンクに含まれる初期数字だけを表示しています。画像を保存して解いたり、ほかの人に共有できます。');
   button.hidden=false;button.onclick=()=>window.NPPatternShare.open(clues,layout);
  },'image/png');
 }catch(_){status.textContent=t('問題リンクが正しくありません。送ってくれた人に、もう一度リンクを確認してもらってください。');}
 window.addEventListener('pagehide',event=>{if(!event.persisted&&url)URL.revokeObjectURL(url);});
})();
