'use client';
// Play-first home: the daily set and the ready-made collection lead. Creation
// stays available inside the notebook (pattern and multi-sudoku creation).
export default function GroupedHome({t,onPractice,onDaily,onPanel,markRead,unread,resume,Theme,Intro}:any){
 const art=(symbol:string)=><span className="choice-art" aria-hidden="true"><span className="art-emblem">{symbol}</span></span>;
 const arrow=<span className="choice-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span>;
 const now=new Date(),dateLabel=(now.getMonth()+1)+'月'+now.getDate()+'日（'+'日月火水木金土'.charAt(now.getDay())+'）';
 return <main className="start-screen designed-home np-stepped-home np-home-ready" data-grouped-home="" data-stepped-home="">
  <section className="pd-sec" id="pare-daily" aria-label={t('今日の問題')}><div className="pd-head"><h2 className="pd-title">{t('今日の問題')}</h2><span className="pd-date" data-pd-date="">{dateLabel}</span></div><div data-pd-body=""><div className="pd-board" aria-hidden="true"></div><div className="pd-pad" aria-hidden="true"><span className="pd-padbtn"></span><span className="pd-padbtn"></span><span className="pd-padbtn"></span><span className="pd-padbtn"></span><span className="pd-padbtn"></span><span className="pd-padbtn"></span><span className="pd-padbtn"></span><span className="pd-padbtn"></span><span className="pd-padbtn"></span><span className="pd-padbtn"></span></div><p className="pd-msg"></p><div className="pd-btns" aria-hidden="true"><span className="pd-btn"></span><span className="pd-btn"></span><span className="pd-btn"></span></div></div></section>
  <div className="start-choices">
   <button type="button" className="choice-card daily-choice" onClick={onDaily}>{art('日')}<span className="choice-copy"><strong>{t('ランキング問題に挑戦！')}</strong></span>{arrow}</button>
   <button type="button" className="choice-card main-choice" onClick={()=>onPractice()}>{art('数')}<span className="choice-copy"><strong>{t('自作のナンプレを作る')}</strong></span>{arrow}</button>
   <a className="choice-card collection-choice" href="/nanpure/collection/">{art('集')}<span className="choice-copy"><strong>{t('今日の問題集')}</strong></span>{arrow}</a>
   <a className="choice-card learn-choice" data-learning-entry="" href="/nanpure/learn/">{art('学')}<span className="choice-copy"><strong>{t('ナンプレを学ぶ')}</strong></span>{arrow}</a>
  </div>
  <div className="home-lower-row"><a className="home-back-pare" href="/"><span aria-hidden="true">‹</span>{t('パレあそびに戻る')}</a><button type="button" className="home-updates-entry" onClick={()=>{markRead?.();onPanel('updates')}}>{t('更新情報')}{unread&&<span className="home-updates-dot" aria-label={t('未読のお知らせあり')}/>}</button></div>
  {resume&&<button type="button" className="secondary-action home-resume" onClick={resume}>{t('続きから遊ぶ')}</button>}
  <a className="home-support-button" href="https://ofuse.me/memberships/5107" target="_blank" rel="noopener noreferrer">{t('月100円で製作者を応援しよう♫')}</a>
  <button type="button" className="tutorial-entry" hidden onClick={()=>onPanel('tutorial')}>{t('遊び方を確認する')}</button><Intro/>
 </main>
}
