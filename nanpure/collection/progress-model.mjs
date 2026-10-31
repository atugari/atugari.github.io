// Progress metadata only: puzzle IDs, boards and the player's saves stay intact.
const timestamp=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=8640000000000000?value:0;
export function lastPlayedTime(row){return timestamp(row?.lastPlayedAt)||timestamp(row?.updated);}
export function progressDate(row,now=Date.now()){
 const value=lastPlayedTime(row);
 if(!value)return null;
 const date=new Date(value),today=new Date(now);
 const day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
 const days=Math.round((day(today)-day(date))/86400000);
 const relative=days===0?'今日':days===1?'昨日':days>=2&&days<=7?days+'日前':'';
 const text=new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
 return {iso:date.toISOString(),text:(timestamp(row?.lastPlayedAt)?'最終プレイ：':'記録日時：')+text+(relative?'（'+relative+'）':'')};
}
export function nextProgress(previous,id,state,activityAt,now=Date.now()){
 const lastPlayedAt=Math.max(timestamp(previous?.lastPlayedAt),timestamp(activityAt));
 const changed=previous?.state!==state;
 if(!changed&&lastPlayedAt===timestamp(previous?.lastPlayedAt))return null;
 return {...previous,id,state,...(changed?{updated:now}:{}),...(lastPlayedAt?{lastPlayedAt}:{})};
}
