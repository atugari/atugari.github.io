export const appearanceKey='np-board-appearance-v1';
export const appearanceChoices={regionWidth:[2,3,4,5,6],cellWidth:[1,2,3],digitWeight:[0,400,600,750,900],areaStrength:[1,2,3],sameStrength:[1,2,3]} as const;
export const defaultAppearance={regionWidth:2,cellWidth:1,digitWeight:0,areaStrength:2,sameStrength:2};
export type BoardAppearance=typeof defaultAppearance;
export function normalizeAppearance(input:unknown):BoardAppearance{
 const v=input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
 const out={...defaultAppearance};
 for(const key of Object.keys(out) as (keyof BoardAppearance)[])if((appearanceChoices[key] as readonly unknown[]).includes(v[key]))out[key]=v[key] as number;
 return out;
}
export function readAppearance():BoardAppearance{try{return normalizeAppearance(JSON.parse(localStorage.getItem(appearanceKey)||'null'))}catch{return {...defaultAppearance}}}
export function applyAppearance(value=readAppearance()){
 if(typeof document==='undefined')return;
 const root=document.documentElement;
 root.style.setProperty('--np-region-line',value.regionWidth+'px');root.style.setProperty('--np-cell-line',value.cellWidth+'px');
 if(value.digitWeight)root.style.setProperty('--np-digit-weight',String(value.digitWeight));else root.style.removeProperty('--np-digit-weight');
 root.dataset.npDigitWeight=String(value.digitWeight);
 root.dataset.npAreaStrength=String(value.areaStrength);root.dataset.npSameStrength=String(value.sameStrength);
}
export function saveAppearance(value:unknown){
 const next=normalizeAppearance(value);
 localStorage.setItem(appearanceKey,JSON.stringify(next));
 applyAppearance(next);window.dispatchEvent(new CustomEvent('np-board-appearance-change',{detail:next}));return next;
}
export function watchAppearance(listener:(value:BoardAppearance)=>void){
 const refresh=()=>listener(readAppearance());
 const storage=(event:StorageEvent)=>{if(event.key===appearanceKey||event.key===null)refresh()};
 window.addEventListener('storage',storage);window.addEventListener('np-board-appearance-change',refresh);
 return()=>{window.removeEventListener('storage',storage);window.removeEventListener('np-board-appearance-change',refresh)};
}
if(typeof window!=='undefined'){applyAppearance();watchAppearance(applyAppearance)}
