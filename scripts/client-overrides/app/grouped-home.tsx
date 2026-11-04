'use client';
// The creation entry opens the notebook directly at its generation menu.
export default function GroupedHome({t,onPractice,onDaily,onPanel,resume,Theme,Intro}:any){
 const art=(symbol:string)=><span className="choice-art" aria-hidden="true"><span className="art-emblem">{symbol}</span></span>;
 const arrow=<span className="choice-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span>;
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
  <a className="home-support-button" href="https://ofuse.me/memberships/5107" target="_blank" rel="noopener noreferrer">{t('月100円で製作者を応援しよう♫')}</a>
  <button type="button" className="tutorial-entry" hidden onClick={()=>onPanel('tutorial')}>{t('遊び方を確認する')}</button><Intro/>
 </main>
}
