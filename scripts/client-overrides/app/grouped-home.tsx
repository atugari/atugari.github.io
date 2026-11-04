'use client';
// The creation entry opens the notebook directly at its generation menu.
export default function GroupedHome({t,onPractice,onDaily,onPanel,resume,markRead,unread,version,Theme,Intro,showRanking}:any){
 const news=()=>{markRead();onPanel('updates')};
 const art=(symbol:string)=><span className="choice-art" aria-hidden="true"><span className="art-emblem">{symbol}</span></span>;
 const arrow=<span className="choice-arrow" aria-hidden="true">›</span>;
 return <main className="start-screen designed-home np-stepped-home np-home-ready" data-grouped-home="" data-stepped-home="">
  <div className="home-topline"><Theme compact onOpen={()=>onPanel('theme')}/></div>
  <div className="start-choices">
   <button type="button" className="choice-card main-choice" onClick={()=>onPractice()}>{art('数')}<span className="choice-copy"><strong>{t('ナンプレで遊ぶ')}</strong></span>{arrow}</button>
   <button type="button" className="choice-card create-choice" onClick={()=>onPractice('open-create')}>{art('作')}<span className="choice-copy"><strong>{t('ナンプレを作る')}</strong></span>{arrow}</button>
   <button type="button" className="choice-card daily-choice" onClick={onDaily}>{art('日')}<span className="choice-copy"><strong>{t('日替わりナンプレに挑戦する')}</strong></span>{arrow}</button>
   <a className="choice-card learn-choice" data-learning-entry="" href="/nanpure/learn/">{art('学')}<span className="choice-copy"><strong>{t('ナンプレを学ぶ')}</strong></span>{arrow}</a>
   <details className="np-home-more">
    <summary className="choice-card works-choice">{art('作')}<span className="choice-copy"><strong>{t('ナンプレの作品を見る')}</strong></span>{arrow}</summary>
    <nav aria-label={t('ナンプレの作品を見る')}><a className="home-event" href="/nanpure/exhibitions/">{t('企画展')}</a><a data-gallery-entry="" href="/nanpure/gallery/">{t('自分の展示室（制作中）')}</a><a href="/nanpure/exhibitions/?view=replays">{t('解答リプレイ')}</a></nav>
   </details>
  </div>
  {resume&&<button type="button" className="secondary-action home-resume" onClick={resume}>{t('続きから遊ぶ')}</button>}
  <div className="home-bottom-links">{showRanking&&<button type="button" onClick={()=>onPanel('ranking')}>{t('ランキング')}</button>}<button type="button" onClick={news}>{t('更新のお知らせ')}{unread&&<span className="home-new-dot" aria-label={t('新着')}/>}</button><button type="button" data-home-guide="" onClick={()=>(window as any).NPHomeLayout?.showGuide()}>{t('遊び方と保存')}</button></div>
  <a className="np-pare-entry" data-pare-entry="" href="/puzzles/"><span><strong>{t('ほかのパズルはパレあそびへ')}</strong><small>{t('シルプレ・和同開珎・クロスワードなど')}</small></span>{arrow}</a>
  <a className="home-support-button" href="https://ofuse.me/memberships/5107" target="_blank" rel="noopener noreferrer">{t('月100円で制作を応援')} ↗</a>
  <button type="button" className="home-version" onClick={news}><span translate="no" data-i18n-skip="true">{version}</span></button>
  <button type="button" className="tutorial-entry" hidden onClick={()=>onPanel('tutorial')}>{t('遊び方を確認する')}</button><Intro/>
 </main>
}
