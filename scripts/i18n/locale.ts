import type {DailyKind,DailySummary} from './daily-types';
import languageNamesData from './language-names.json';
export const languageNames=languageNamesData;
export const isRTL=(locale:string)=>locale==='ar';
export type Locale=keyof typeof languageNames;
export const languageKey='nanpure-language-v1';
export const languageCookie='np-language';
export function isLocale(value:unknown):value is Locale{return typeof value==='string'&&Object.hasOwn(languageNames,value)}
export function matchLocale(value:string):Locale|null{
 const code=value.trim().replaceAll('_','-').toLowerCase();
 if(/^zh-(hant|tw|hk|mo)(-|$)/.test(code))return'zh-Hant';
 if(code==='zh'||/^zh-(hans|cn|sg)(-|$)/.test(code))return'zh-Hans';
 const base=code.split('-')[0];return isLocale(base)?base:null;
}
export function detectLocale(header:string):Locale{
 const choices=header.split(',').map((item,i)=>{const [name,...options]=item.trim().split(';');const q=options.find(o=>o.trim().startsWith('q='));return{name,q:q?Number(q.trim().slice(2)):1,i}}).filter(c=>Number.isFinite(c.q)&&c.q>0).sort((a,b)=>b.q-a.q||a.i-b.i);
 for(const c of choices){const locale=matchLocale(c.name);if(locale)return locale}return'en';
}
export function translate(locale:Locale,source:string,params:Record<string,string|number>={}){
 const runtime=typeof window!=='undefined'?(window as any).NPI18n:null;
 if(runtime)return (runtime.react||runtime.t)(source,locale,params);
 // The static export waits for NPI18n.ready before rendering. Keeping the full
 // legacy catalog here would put every language back into the main bundle.
 return source.replace(/\{(\w+)\}/g,(all,key)=>Object.hasOwn(params,key)?String(params[key]):all);
}
export function levelLabel(locale:Locale,level:number){return translate(locale,['簡単','普通','難問'][level-1]||'普通')}
export function ruleLabel(locale:Locale,kind:DailyKind){return translate(locale,({normal:'通常ナンプレ',jigsaw:'ジグソー',killer:'キラー',neighbor:'おとなり'})[kind])}
export function dayLabel(locale:Locale,day:string){return new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',month:'short',day:'numeric'}).format(new Date(day+'T00:00:00+09:00'))}
export function dailyTitle(locale:Locale,p:DailySummary){return `${dayLabel(locale,p.day)}｜${ruleLabel(locale,p.kind)} ${p.n}×${p.n}｜${levelLabel(locale,p.level)}`}
export function dailyRules(locale:Locale,p:Pick<DailySummary,'kind'|'n'>){
 const t=(key:string)=>translate(locale,key,{n:p.n});const base=t('各行・各列に1〜{n}を1回ずつ入れます。');
 const suffix=p.kind==='neighbor'?t('線でつながる2マスの数字を1違いにします。太い枠の条件はありません。線のない隣同士が1違いでもかまいません。'):p.kind==='jigsaw'?t('でこぼこの太い枠にも1〜{n}を1回ずつ入れます。'):t('太い枠にも1〜{n}を1回ずつ入れます。')+(p.kind==='killer'?' '+t('点線のまとまりは同じ数字を使わず、左上の合計に合わせます。'):'');
 return base+(locale==='ja'?'':' ')+suffix;
}
export function htmlLanguage(locale:Locale){return locale==='zh-Hans'?'zh-CN':locale==='zh-Hant'?'zh-TW':locale}
