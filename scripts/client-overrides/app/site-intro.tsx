'use client';
import {useLocale} from './locale-context';

const guides=[
 ['guide','遊び方と保存','基本ルール・始め方・引き継ぎ'],
 ['sudoku-types','種類とサイズ','ジグソー・キラーなどの違い'],
 ['print','印刷の使い方','A4・A3・PDF保存'],
] as const;

export default function SiteIntro(){
 const{locale,t}=useLocale();
 return <section className="site-intro" aria-labelledby="site-intro-title">
  <h2 id="site-intro-title">{t('ナンプレ帳でできること')}</h2>
  <p className="site-intro-copy">{t('ナンプレ帳は、スマホやパソコンで遊べる無料のナンプレ（数独）です。登録不要で、好きな条件の問題づくり、毎日3問の日替わり、途中保存、印刷を利用できます。')}</p>
  {locale!=='ja'&&<p className="site-intro-language" id="site-guide-language">{t('ガイド本文は日本語です。')}</p>}
  <nav className="site-intro-links" aria-label={t('ナンプレ帳のガイド')} aria-describedby={locale!=='ja'?'site-guide-language':undefined}>
   {guides.map(([slug,label,detail])=><a key={slug} href={'/nanpure/'+slug+'/'} hrefLang="ja"><span><strong>{t(label)}</strong><small>{t(detail)}</small></span><span className="site-intro-arrow" aria-hidden="true">›</span></a>)}
  </nav>
 </section>
}
