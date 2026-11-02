'use client';
import {useEffect,useState} from 'react';
import {Trophy,ChartNoAxesColumn,RefreshCw} from 'lucide-react';
import {dailyTitle,levelLabel} from '../lib/locale';
import {formatTime} from '../lib/daily-play';
import type {DailySummary} from '../lib/daily-types';
import {useLocale} from './locale-context';

type RankingMode='time'|'score';
type RankingPeriod='today'|'week'|'month'|'all';
type RankingRow={rank:number;name:string;elapsed:number;score:number;clears:number;isMe:boolean};
type RankingResult={
 day:string;mode:RankingMode;period:RankingPeriod;from:string|null;to:string;timezone:string;
 rows:RankingRow[];totalPlayers:number;myRank:number|null;myEntry:RankingRow|null;completed:number;
 page:number;pageSize:number;totalPages:number;hasMore:boolean;myPage:number|null;
 scoring:{basePoints:number[];maxBonusRatio:number;referenceMsPerCell:number;formula:string};
};
export default function RankingPanel({level,onLevel,challenges}:{level:number;onLevel:(level:number)=>void;challenges:DailySummary[]}){
 const {locale,t}=useLocale();
 const periods:[RankingPeriod,string][]=[['today','今日'],['week','今週'],['month','今月'],['all','累計']];
 const [mode,setMode]=useState<RankingMode>('time');
 const [period,setPeriod]=useState<RankingPeriod>('today');
 const [page,setPage]=useState(1);
 const [revision,refresh]=useState(0);
 const [result,setResult]=useState<RankingResult|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(false);
 const [nickname,setNickname]=useState(''),[profileLoading,setProfileLoading]=useState(true),[profileBusy,setProfileBusy]=useState(false),[profileMessage,setProfileMessage]=useState('');
 const number=(value:number)=>new Intl.NumberFormat(locale).format(value);
 const date=(value:string)=>new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',year:'numeric',month:'short',day:'numeric'}).format(new Date(value+'T00:00:00+09:00'));
 useEffect(()=>{
  let active=true;
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),20000);
  setLoading(true);setError(false);setResult(null);
  const params=new URLSearchParams({mode,period:mode==='time'?'today':period,level:String(level),page:String(page)});
  (async()=>{
   try{
    const response=await fetch('/api/ranking?'+params,{signal:controller.signal});
    if(!response.ok)throw Error('Ranking request failed');
    const data:RankingResult=await response.json();
    if(!Array.isArray(data.rows)||data.mode!==mode||!Number.isInteger(data.totalPlayers))throw Error('Invalid ranking response');
    if(active)setResult(data);
   }catch{if(active)setError(true)}
   finally{window.clearTimeout(timeout);if(active)setLoading(false)}
  })();
  return()=>{active=false;window.clearTimeout(timeout);controller.abort()};
 },[mode,period,level,page,revision]);
 useEffect(()=>{
  let active=true;const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),20000);
  (async()=>{try{
   const response=await fetch('/api/ranking-profile',{signal:controller.signal});const data=await response.json();
   if(!response.ok||typeof data.name!=='string')throw Error('Profile request failed');
   if(active){setNickname(data.name);try{localStorage.setItem('np-display-name',data.name);window.dispatchEvent(new Event('np-ranking-name-change'));}catch{}}
  }catch{if(active)setProfileMessage('通信できませんでした。少し待って再試行してください。');}
  finally{window.clearTimeout(timeout);if(active)setProfileLoading(false);}})();
  return()=>{active=false;window.clearTimeout(timeout);controller.abort();};
 },[]);
 async function saveProfile(event:React.FormEvent){
  event.preventDefault();if(profileBusy||profileLoading)return;const clean=nickname.normalize('NFKC').trim();if([...clean].length>16||/[\p{Cc}\p{Cf}]/u.test(clean)){setProfileMessage('ニックネームは16文字以内で入力してください。');return;}setProfileBusy(true);setProfileMessage('');
  const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch('/api/ranking-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:nickname}),signal:controller.signal});
   const data=await response.json();if(!response.ok||typeof data.name!=='string')throw Error('Profile save failed');
   setNickname(data.name);try{localStorage.setItem('np-display-name',data.name);window.dispatchEvent(new Event('np-ranking-name-change'));}catch{}
   setProfileMessage('保存しました。');refresh(value=>value+1);
  }catch{setProfileMessage('通信できませんでした。少し待って再試行してください。');}
  finally{window.clearTimeout(timeout);setProfileBusy(false);}
 }
 const selected=result?challenges.find(p=>p.level===level&&p.day===result.day):null;
 const rank=(value:number)=>t('{rank}位',{rank:number(value)});
 const metric=(entry:RankingRow)=>{const milliseconds=Math.max(0,Math.trunc(entry.elapsed));return mode==='time'?formatTime(milliseconds)+'.'+String(milliseconds%1000).padStart(3,'0'):number(entry.score)+' pt'};
 const scoreLabel=mode==='time'?t('クリアタイム'):t('合計スコア');
 const range=result?(result.from&&result.from!==result.to?date(result.from)+' – '+date(result.to):result.from?date(result.to):t('集計開始から今日まで')):'';
 return <section className="ranking world-ranking" aria-labelledby="world-ranking-title">
  <h2 id="world-ranking-title">{t('世界ランキング')}</h2>
  <p className="ranking-intro">{t('日替わり問題をクリアすると、自動でランキングに記録されます。')}</p>
  <form className="ranking-profile" onSubmit={saveProfile} aria-busy={profileBusy||profileLoading}>
   <label htmlFor="ranking-nickname">{t('ニックネーム')}</label>
   <p className="ranking-profile-note" translate="no" data-i18n-skip="true">{t('名前なしは「{name}」です。変更は過去の記録にも反映され、空欄で保存すると名前を戻せます。',{name:'ナンプレイヤー'})}</p>
   <div className="ranking-profile-controls"><input id="ranking-nickname" value={nickname} onChange={event=>setNickname(event.target.value)} maxLength={32} autoComplete="off" disabled={profileBusy||profileLoading} placeholder={t('ニックネーム')}/><button type="submit" disabled={profileBusy||profileLoading}>{t(profileBusy?'確認中…':'保存する')}</button></div>
   {profileMessage&&<p role="status">{t(profileMessage)}</p>}
  </form>
  <div className="ranking-mode-controls" role="group" aria-label={t('ランキングの種類')}>
   <button type="button" aria-pressed={mode==='time'} onClick={()=>{setMode('time');setPage(1)}}><Trophy size={19} aria-hidden="true"/><span>{t('世界タイム')}</span></button>
   <button type="button" aria-pressed={mode==='score'} onClick={()=>{setMode('score');setPage(1)}}><ChartNoAxesColumn size={19} aria-hidden="true"/><span>{t('スコア')}</span></button>
  </div>
  {mode==='time'?<>
   <p className="ranking-mode-description">{t('同じ日の同じ問題で、クリアタイムを競います。')}</p>
   <div className="ranking-filters" role="group" aria-label={t('難易度')}>{[1,2,3].map(value=><button type="button" key={value} aria-pressed={level===value} onClick={()=>{onLevel(value);setPage(1)}}>{levelLabel(locale,value)}</button>)}</div>
  </>:<>
   <p className="ranking-mode-description">{t('クリアした日替わり問題の得点を合計します。')}</p>
   <div className="ranking-filters ranking-periods" role="group" aria-label={t('集計期間')}>{periods.map(([value,label])=><button type="button" key={value} aria-pressed={period===value} onClick={()=>{setPeriod(value);setPage(1)}}>{t(label)}</button>)}</div>
  </>}
  <div className="ranking-results" aria-busy={loading}>
   {loading?<p className="ranking-notice" role="status">{t('ランキングを読み込んでいます…')}</p>:error?<div className="ranking-notice" role="status"><p>{t('ランキングを読み込めませんでした。通信を確認して再試行してください。')}</p><button type="button" className="secondary-action" onClick={()=>refresh(v=>v+1)}>{t('再試行')}</button></div>:result?<>
    <p className="ranking-range">{mode==='time'?(selected?dailyTitle(locale,selected):date(result.day)+' · '+levelLabel(locale,level)):range}</p>
    <div className="ranking-summary-line"><span>{t('参加者 {count}人',{count:number(result.totalPlayers)})}</span><button type="button" className="ranking-refresh" onClick={()=>refresh(v=>v+1)}><RefreshCw size={15} aria-hidden="true"/>{t('更新')}</button></div>
    <div className="ranking-my-place" aria-label={t('あなたの順位')}>
     <div><span>{t('あなたの順位')}</span><strong>{result.myEntry?rank(result.myEntry.rank):'—'}</strong></div>
     {result.myEntry?<div className="ranking-my-score"><b aria-label={scoreLabel}>{metric(result.myEntry)}</b>{mode==='score'&&<small>{t('{count}問クリア',{count:number(result.myEntry.clears)})}</small>}</div>:<p>{t('この期間のクリア記録はまだありません。')}</p>}
    </div>
    {result.rows.length?<>
     <div className="ranking-list-head"><span>{t('順位・表示名')}</span><span>{scoreLabel}</span></div>
     <ol className="world-rank-list" aria-label={t('ランキング')} start={(page-1)*50+1}>
      {result.rows.map((row,index)=><li key={index} className={row.isMe?'ranking-is-me':undefined} aria-current={row.isMe?'true':undefined}>
       <span className="ranking-position" aria-label={rank(row.rank)}>{number(row.rank)}</span>
       <div className="ranking-player"><span className="ranking-player-name" translate="no" data-i18n-skip="true">{row.name}</span>{row.isMe&&<small className="ranking-you">{t('あなた')}</small>}{mode==='score'&&<small className="ranking-clears">{t('{count}問クリア',{count:number(row.clears)})}</small>}</div>
       <b className="ranking-value" aria-label={scoreLabel}>{metric(row)}</b>
      </li>)}
     </ol>
     <p className="ranking-footnote">{t('全員の記録を50人ずつ表示します。同じ記録は同順位です。')}</p>
     <nav className="ranking-pages" aria-label={t('ランキングのページ')}><button type="button" onClick={()=>setPage(value=>value-1)} disabled={page<=1}>{t('前へ')}</button><span>{number(result.page||page)} / {number(result.totalPages||1)}</span><button type="button" onClick={()=>setPage(value=>value+1)} disabled={!result.hasMore}>{t('次へ')}</button></nav>
     {result.myPage&&result.myPage!==page&&<button type="button" className="ranking-my-page" onClick={()=>setPage(result.myPage!)}>{t('自分の記録を見る')}</button>}
    </>:<div className="ranking-empty"><Trophy size={30} aria-hidden="true"/><p>{t('まだ記録はありません')}</p></div>}
    {!result.myEntry&&<p className="ranking-join-note">{t('日替わり問題をクリアすると、自動でランキングに記録されます。')}</p>}
   </>:null}
  </div>
  <details className="ranking-guide"><summary>{t('集計とスコアのしくみ')}</summary>
   {mode==='time'&&result&&<p>{t('この問題をクリアした人')}：<b>{number(result.completed)}</b><br/>{t('ランキング挑戦で正解を確認した記録の数です。')}</p>}
   <p>{t('集計は日本時間。今週は月曜から、今月は1日からです。')}</p>
   <p>{t('同じ問題は1人1記録。練習プレイは集計しません。')}</p>
   <p>{t('自分の順位は、このブラウザの記録で判定します。')}</p>
   <p>{t('スコアは基本点＋速さボーナス。基本点は簡単1,000点・普通2,000点・難問3,000点です。')}</p>
   <p>{t('基準時間はマス数×5秒。速さボーナスは「基本点の半分×基準時間÷（基準時間＋クリア時間）」の小数点以下切り捨てです。')}</p>
   <p>{t('例：9×9の簡単を6分45秒でクリアすると、1,250点です。')}</p>
  </details>
 </section>;
}
