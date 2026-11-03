'use client';
// These are the shell's real navigation callbacks and saved resume state.
export default function GroupedHome({t,onPractice,onDaily,onPanel,resume,markRead,unread,version,Theme,Intro,showRanking}:any){
 const news=()=>{markRead();onPanel('updates')};
 const tile=(tone:string,icon:string,title:string,copy:string,action:any,extra:any={})=>{
  const Tag=typeof action==='string'?'a':'button';return <Tag className={'np-home-tile '+tone} {...(typeof action==='string'?{href:action}:{type:'button',onClick:action})} {...extra}><span className="np-tile-icon" aria-hidden="true">{icon}</span><span><strong>{t(title)}</strong><small>{t(copy)}</small></span><span className="np-tile-arrow" aria-hidden="true">↗</span></Tag>
 };
 return <main className="start-screen designed-home np-grouped-home" data-grouped-home="">
  <div className="np-home-hero"><div><p className="np-home-kicker">PUZZLE &amp; NOTEBOOK</p><h1>{t('ひと息ついて、数字と遊ぶ。')}</h1><p>{t('やりたいことから、ひとつ。')}</p></div>{resume&&<button type="button" className="home-resume" onClick={resume}><span aria-hidden="true">▶</span><span><strong>{t('続きから遊ぶ')}</strong><small>{t('保存した日替わりの途中経過を再開')}</small></span><span aria-hidden="true">→</span></button>}</div>
  <div className="np-home-columns"><fieldset className="np-home-play"><legend>{t('遊ぶ・作る・学ぶ')}</legend><div className="np-home-action-grid start-choices">
   {tile('np-tone-play','▦','すぐ遊ぶ','問題集から選んで、すぐスタート。','/nanpure/collection/',{'data-collection-entry':''})}
   {tile('np-tone-daily daily-choice','☀','日替わり問題帳','毎日3問。今日のひらめきに出会う。',onDaily)}
   {tile('np-tone-create','✎','問題を作る','条件を選ぶ・模様を描く。',()=>onPractice('open-create'))}
   {tile('np-tone-learn','▤','解法で学ぶ','手順を追って、ひらめきを自分の力に。','/nanpure/learn/',{'data-learning-entry':''})}
  </div><button type="button" className="np-home-saved main-choice" onClick={()=>onPractice()}><span><strong>{t('自由に遊ぶ')}</strong><small>{t('保存した問題・印刷・作成履歴')}</small></span> <span aria-hidden="true">→</span></button></fieldset>
  <div className="np-home-side"><fieldset className="np-home-records"><legend>{t('記録と達成')}</legend><div className="np-home-record-grid">
   {showRanking&&tile('','♜','ランキング','みんなの記録を見る',()=>onPanel('ranking'))}
   {tile('','▥','自分の記録','自分のペースで振り返る',()=>onPanel('personal'))}
   {tile('','▦','カレンダー','過去の日替わり・達成メダル',()=>onPanel('calendar'))}
   <div className="home-topline np-home-achievement-slot" />
  </div></fieldset><fieldset className="np-home-works"><legend>{t('作品を楽しむ')}</legend><div className="np-home-work-links"><a className="home-event" href="/nanpure/exhibitions/">{t('企画展')} <span aria-hidden="true">↗</span></a><a href="/nanpure/gallery/">{t('自分の展示室（制作中）')} <span aria-hidden="true">↗</span></a><a href="/nanpure/exhibitions/?view=replays">{t('解答リプレイ')} <span aria-hidden="true">↗</span></a></div></fieldset></div></div>
  <footer className="np-home-footer"><div className="np-home-utilities home-bottom-links"><button className="np-backup-entry" type="button" onClick={()=>onPanel('backup')}>{t('保存・引き継ぎ')}</button><button type="button" data-home-guide="" onClick={()=>(window as any).NPHomeLayout?.showGuide()}>{t('遊び方と保存')}</button><button type="button" onClick={news}>{t('更新のお知らせ')}{unread&&<span className="home-new-dot" aria-label={t('新着')}/>}</button><button type="button" onClick={()=>onPanel('contact')}>{t('お問い合わせ')}</button><Theme compact onOpen={()=>onPanel('theme')}/></div><div className="np-home-footnote"><a data-pare-entry="" className="np-pare-entry" href="/puzzles/"><span><strong>{t('ほかのパズルはパレあそびへ')}</strong><small>{t('シルプレ・和同開珎・クロスワードなど')}</small></span><span aria-hidden="true">↗</span></a><a className="home-support-button" href="https://ofuse.me/memberships/5107" target="_blank" rel="noopener noreferrer">{t('月100円で制作を応援')} ↗</a><button type="button" className="home-version" onClick={news}><span translate="no" data-i18n-skip="true">{version}</span></button></div></footer>
  <button type="button" className="tutorial-entry" hidden onClick={()=>onPanel('tutorial')}>{t('遊び方を確認する')}</button><Intro/>
 </main>
}
