/* Share display choices with native daily boards; gameplay flags still use the
   notebook's existing persistence and rendering path. */
(()=>{'use strict';
const api=window.NPBoardAppearance;if(!api)return;
const t=s=>window.NPI18n?.t(s)||s;
let queued=false;
const rows=[['regionWidth','枠線の太さ',['標準','太め','とても太い','極太','最大']],['cellWidth','マス線の太さ',['標準','太め','とても太い']],['digitWeight','数字の太さ',['標準','細め','中くらい','太め','極太']]];
function update(){
 queued=false;const dialog=document.getElementById('np-play-settings'),panel=dialog?.querySelector('[data-settings-panel="view"]');if(!panel)return;
 let card=panel.querySelector('#np-board-appearance-options');
 if(!card){
  card=document.createElement('fieldset');card.id='np-board-appearance-options';card.className='np-settings-card np-appearance-options';
  const legend=document.createElement('legend');legend.textContent=t('線と数字の見やすさ');card.append(legend);
  for(const[key,label,labels]of [...rows,['areaStrength','行・列・枠を強調表示',['なし','弱め','標準','強め']],['sameStrength','同じ数字を強調表示',['なし','弱め','標準','強め']]]){
   const row=document.createElement('label'),title=document.createElement('span'),select=document.createElement('select');title.textContent=t(label);select.dataset.appearance=key;
   const values=key.endsWith('Strength')?[0,1,2,3]:api.appearanceChoices[key];
   values.forEach((value,i)=>{const option=document.createElement('option');option.value=String(value);option.textContent=t(labels[i]);select.append(option)});
   select.onchange=()=>{
    const n=Number(select.value),flag=key==='areaStrength'?'highlight-area':key==='sameStrength'?'highlight-same':null;
    try{
     if(!flag||n)api.saveAppearance({...api.readAppearance(),[key]:n});
     if(flag){const input=dialog.querySelector('#'+flag);if(input&&input.checked!==!!n&&!input.disabled)input.click();}
     card.querySelector('[role="status"]').textContent='';
    }catch{card.querySelector('[role="status"]').textContent=t('設定を保存できませんでした。');}
    schedule();
   };
   row.append(title,select);card.append(row);
  }
  const hint=document.createElement('small');hint.textContent=t('枠線は、マスのまとまりやジグソーの領域を囲む線です。');
  const status=document.createElement('p');status.className='np-appearance-status';status.setAttribute('role','status');card.append(hint,status);panel.append(card);
 }
 const value=api.readAppearance();
 for(const select of card.querySelectorAll('[data-appearance]')){
  const key=select.dataset.appearance,flag=key==='areaStrength'?'highlight-area':key==='sameStrength'?'highlight-same':null;
  const input=flag?dialog.querySelector('#'+flag):null;
  if(input)input.closest('label')?.classList.add('np-appearance-legacy');
  select.value=String(input&&!input.checked?0:value[key]);select.disabled=!!input?.disabled;
 }
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(update)}}
api.watchAppearance(schedule);window.addEventListener('np-language-change',schedule);
new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});schedule();
})();
