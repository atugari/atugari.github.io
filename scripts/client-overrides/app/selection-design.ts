export const selectionDesignKey='np-selection-design-v1';
export type SelectionDesign='guide'|'outline'|'solid';
export function normalizeSelectionDesign(value:unknown):SelectionDesign{return value==='outline'||value==='solid'?value:'guide'}
export function readSelectionDesign():SelectionDesign{try{return normalizeSelectionDesign(localStorage.getItem(selectionDesignKey))}catch{return 'guide'}}
export function saveSelectionDesign(value:unknown){const design=normalizeSelectionDesign(value);try{localStorage.setItem(selectionDesignKey,design)}catch{}window.dispatchEvent(new CustomEvent('np-selection-design-change',{detail:design}))}
export function watchSelectionDesign(onChange:(value:SelectionDesign)=>void){
 const storage=(event:StorageEvent)=>{if(event.key===selectionDesignKey||event.key===null)onChange(readSelectionDesign())};
 const changed=(event:Event)=>onChange(normalizeSelectionDesign((event as CustomEvent).detail));
 window.addEventListener('storage',storage);window.addEventListener('np-selection-design-change',changed);
 return()=>{window.removeEventListener('storage',storage);window.removeEventListener('np-selection-design-change',changed)};
}
