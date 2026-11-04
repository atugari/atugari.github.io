'use client';
import {useEffect,useState} from 'react';
import {Palette} from 'lucide-react';
import {useLocale} from './locale-context';

const themes=[
 {id:'notebook',letter:'A',name:'上質な手帳'},
 {id:'color',letter:'B',name:'カラフルなパズル帳'},
 {id:'lounge',letter:'C',name:'深い藍のラウンジ'},
 {id:'contrast-light',letter:'D',name:'色の見分けを助ける配色（明）'},
 {id:'contrast-dark',letter:'E',name:'色の見分けを助ける配色（暗）'},
] as const;

function useSiteTheme(){
 const [theme,setCurrent]=useState<string>('notebook'),[error,setError]=useState('');
 useEffect(()=>{
  const sync=()=>{const site=(window as any).NPSiteTheme;setCurrent(site?.get()||'notebook');setError(site?.status()||'')};
  sync();
  window.addEventListener('np-theme-change',sync);
  return()=>window.removeEventListener('np-theme-change',sync);
 },[]);
 return {theme,error,setTheme:(id:string)=>(window as any).NPSiteTheme?.set(id)};
}

export function ThemeEntry({onOpen,compact=false}:{onOpen:()=>void;compact?:boolean}){
 const {theme}=useSiteTheme(),{t}=useLocale();
 const option=themes.find(item=>item.id===theme)||themes[0];
 return <button type="button" className={compact?'theme-entry compact':'secondary-action theme-entry'} onClick={onOpen}>
  <Palette size={18} aria-hidden="true"/>
  <span>{t('背景とボタンを変更')}<small aria-hidden={compact||undefined}>{compact?option.letter:t(option.name)}</small></span>
 </button>;
}

export default function ThemeSettings(){
 const {t}=useLocale(),{theme,setTheme,error}=useSiteTheme();
 const [preview,setPreview]=useState<number|null>(null);
 const index=preview??Math.max(0,themes.findIndex(item=>item.id===theme));
 const option=themes[index],selected=option.id===theme;
 const image='/nanpure/assets/theme-previews/'+option.id;
 const move=(step:number)=>setPreview((index+step+themes.length)%themes.length);
 return <section className="theme-settings theme-preview-settings">
  <h2>{t('背景とボタンを変更')}</h2>
  <div className="theme-preview-nav">
   <button type="button" aria-label={t('前へ')} onClick={()=>move(-1)}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>
   </button>
   <div aria-live="polite"><strong>{t(option.name)}</strong><small>{index+1} / {themes.length}</small></div>
   <button type="button" aria-label={t('次へ')} onClick={()=>move(1)}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>
   </button>
  </div>
  <button type="button" className="theme-preview-choice" aria-pressed={selected} data-theme-preview={option.id} onClick={()=>setTheme(option.id)}>
   <picture>
    <source media="(max-width: 650px) and (orientation: portrait)" srcSet={image+'-mobile.webp'}/>
    <img src={image+'-desktop.webp'} alt={t(option.name)} draggable={false}/>
   </picture>
   <span>{t(selected?'選択中':'このデザインにする')}</span>
  </button>
  {error&&<p role="status">{t(error)}</p>}
 </section>;
}
