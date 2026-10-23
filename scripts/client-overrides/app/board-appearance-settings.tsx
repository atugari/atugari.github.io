'use client';
import {useEffect,useState} from 'react';
import {appearanceChoices,defaultAppearance,readAppearance,saveAppearance,watchAppearance,type BoardAppearance} from '../lib/board-appearance';
import {useLocale} from './locale-context';
export function useBoardAppearance(){
 const[value,setValue]=useState(readAppearance),[error,setError]=useState('');
 useEffect(()=>watchAppearance(setValue),[]);
 const change=(key:keyof BoardAppearance,n:number)=>{try{saveAppearance({...readAppearance(),[key]:n});setError('');return true}catch{setError('設定を保存できませんでした。');return false}};
 const reset=()=>{try{saveAppearance(defaultAppearance);setError('');return true}catch{setError('設定を保存できませんでした。');return false}};
 return {value,change,error,reset};
}
export function AppearanceChoices({value,onChange}:{value:BoardAppearance;onChange:(key:keyof BoardAppearance,n:number)=>boolean}){
 const{t}=useLocale();
 const rows=[['regionWidth','枠線の太さ',['標準','太め','とても太い','極太','最大']],['cellWidth','マス線の太さ',['標準','太め','とても太い']],['digitWeight','数字の太さ',['標準','細め','中くらい','太め','極太']]] as const;
 return <fieldset className="ps-card np-appearance-options"><legend>{t('線と数字の見やすさ')}</legend>{rows.map(([key,label,labels])=><label key={key} className="ps-choice"><span>{t(label)}</span><select data-appearance={key} value={value[key]} onChange={e=>onChange(key,Number(e.target.value))}>{appearanceChoices[key].map((n,i)=><option key={n} value={n}>{t(labels[i])}</option>)}</select></label>)}<small>{t('枠線は、マスのまとまりやジグソーの領域を囲む線です。')}</small></fieldset>;
}
export function HighlightChoice({label,enabled,strength,onChange,kind}:{label:string;enabled:boolean;strength:number;onChange:(level:number)=>void;kind:string}){
 const{t}=useLocale();return <label className="ps-choice"><span>{t(label)}</span><select data-appearance={kind} value={enabled?strength:0} onChange={e=>onChange(Number(e.target.value))}>{['なし','弱め','標準','強め'].map((label,n)=><option key={n} value={n}>{t(label)}</option>)}</select></label>;
}
