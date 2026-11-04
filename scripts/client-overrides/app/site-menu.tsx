'use client';
import type {ReactNode} from 'react';
import {currentVersion} from '../lib/releases';
import {Palette,Music,CalendarDays,SlidersHorizontal,BookOpen,ChartNoAxesColumn,Download,Heart,Mail,HelpCircle,ChevronRight,Sparkles,Shield,ExternalLink,Keyboard} from 'lucide-react';
import {useLocale} from './locale-context';

export type MenuPanel='updates'|'help'|'tutorial'|'settings'|'personal'|'backup'|'support'|'contact'|'faq'|'calendar'|'audio'|'theme';

export default function SiteMenu({onOpen,daily,unread,newVersion}:{onOpen:(panel:MenuPanel,trigger:HTMLButtonElement)=>void;daily:boolean;unread:boolean;newVersion:boolean}){
 const {t}=useLocale();
 const label=(title:string,description:string,Icon:typeof Mail)=><><span className="menu-symbol"><Icon size={21} aria-hidden="true"/></span><span className="menu-copy"><strong>{t(title)}</strong><small>{t(description)}</small></span><ChevronRight className="menu-chevron" size={17} aria-hidden="true"/></>;
 const item=(panel:MenuPanel,title:string,description:string,Icon:typeof Mail,tone='green')=><button type="button" className={'menu-entry tone-'+tone} data-menu-panel={panel} onClick={event=>onOpen(panel,event.currentTarget)}>{label(title,description,Icon)}</button>;
 const group=(id:string,title:string,description:string,Icon:typeof Mail,tone:string,children:ReactNode)=><details className="menu-group" data-menu-group={id}>
  <summary className={'menu-entry tone-'+tone}>{label(title,description,Icon)}</summary>
  <div className="menu-group-items">{children}</div>
 </details>;
 return <section className="site-menu">
  <h2>{t('設定・メニュー')}</h2>
  <div className="menu-categories">
   {item('theme','デザイン','3つの雰囲気を切り替える',Palette,'gold')}
   {item('settings','見やすさ・操作の設定','色・文字の大きさ・タップの補助',SlidersHorizontal)}
   {group('play','遊び方・音','チュートリアル・キーボード・BGM',BookOpen,'green',<>
    {item('tutorial','遊び方・チュートリアル','数字の入れ方を試す',BookOpen)}
    {daily&&item('help','この問題のルール','追加ルールを確認する',HelpCircle)}
    <button type="button" className="menu-entry tone-blue" data-np-keyboard-help onClick={()=> (window as any).NPKeyboard?.showHelp()}>{label('キーボード操作','Tab・矢印キー・数字キーの使い方',Keyboard)}</button>
    {item('audio','BGM・効果音','曲・音の種類・音量を選ぶ',Music,'gold')}
   </>)}
   {group('records','記録・データ','自分の記録・カレンダー・保存',ChartNoAxesColumn,'blue',<div className="menu-records" data-menu-records="">
    {item('personal','自分の記録','自分のペースで振り返る',ChartNoAxesColumn,'blue')}
    {item('calendar','日替わりカレンダー','過去の問題・月の達成メダル',CalendarDays,'gold')}
    {item('backup','保存・引き継ぎ','ファイル・クラウドに保存',Download,'blue')}
   </div>)}
   {group('help','困ったとき・応援','お問い合わせ・よくある質問・更新',HelpCircle,'rose',<>
    {item('contact','お問い合わせ','質問・不具合を送る／返答を見る',Mail,'blue')}
    {item('faq','よくある質問','気になることを調べる',HelpCircle)}
    {item('support','制作を応援','OFUSEで応援する',Heart,'rose')}
    <button className="menu-news" type="button" onClick={event=>onOpen('updates',event.currentTarget)}><Sparkles size={19} aria-hidden="true"/><span>{t(newVersion?'新しい版があります':'更新・不具合修正')}</span>{(unread||newVersion)&&<small>{t('新着')}</small>}<ChevronRight size={17} aria-hidden="true"/></button>
    <button className="site-version-link" type="button" onClick={event=>onOpen('updates',event.currentTarget)}><span>{t('サイトのバージョン')}</span><code translate="no" data-i18n-skip="true">{currentVersion}</code><ChevronRight size={16} aria-hidden="true"/></button>
    <footer className="menu-footer"><a href="/privacy"><Shield size={16} aria-hidden="true"/>{t('利用案内')}</a><a href="https://atugari.github.io/plaza.html">{t('ゲーム広場へ')}<ExternalLink size={15} aria-hidden="true"/></a></footer>
   </>)}
  </div>
 </section>
}
export function Faq({onContact}:{onContact:()=>void}){const{t}=useLocale();const entries=[['ランキングはどこで競える？','日替わり問題帳の「今日のランキング」で記録を見られます。クリアした人は自動で掲載され、ニックネームはランキング画面で変更できます。'],['普通に遊ぶとランキング挑戦の違いは？','普通に遊ぶ場合は0:00から始め、画面を離れている間は計測しません。ランキングは開始から正解の確認まで、離れている間も計測します。'],['お問い合わせの返答はどこで見られる？','お問い合わせを開き、「自分のお問い合わせ・返答を見る」を押してください。メール通知はありません。'],['画像はどうやって送る？','プレイ画面の「お問い合わせ」で「このサイトの画面を撮影」を押すか、「端末の画像を選ぶ」を押します。プレビューと文章を確認してから送信してください。']];return <section className="faq-panel"><h2>{t('よくある質問')}</h2>{entries.map(([q,a])=><details key={q}><summary>{t(q)}</summary><p>{t(a)}</p></details>)}<button className="secondary-action" onClick={onContact}>{t('解決しないときはお問い合わせ')}</button></section>}
