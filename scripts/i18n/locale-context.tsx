'use client';
import {createContext,useContext,useEffect,useState,useCallback,type ReactNode} from 'react';
import {isLocale,languageNames,languageKey,languageCookie,translate,htmlLanguage,type Locale} from '../lib/locale';
const Context=createContext({locale:'ja' as Locale,setLocale:(_locale:Locale)=>{},t:(source:string,params?:Record<string,string|number>)=>translate('ja',source,params)});
export function LocaleProvider({initialLocale,children}:{initialLocale:Locale;children:ReactNode}){
 const [locale,updateLocale]=useState<Locale>(()=>typeof window!=='undefined'&&isLocale((window as any).NPI18n?.get())?(window as any).NPI18n.get():initialLocale);const setLocale=(value:Locale)=>{(window as any).NPFurigana?.beforeLanguageChange();updateLocale(value)};
 useEffect(()=>{const hint=new URLSearchParams(window.location.search).get('lang');let saved;try{saved=localStorage.getItem(languageKey)}catch{}if(isLocale(hint))setLocale(hint);else if(isLocale(saved))setLocale(saved)},[]);
 useEffect(()=>{
  (window as any).NPFurigana?.beforeLanguageChange();document.documentElement.lang=htmlLanguage(locale);document.documentElement.dataset.locale=locale;
  if((window as any).NPI18n?.get()!==locale)(window as any).NPI18n?.set(locale);
  document.title=translate(locale,'ナンプレ帳')+' | '+translate(locale,window.location.pathname==='/privacy'||new URLSearchParams(window.location.search).get('view')==='privacy'?'利用案内・プライバシー':'日替わり問題帳');
  try{localStorage.setItem(languageKey,locale)}catch{}
  document.cookie=`${languageCookie}=${locale};Path=/;Max-Age=31536000;SameSite=Lax`;
 },[locale]);
 useEffect(()=>{const changed=(event:StorageEvent)=>{if(event.key===languageKey&&isLocale(event.newValue))setLocale(event.newValue)};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)},[]);
 useEffect(()=>{const changed=(event:Event)=>{const next=(event as CustomEvent).detail?.locale;if(isLocale(next))updateLocale(next)};window.addEventListener('np-language-change',changed);return()=>window.removeEventListener('np-language-change',changed)},[]);
 const t=useCallback((source:string,params?:Record<string,string|number>)=>translate(locale,source,params),[locale]);
 return <Context.Provider value={{locale,setLocale,t}}>{children}</Context.Provider>;
}
export function useLocale(){return useContext(Context)}
export function LanguagePicker(){const{locale,setLocale,t}=useLocale();const codes={ja:'JA',en:'EN','zh-Hans':'简','zh-Hant':'繁',ko:'KO',es:'ES',fr:'FR',de:'DE',pt:'PT'};
 return <label className="language-picker" title={t('言語')}><span aria-hidden="true" translate="no">🌐 {codes[locale]}</span><select translate="no" aria-label={t('言語')} value={locale} onChange={event=>{if(isLocale(event.target.value))setLocale(event.target.value)}}>{Object.entries(languageNames).map(([code,name])=><option key={code} value={code} lang={htmlLanguage(code as Locale)}>{name}</option>)}</select></label>;
}
