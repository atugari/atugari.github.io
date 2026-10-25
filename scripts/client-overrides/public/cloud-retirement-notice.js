(function(w){'use strict';
if(w.NPCloudRetirement)return;
const retirement=__CLOUD_RETIRE_AT__,key='np-cloud-retirement-notice-v1';
let memory={count:0,lastAt:0},offset=0,pending=null,dialog=null,timer=0,autoDay='',queued=false,starting=false,replay=false;
const now=()=>Date.now()+offset;
const day=time=>new Date(time+9*3600000).toISOString().slice(0,10);
const t=text=>w.NPI18n?.t(text)||text;
function state(){try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value?.retirement===retirement&&Number.isInteger(value.count)&&value.count>=0&&value.count<=2&&Number.isFinite(value.lastAt))return{retirement,count:Math.max(value.count,memory.count),lastAt:Math.max(value.lastAt,memory.lastAt)}}catch{}return memory}
function record(){const value={retirement,count:Math.min(2,state().count+1),lastAt:now()};memory=value;try{localStorage.setItem(key,JSON.stringify(value))}catch{}if(value.count===2){observer.disconnect();document.removeEventListener('visibilitychange',inspect);document.removeEventListener('click',beforeStart,true);w.removeEventListener('focus',inspect)}return value}
function expire(){if(dialog?.open)dialog.close();observer.disconnect();clearTimeout(timer)}
function schedule(){clearTimeout(timer);const delay=retirement-now();if(delay<=0){expire();return}timer=setTimeout(schedule,Math.min(2147483647,delay+1))}
function show(){
 if(now()>=retirement)return Promise.resolve(false);
 if(state().count>=2)return Promise.resolve(true);
 if(pending)return pending;
 const previous=document.activeElement;
 let finish;pending=new Promise(resolve=>{finish=resolve});const result=pending;
 const box=document.createElement('dialog');dialog=box;box.className='np-cloud-retirement-dialog';box.setAttribute('aria-labelledby','np-cloud-retirement-title');
 const title=document.createElement('h2');title.id='np-cloud-retirement-title';title.tabIndex=-1;title.textContent=t('クラウド保存終了のお知らせ（{count}/2）').replace('{count}',String(state().count+1));
 const date=document.createElement('strong');date.className='np-cloud-retirement-date';date.textContent=t('クラウド保存は2026年11月9日0時（日本時間）に終了します。');
 const copy=document.createElement('div');
 for(const text of ['終了時に全員のクラウド保存データを削除します。保存し直しても期限は延びません。','端末内の問題・途中経過と保存したファイルは消えません。']){const p=document.createElement('p');p.textContent=t(text);copy.append(p)}
 const steps=document.createElement('p');steps.textContent=t('保存・引き継ぎ')+'： '+t('クラウドから読み込む')+' → '+t('引き継ぎファイルを保存');copy.append(steps);
 const button=document.createElement('button');button.type='button';button.className='primary';button.textContent=t('確認しました');let confirmed=false;
 button.addEventListener('click',()=>{if(now()<retirement){record();confirmed=true}box.close()});
 box.addEventListener('cancel',event=>event.preventDefault());
 box.addEventListener('close',()=>{box.remove();if(dialog===box)dialog=null;pending=null;if(previous?.isConnected)previous.focus?.({preventScroll:true});finish(confirmed)});
 box.append(title,date,copy,button);document.body.append(box);box.showModal();title.focus({preventScroll:true});return result;
}
function onEntry(serverNow){
 if(Number.isFinite(serverNow)){offset=serverNow-Date.now();schedule()}
 const s=state();if(now()>=retirement||s.count>=2||s.count===1&&day(s.lastAt)===day(now()))return Promise.resolve(false);
 autoDay=day(now());return show();
}
async function beforeUse(){while(state().count<2){if(now()>=retirement||!await show())return false}return now()<retirement}
function beforeStart(event){
 if(replay||now()>=retirement||state().count>=2)return;
 const target=event.target.closest?.('.designed-home button,.designed-home a');if(!target||target.disabled)return;
 let known=false;try{known=/^[a-f0-9]{64}$/.test(localStorage.getItem('np-cloud-sync-key-v1')||'')}catch{}if(!known)return;
 event.preventDefault();event.stopImmediatePropagation();if(starting)return;starting=true;
 void beforeUse().then(ok=>{if(ok&&target.isConnected){replay=true;try{target.click()}finally{replay=false}}}).finally(()=>{starting=false});
}
function inspect(){
 if(pending||document.hidden||now()>=retirement||autoDay===day(now()))return;
 let known=false;try{known=/^[a-f0-9]{64}$/.test(localStorage.getItem('np-cloud-sync-key-v1')||'')}catch{}
 const home=document.querySelector('.site-shell.mode-home .designed-home');
 if(known&&home?.getClientRects().length&&!document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]'))void onEntry();
}
const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;inspect()})});
w.NPCloudRetirement={onEntry,beforeUse,getCount:()=>state().count,retirement};
if(state().count<2){let known=false;try{known=/^[a-f0-9]{64}$/.test(localStorage.getItem('np-cloud-sync-key-v1')||'')}catch{}if(known)observer.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('visibilitychange',inspect);document.addEventListener('click',beforeStart,true);w.addEventListener('focus',inspect)}schedule();inspect();
})(window);
