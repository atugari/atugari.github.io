'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

type Preview={digit:string;left:number;top:number;width:number;stemLeft:number};

// This layer only shows the held digit. Input and number locking stay with Game.
export default function NumberPressPreview({enabled,tolerance,onCancel}:{enabled:boolean;tolerance:number;onCancel:()=>void}){
 const [preview,setPreview]=useState<Preview|null>(null);
 const cancel=useRef(onCancel);cancel.current=onCancel;
 useEffect(()=>{
  if(!enabled)return;
  let active:{id:number;button:HTMLButtonElement;x:number;y:number;rect:DOMRect}|null=null;
  const clear=(cancelInput=false)=>{
   if(!active)return;
   active.button.classList.remove('native-number-held');active=null;setPreview(null);
   if(cancelInput)cancel.current();
  };
  const down=(event:PointerEvent)=>{
   clear(true);
   if(event.isPrimary===false||event.button!==0)return;
   const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('.mode-daily .keypad button[data-native-number]'):null;
   if(!button||button.disabled)return;
   const rect=button.getBoundingClientRect(),width=Math.max(64,Math.min(80,rect.width+16));
   const center=rect.left+rect.width/2,left=Math.max(6,Math.min(center-width/2,window.innerWidth-width-6));
   active={id:event.pointerId,button,x:event.clientX,y:event.clientY,rect};
   button.classList.add('native-number-held');
   setPreview({digit:button.dataset.nativeNumber||'',left,top:Math.max(6,rect.top-60),width,stemLeft:center-left});
  };
  const move=(event:PointerEvent)=>{
   if(!active||event.pointerId!==active.id)return;
   const {x,y,rect}=active;
   if(Math.hypot(event.clientX-x,event.clientY-y)>tolerance||event.clientX<rect.left-4||event.clientX>rect.right+4||event.clientY<rect.top-4||event.clientY>rect.bottom+4)clear(true);
  };
  const end=(event:PointerEvent)=>{if(event.pointerId===active?.id)clear(event.type==='pointercancel')};
  const interrupt=()=>clear(true);
  const visibility=()=>{if(document.hidden)interrupt()};
  // Capture on window also observes presses handled by the optional tap aid.
  window.addEventListener('pointerdown',down,true);
  window.addEventListener('pointermove',move,true);
  window.addEventListener('pointerup',end,true);
  window.addEventListener('pointercancel',end,true);
  window.addEventListener('scroll',interrupt,true);
  window.addEventListener('resize',interrupt);
  window.addEventListener('blur',interrupt);
  window.addEventListener('pagehide',interrupt);
  document.addEventListener('visibilitychange',visibility);
  return()=>{
   window.removeEventListener('pointerdown',down,true);
   window.removeEventListener('pointermove',move,true);
   window.removeEventListener('pointerup',end,true);
   window.removeEventListener('pointercancel',end,true);
   window.removeEventListener('scroll',interrupt,true);
   window.removeEventListener('resize',interrupt);
   window.removeEventListener('blur',interrupt);
   window.removeEventListener('pagehide',interrupt);
   document.removeEventListener('visibilitychange',visibility);
   interrupt();
  };
 },[enabled,tolerance]);
 if(!enabled||!preview)return null;
 return createPortal(<div className="native-number-preview" aria-hidden="true" translate="no" data-i18n-skip="true" style={{left:preview.left,top:preview.top,width:preview.width,'--stem-left':preview.stemLeft+'px'} as React.CSSProperties}>{preview.digit}</div>,document.body);
}
