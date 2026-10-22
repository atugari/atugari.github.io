// Board-only pointer gestures. Rendering stays outside React while fingers move.
export type BoardGestureView={edge:number;minimum:number;maximum:number};
type Point={x:number;y:number;startX:number;startY:number};
type Center={x:number;y:number;distance:number};

export function attachBoardGestures(viewport:HTMLElement,options:{
 read:()=>BoardGestureView;
 paint:(edge:number)=>void;
 commit:()=>void;
}){
 const pointers=new Map<number,Point>();
 let previous:Center|null=null,dragged=false,zoomed=false,ignoreUntil=0;
 const center=():Center|null=>{
  const points=[...pointers.values()];if(!points.length)return null;
  if(points.length===1)return{x:points[0].x,y:points[0].y,distance:0};
  const [a,b]=points;return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};
 };
 const capture=()=>{for(const id of pointers.keys())try{viewport.setPointerCapture(id)}catch{}};
 const release=(id:number)=>{try{if(viewport.hasPointerCapture(id))viewport.releasePointerCapture(id)}catch{}};
 const markDrag=()=>{dragged=true;ignoreUntil=Date.now()+700;viewport.dataset.gesturing='true';capture()};
 const scrollParent=(delta:number)=>{
  let remaining=delta;
  for(let parent=viewport.parentElement;parent&&Math.abs(remaining)>.5;parent=parent.parentElement){
   const style=getComputedStyle(parent);if(!/(auto|scroll)/.test(style.overflowY)||parent.scrollHeight<=parent.clientHeight)continue;
   const before=parent.scrollTop;parent.scrollTop+=remaining;remaining-=parent.scrollTop-before;
  }
  if(Math.abs(remaining)>.5)window.scrollBy(0,remaining);
 };
 const zoomAt=(edge:number,before:Center,after:Center)=>{
  const view=options.read(),next=Math.max(view.minimum,Math.min(view.maximum,edge));
  const rect=viewport.getBoundingClientRect(),left=rect.left+viewport.clientLeft,top=rect.top+viewport.clientTop;
  const x=(viewport.scrollLeft+before.x-left)/view.edge,y=(viewport.scrollTop+before.y-top)/view.edge;
  options.paint(next);
  viewport.scrollLeft=x*next-(after.x-left);viewport.scrollTop=y*next-(after.y-top);
 };
 const down=(event:PointerEvent)=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  if(!pointers.size){dragged=false;zoomed=false;ignoreUntil=0;}
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});
  previous=center();
  if(pointers.size>1){markDrag();if(event.cancelable)event.preventDefault();}
 };
 const move=(event:PointerEvent)=>{
  const point=pointers.get(event.pointerId);if(!point)return;
  point.x=event.clientX;point.y=event.clientY;const current=center();if(!current)return;
  if(pointers.size>1){
   markDrag();
   if(previous&&previous.distance>0&&current.distance>0){zoomed=true;zoomAt(options.read().edge*current.distance/previous.distance,previous,current);}
  }else{
   if(Math.hypot(point.x-point.startX,point.y-point.startY)>7)markDrag();
   if(dragged&&previous){
    const delta=previous.y-current.y,before=viewport.scrollTop;
    viewport.scrollLeft+=previous.x-current.x;viewport.scrollTop+=delta;
    if(event.pointerType!=='mouse')scrollParent(delta-(viewport.scrollTop-before));
   }
  }
  if(dragged){if(event.cancelable)event.preventDefault();ignoreUntil=Date.now()+700;}
  previous=current;
 };
 const finish=(event:PointerEvent)=>{
  // Moving implicit capture from a cell to the viewport also sends this event.
  // Only losing the viewport's own capture cancels an active gesture.
  if(event.type==='lostpointercapture'&&event.target!==viewport)return;
  if(!pointers.has(event.pointerId))return;
  if(event.type!=='pointerup'){cancel();return;}
  pointers.delete(event.pointerId);release(event.pointerId);previous=center();
  if(dragged)ignoreUntil=Date.now()+700;
  if(!pointers.size){delete viewport.dataset.gesturing;if(zoomed)options.commit();zoomed=false;}
 };
 const cancel=()=>{
  if(!pointers.size)return;
  const ids=[...pointers.keys()];pointers.clear();previous=null;dragged=true;ignoreUntil=Date.now()+700;
  ids.forEach(release);delete viewport.dataset.gesturing;if(zoomed)options.commit();zoomed=false;
 };
 const click=(event:MouseEvent)=>{if(event.detail!==0&&(pointers.size>1||dragged||Date.now()<ignoreUntil)){event.preventDefault();event.stopImmediatePropagation();}};
 const wheel=(event:WheelEvent)=>{
  if(!event.deltaY||!(event.ctrlKey||event.metaKey))return;
  event.preventDefault();const rect=viewport.getBoundingClientRect();
  const point={x:Math.max(rect.left,Math.min(rect.right,event.clientX)),y:Math.max(rect.top,Math.min(rect.bottom,event.clientY)),distance:0};
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
  zoomAt(options.read().edge*Math.exp(-Math.max(-240,Math.min(240,delta))*.0025),point,point);options.commit();
 };
 const hidden=()=>{if(document.hidden)cancel()};
 viewport.addEventListener('pointerdown',down,{capture:true});
 viewport.addEventListener('pointermove',move,{passive:false});
 viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);viewport.addEventListener('lostpointercapture',finish);
 viewport.addEventListener('click',click,{capture:true});viewport.addEventListener('wheel',wheel,{passive:false});
 window.addEventListener('blur',cancel);window.addEventListener('pagehide',cancel);document.addEventListener('visibilitychange',hidden);
 return{active:()=>pointers.size>0,cancel,dispose(){
  const ids=[...pointers.keys()];pointers.clear();ids.forEach(release);delete viewport.dataset.gesturing;
  viewport.removeEventListener('pointerdown',down,true);viewport.removeEventListener('pointermove',move);
  viewport.removeEventListener('pointerup',finish);viewport.removeEventListener('pointercancel',finish);viewport.removeEventListener('lostpointercapture',finish);
  viewport.removeEventListener('click',click,true);viewport.removeEventListener('wheel',wheel);
  window.removeEventListener('blur',cancel);window.removeEventListener('pagehide',cancel);document.removeEventListener('visibilitychange',hidden);
 }};
}
