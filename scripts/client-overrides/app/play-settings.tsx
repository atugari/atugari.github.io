'use client';
import {useRef,useState,type ReactNode} from 'react';
import {useBoardAppearance,AppearanceChoices,HighlightChoice} from './board-appearance-settings';
import {normalizeSelectionDesign,type SelectionDesign} from './selection-design';
import TextSizeSetting from './text-size-setting';
import {KeypadSettings} from './daily-view-controls';
import AwakeSetting from './awake-setting';import {useLocale} from './locale-context';
export const defaultSettings={selectionDesign:'guide' as SelectionDesign,palette:'cream',systemTheme:false,digitSize:100,cellSize:100,noteSize:100,area:true,same:true,noteFocus:true,noteWarning:true,prune:true,numberFirst:false,remaining:true,autoNext:false,timer:true,sound:false,vibration:false,mistakeLimit:0,animations:true,autoComplete:false,nonColor:true,keypadSize:100,keypadLayout:'auto',hand:'auto',holdMs:450,showRanking:true,tapAssist:false,dragTolerance:28,keepAwake:false};
export type PlayOptions=typeof defaultSettings;
export function readSettings(value:unknown):PlayOptions{const v=value&&typeof value==='object'?value as Record<string,unknown>:{};const out={...defaultSettings};for(const k of Object.keys(out) as (keyof PlayOptions)[]){if(typeof v[k]===typeof out[k])(out as any)[k]=v[k]}out.selectionDesign=normalizeSelectionDesign(out.selectionDesign);if(!['light','cream','mint','sky','rose','purple','dark'].includes(out.palette))out.palette='cream';for(const k of ['digitSize','noteSize','cellSize'] as const)out[k]=Math.min(180,Math.max(70,Number(out[k])||100));out.cellSize=Math.max(100,out.cellSize);if(!['auto','side','bottom'].includes(out.keypadLayout))out.keypadLayout='auto';if(![16,28,40].includes(out.dragTolerance))out.dragTolerance=28;if(![100,125,150].includes(out.keypadSize))out.keypadSize=100;if(![300,450,700,1000,0].includes(out.holdMs))out.holdMs=450;if(!['auto','left','right'].includes(out.hand))out.hand='auto';if(![0,3,5,10].includes(out.mistakeLimit))out.mistakeLimit=0;return out}
const settingsPages=[
 ['view','盤面の見え方','色・選択マス・数字の大きさ'],
 ['input','入力・候補メモ','入力の順番・メモ・ミス上限'],
 ['sound','音・表示','タイマー・音・演出'],
 ['help','ルール・保存','ルール・記録・問題の操作'],
] as const;
type SettingsPage=typeof settingsPages[number][0];
export default function PlaySettings({value,onChange,ranked,onPractice,onStats,boardControls,gameInfo,onReset,onGuide,onAudio,onClose}:{value:PlayOptions;onChange:(v:PlayOptions)=>void;ranked:boolean;onPractice:()=>void;onStats:()=>void;boardControls?:ReactNode;gameInfo?:ReactNode;onReset?:()=>void;onGuide?:()=>void;onAudio?:()=>void;onClose?:()=>void}){
 const{t}=useLocale();
 const appearance=useBoardAppearance();
 const highlight=(key:'area'|'same',label:string)=><HighlightChoice label={label} kind={key==='area'?'areaStrength':'sameStrength'} enabled={value[key]} strength={appearance.value[key==='area'?'areaStrength':'sameStrength']} onChange={n=>{if(!n||appearance.change(key==='area'?'areaStrength':'sameStrength',n))set(key,!!n)}}/>;
 const[page,setPage]=useState<SettingsPage|null>(null);
 const root=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null);
 const set=(key:keyof PlayOptions,v:any)=>onChange({...value,[key]:v});
 const open=(next:SettingsPage|null)=>{setPage(next);requestAnimationFrame(()=>{const dialog=root.current?.closest('dialog');if(dialog)dialog.scrollTop=0;heading.current?.focus({preventScroll:true})})};
 const check=(key:keyof PlayOptions,label:string,help?:string)=><label className="setting-check ps-switch-row" key={key}><span><span className="ps-row-title">{t(label)}</span>{help&&<small>{t(help)}</small>}</span><input type="checkbox" role="switch" checked={!!value[key]} onChange={e=>set(key,e.target.checked)}/></label>;
 const range=(key:'digitSize'|'noteSize'|'cellSize',label:string,min:number,max:number)=><label className="setting-range ps-range"><span>{t(label)}</span><output>{value[key]}%</output><input type="range" min={min} max={max} step="10" value={value[key]} onChange={e=>set(key,Number(e.target.value))}/></label>;
 return <section className="play-settings ps-organized" ref={root}>
  <header className="ps-header">{page&&<button className="ps-back" type="button" onClick={()=>open(null)} aria-label={t('設定一覧に戻る')}>‹</button>}<h2 tabIndex={-1} ref={heading}>{t(page?settingsPages.find(item=>item[0]===page)![1]:'プレイ中の設定')}</h2>{onClose&&<button className="dialog-close ps-close" type="button" onClick={onClose} aria-label={t('閉じる')}>{t('閉じる')} ×</button>}</header>
  <div className="ps-menu" hidden={page!==null}>
   <p className="ps-intro">{t('項目を選んで設定できます。変更はすぐに反映されます。')}</p>
   <nav className="ps-category-list" aria-label={t('プレイ中の設定')}>{settingsPages.map(([id,label,description])=><button type="button" key={id} className="ps-category" onClick={()=>open(id)} aria-controls={'daily-settings-'+id}><span className="ps-category-icon"><SettingsIcon name={id}/></span><span><strong>{t(label)}</strong><small>{t(description)}</small></span><span className="ps-chevron" aria-hidden="true">›</span></button>)}</nav>
  </div>
  <div id="daily-settings-view" className="ps-page" hidden={page!=='view'}>
   <div className={`settings-preview palette-${value.palette} ${value.nonColor?'noncolor':''}`} data-selection-design={value.selectionDesign} aria-label={t('見え方の見本')}><div className="preview-cells" style={{fontSize:22*value.digitSize/100}}>{[1,2,0,4,0,4,1,0,2,0,4,3,4,3,0,1].map((n,i)=><span key={i} className={i===5?'preview-selected':value.same&&n===4?'preview-same':value.area&&(Math.floor(i/4)===1||i%4===1||value.selectionDesign!=='guide'&&Math.floor(i/4)<2&&i%4<2)?'preview-related':''}>{n||<small style={{fontSize:10*value.noteSize/100}}>1 3</small>}</span>)}</div><small>{t('見え方の見本')}</small></div>
   <div className="ps-card"><label className="selection-design-setting ps-choice"><span>{t('選択マスのデザイン')}</span><select value={value.selectionDesign} onChange={e=>set('selectionDesign',normalizeSelectionDesign(e.target.value))}>{[['guide','行・列ガイド'],['outline','くっきり枠'],['solid','濃い色で選択']].map(([design,label])=><option key={design} value={design}>{t(label)}</option>)}</select></label>
    {highlight('area','行・列・枠を強調表示')}{highlight('same','同じ数字を強調表示')}{check('nonColor','色だけでなく枠・下線でも区別する')}
   </div>
   <AppearanceChoices value={appearance.value} onChange={appearance.change}/>{appearance.error&&<p role="status">{t(appearance.error)}</p>}
   <fieldset className="ps-card"><legend>{t('画面の配色')}</legend><div className="palette-options">{['light','cream','mint','sky','rose','purple','dark'].map((p,i)=><button type="button" key={p} className={'palette-'+p} aria-pressed={value.palette===p} onClick={()=>set('palette',p)}>{t(['白','クリーム','ミント','青','ピンク','紫','暗い表示'][i])}</button>)}</div>{check('systemTheme','端末のダークモードに合わせる')}</fieldset>
   <fieldset className="ps-card"><legend>{t('色と大きさ')}</legend>{boardControls||range('cellSize','盤面の倍率',100,180)}<small>{t('100%は標準の大きさです。盤面がはみ出すときは「全体を表示」で画面に合わせられます。')}</small>{range('digitSize','数字の大きさ',70,150)}{range('noteSize','メモの大きさ',80,160)}</fieldset>
   <TextSizeSetting/>
  </div>
  <div id="daily-settings-input" className="ps-page" hidden={page!=='input'}>
   <div className="ps-card">{check('numberFirst','数字を先に選んで入力','ONにすると長押しなしで数字を固定できます。同じ数字をもう一度押すと解除します。')}{check('autoNext','使い切ったら次の数字を自動選択')}{check('prune','入力した数字を関連するメモから消す')}{check('noteFocus','選んだ数字の候補メモを強調')}{check('noteWarning','矛盾する候補メモを知らせる')}</div>
   <KeypadSettings value={value} onChange={onChange}/>
   <details className="ps-card"><summary>{t('押しやすさ・読みやすさ')}</summary>{check('tapAssist','ゆっくりタップ補助','長く押しても1回だけ入力します。少し指が動いても最初のボタンを押せます。大きく動かすと取り消します。')}{value.tapAssist&&<label className="ps-choice"><span>{t('指のずれを許す範囲')}</span><select value={value.dragTolerance} onChange={e=>set('dragTolerance',Number(e.target.value))}>{[16,28,40].map((v,i)=><option key={v} value={v}>{t(['小さめ','標準','広め'][i])}</option>)}</select></label>}<label className="ps-choice"><span>{t('長押しの時間')}</span><select value={value.holdMs} onChange={e=>set('holdMs',Number(e.target.value))}>{[0,300,450,700,1000].map(v=><option key={v} value={v}>{v?`${v/1000}${t('秒')}`:t('使わない')}</option>)}</select></label><label className="ps-choice"><span>{t('ボタンの配置')}</span><select value={value.hand} onChange={e=>set('hand',e.target.value)}>{['auto','left','right'].map((v,i)=><option key={v} value={v}>{t(['中央','左手向け','右手向け'][i])}</option>)}</select></label></details>
   <fieldset className="ps-card"><legend>{t('練習の補助')}</legend>{ranked?<><p>{t('ランキング挑戦では答え・ヒント・自動完成を使いません。練習に切り替えると利用できます。')}</p><button className="secondary-action" type="button" onClick={onPractice}>{t('練習に切り替える')}</button></>:<><label className="ps-choice"><span>{t('ミス上限')}</span><select value={value.mistakeLimit} onChange={e=>set('mistakeLimit',Number(e.target.value))}>{[0,3,5,10].map(n=><option key={n} value={n}>{n?`${n}${t('回')}`:t('制限なし')}</option>)}</select></label>{check('autoComplete','残り1マスを自動完成')}</>}</fieldset>
  </div>
  <div id="daily-settings-sound" className="ps-page" hidden={page!=='sound'}>
   <div className="ps-card">{onAudio&&<button type="button" className="ps-link-row" onClick={onAudio}><span>{t('BGM・効果音')}</span><span aria-hidden="true">›</span></button>}{check('vibration','入力時の振動')}{check('animations','完成時の演出')}<button className="secondary-action" type="button" onClick={()=>onChange({...value,sound:false,vibration:false,animations:false})}>{t('静かに遊ぶ')}</button></div>
   <div className="ps-card">{check('timer','プレイ中のタイマーを表示')}{check('showRanking','ランキングを表示する')}<AwakeSetting value={value.keepAwake} onChange={v=>set('keepAwake',v)}/></div>
  </div>
  <div id="daily-settings-help" className="ps-page" hidden={page!=='help'}>
   {gameInfo&&<div className="ps-card">{gameInfo}</div>}
   <div className="ps-card">{onGuide&&<button className="ps-link-row" type="button" onClick={onGuide}><span>{t('解き方図鑑を開く')}</span><span aria-hidden="true">›</span></button>}<button className="ps-link-row" type="button" onClick={onStats}><span>{t('日替わりの記録')}</span><span aria-hidden="true">›</span></button></div>
   <p className="ps-note">{t('解き方図鑑・高度なヒント・統計の共有は「自由に遊ぶ」の設定から利用できます。')}</p>
   <button className="text-button ps-reset" type="button" onClick={()=>{if(appearance.reset()){onChange({...defaultSettings});onReset?.()}}}>{t('設定を初期値に戻す')}</button>
  </div>
 </section>
}

function SettingsIcon({name}:{name:SettingsPage}){
 const paths={view:'M3 3h18v18H3zM3 9h18M9 3v18M15 3v18M3 15h18',input:'m5 15-1 5 5-1L20 8l-4-4L5 15ZM13 7l4 4',sound:'M11 4 5 9H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',help:'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15'};
 return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
}
