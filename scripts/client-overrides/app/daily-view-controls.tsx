'use client';
import {useLocale} from './locale-context';
import type {PlayOptions} from './play-settings';

export function KeypadPosition({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const {t}=useLocale();
 return <label className="keypad-position"><span>{t('数字ボタンの位置')}</span><select value={value} onChange={event=>onChange(event.target.value)}>
  <option value="auto">{t('画面に合わせる')}</option>
  <option value="side">{t('盤面の横')}</option>
  <option value="bottom">{t('盤面の下')}</option>
 </select></label>;
}

export function BoardScaleControls({value,onChange,fit=false,onFit,minimum=100,maximum=180}:{value:number;onChange:(value:number)=>void;fit?:boolean;onFit?:()=>void;minimum?:number;maximum?:number}){
 const {t}=useLocale();
 const displayed=fit?minimum:value;
 return <div className="board-scale-controls" role="group" aria-label={t('盤面の倍率')}>
  <span className="scale-caption">{t('盤面')}</span>
  <button type="button" disabled={fit||value<=minimum+.01} onClick={()=>onChange(Math.max(minimum,value-20))} aria-label={t('盤面を縮小する')} title={t('盤面を縮小する')}>−</button>
  {onFit?<button type="button" className="reset-board" onClick={()=>onChange(100)} aria-label={t('倍率を100%に戻す')} title={t('倍率を100%に戻す')}><output aria-live="polite">{fit?t('全体表示'):Math.round(value)+'%'}</output></button>:<output aria-live="polite">{Math.round(value)}%</output>}
  <button type="button" disabled={displayed>=maximum} onClick={()=>onChange(Math.min(maximum,displayed+20))} aria-label={t('盤面を拡大する')} title={t('盤面を拡大する')}>＋</button>
  <button type="button" className="fit-board" disabled={onFit?fit:value===100} onClick={()=>onFit?onFit():onChange(100)}>{t('全体表示')}</button>
 </div>;
}

export function KeypadSettings({value,onChange}:{value:PlayOptions;onChange:(value:PlayOptions)=>void}){
 const {t}=useLocale();
 return <fieldset className="keypad-settings"><legend>{t('数字ボタン')}</legend>
  <KeypadPosition value={value.keypadLayout} onChange={keypadLayout=>onChange({...value,keypadLayout})}/>
  <small>{t('狭い画面では、押しやすさを保つため下に表示します。')}</small>
  <label>{t('数字ボタンの大きさ')}<select value={value.keypadSize} onChange={event=>onChange({...value,keypadSize:Number(event.target.value)})}>
   {[100,125,150].map((size,index)=><option key={size} value={size}>{t(['標準','大きめ','特大'][index])} · {size}%</option>)}
  </select></label>
 </fieldset>;
}
