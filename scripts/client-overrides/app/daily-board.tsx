'use client';
import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {useLocale} from './locale-context';
import {ruleLabel} from '../lib/locale';
import {conflicts} from '../lib/daily-play';
import {defaultSettings,type PlayOptions} from './play-settings';
import {attachBoardGestures} from './board-gestures';
import type { DailyPuzzle } from '../lib/daily-types';

export default function DailyBoard({session,grid,notes,selected,onSelect,onFocusCell,zoom,fit=false,settings=defaultSettings,chosen=0,viewScale,onScaleChange,onMinimumScaleChange}:{
 session:DailyPuzzle;grid:number[];notes:Record<number,number[]>;
 selected:number;onSelect:(index:number)=>void;onFocusCell?:(index:number)=>void;zoom:boolean;fit?:boolean;settings?:PlayOptions;chosen?:number;
 viewScale?:number;onScaleChange?:(scale:number,fit:boolean)=>void;onMinimumScaleChange?:(minimum:number)=>void;
}) {
 const {locale,t}=useLocale();const n=session.n;const viewport=useRef<HTMLDivElement>(null),board=useRef<HTMLDivElement>(null);
 const [edge,setEdge]=useState(280),[availableWidth,setAvailableWidth]=useState(280),[availableHeight,setAvailableHeight]=useState(280);
 useLayoutEffect(()=>{const element=viewport.current,workspace=element?.parentElement;if(!element||!workspace)return;
  const controls=workspace.querySelector('.daily-controls') as HTMLElement|null;
  const card=workspace.closest('.play-card') as HTMLElement|null,layout=workspace.closest('.game-layout') as HTMLElement|null;
  const px=(value:string)=>parseFloat(value)||0;
  const measure=()=>{
   const flow=getComputedStyle(workspace),sideBySide=['row','row-reverse'].includes(flow.flexDirection),gap=px(flow.gap)||8;
   const box=workspace.getBoundingClientRect(),controlBox=controls?.getBoundingClientRect();
   const width=Math.max(80,Math.min(700,box.width-(sideBySide?(controlBox?.width||240)+gap:0)));
   setAvailableWidth(Math.floor(width));
   const pad=controls?.querySelector('.keypad') as HTMLElement|null;
   if(pad&&controls){
    const padStyle=getComputedStyle(pad),keyGap=px(padStyle.columnGap)||5;
    const available=pad.clientWidth||controls.clientWidth;
    const maximum=Math.max(1,Math.min(sideBySide?(n>9?4:3):9,Math.floor((available+keyGap)/(44*settings.keypadSize/100+keyGap))));
    const columns=Math.ceil(n/Math.ceil(n/maximum));
    if(workspace.style.getPropertyValue('--native-pad-columns')!==String(columns))workspace.style.setProperty('--native-pad-columns',String(columns));
   }
   // Derive the budget from the scroll container, never from the board's own
   // growing content. When it is too short, the page scrolls instead of shrinking
   // every cell to fit the remaining few pixels.
   let height=box.height;
   if(layout&&card){
    const layoutStyle=getComputedStyle(layout),before=box.top-card.getBoundingClientRect().top;
    let after=0;
    for(let sibling=workspace.nextElementSibling;sibling;sibling=sibling.nextElementSibling){const style=getComputedStyle(sibling);if(style.display!=='none')after+=sibling.getBoundingClientRect().height+px(style.marginTop)+px(style.marginBottom);}
    height=layout.clientHeight-px(layoutStyle.paddingTop)-px(layoutStyle.paddingBottom)-before-after;
   }
   const boardHeight=Math.max(Math.min(width,280),height-(sideBySide?0:(controls?.getBoundingClientRect().height||100)+gap));
   setAvailableHeight(Math.floor(Math.min(boardHeight,Math.max(width,n*40))));
   setEdge(Math.floor(Math.min(width,boardHeight)));
  };
  const observer=new ResizeObserver(measure);observer.observe(workspace);if(controls)observer.observe(controls);if(layout)observer.observe(layout);if(card)observer.observe(card);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);measure();return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure)};
 },[n,locale,settings.keypadLayout,settings.keypadSize,settings.hand]);
 const standardEdge=n>9?Math.max(edge,n*40):edge;
 const magnification=Math.max(edge/standardEdge,Math.min(3,(viewScale??Math.max(settings.cellSize,zoom?140:100))/100));
 const renderEdge=fit?edge:standardEdge*magnification;
 const viewportWidth=n>9?Math.max(edge,availableWidth):edge,viewportHeight=n>9?Math.max(edge,availableHeight):edge;
 const scrollable=renderEdge>Math.min(viewportWidth,viewportHeight)+1;
 const renderedEdge=useRef(renderEdge),gestures=useRef<ReturnType<typeof attachBoardGestures>|null>(null);
 const current=useRef({standardEdge,edge,viewportWidth,viewportHeight,n,settings,onScaleChange});
 current.current={standardEdge,edge,viewportWidth,viewportHeight,n,settings,onScaleChange};
 const digitFontFor=(size:number)=>{
  const view=current.current,scale=size/view.standardEdge;
  return Math.min(view.n<=9?26:22,view.standardEdge/view.n*.57)*scale*view.settings.digitSize/100;
 };
 const paint=(size:number)=>{
  const root=viewport.current,element=board.current;if(!root||!element)return;
  const view=current.current;renderedEdge.current=size;
  element.style.setProperty('--minimum-board',size+'px');element.style.setProperty('--render-edge',size+'px');
  element.style.setProperty('--cell-font',digitFontFor(size)+'px');
  root.dataset.boardScale=String(Math.round(size/view.standardEdge*10000)/100);
  root.dataset.boardFit=size<=view.edge+1?'true':'false';
  root.dataset.scrollable=size>Math.min(view.viewportWidth,view.viewportHeight)+1?'true':'false';
 };
 useLayoutEffect(()=>{
  const root=viewport.current;if(!root)return;
  gestures.current=attachBoardGestures(root,{
   read:()=>({edge:renderedEdge.current,minimum:current.current.edge,maximum:current.current.standardEdge*3}),
   paint,
   commit:()=>{const view=current.current;view.onScaleChange?.(renderedEdge.current/view.standardEdge*100,renderedEdge.current<=view.edge+1)},
  });
  return()=>{gestures.current?.dispose();gestures.current=null};
 },[]);
 useLayoutEffect(()=>{
  paint(renderEdge);
  if(fit&&viewport.current){viewport.current.scrollLeft=0;viewport.current.scrollTop=0;}
 },[renderEdge,fit,settings.digitSize,standardEdge,edge,viewportWidth,viewportHeight]);
 useLayoutEffect(()=>{onMinimumScaleChange?.(edge/standardEdge*100)},[edge,standardEdge,onMinimumScaleChange]);
 useLayoutEffect(()=>{
  const root=viewport.current;if(!root)return;
  const cell=selected>=0?root.querySelector<HTMLButtonElement>(`[data-cell='${selected}']`):null;if(!cell)return;
  if(root.contains(document.activeElement))cell.focus({preventScroll:true});
  const box=root.getBoundingClientRect(),rect=cell.getBoundingClientRect(),left=box.left+root.clientLeft,top=box.top+root.clientTop;
  if(rect.left<left)root.scrollLeft-=left-rect.left;else if(rect.right>left+root.clientWidth)root.scrollLeft+=rect.right-left-root.clientWidth;
  if(rect.top<top)root.scrollTop-=top-rect.top;else if(rect.bottom>top+root.clientHeight)root.scrollTop+=rect.bottom-top-root.clientHeight;
  // Zooming must preserve the fingers' anchor, not snap back to an old selection.
 },[selected]);
 const region=(i:number)=>session.kind==='neighbor'?-1:session.regions[i];
 const cages=new Map<number,{cells:number[];sum:number}>();
 session.cages?.forEach(cage=>cage.cells.forEach(i=>cages.set(i,cage)));
 const digitFont=digitFontFor(renderEdge);
 const style={ '--board-size':n,'--board-edge':edge+'px','--note-cols':Math.ceil(Math.sqrt(n)),
  '--cell-font':`${digitFont}px`,'--digit-scale':settings.digitSize/100,'--note-scale':settings.noteSize/100,
  '--minimum-board':`${renderEdge}px`,'--render-edge':`${renderEdge}px`,
 } as CSSProperties;
 return <div ref={viewport} style={{width:viewportWidth,height:viewportHeight,flex:'0 0 auto'}} className="board-viewport" data-board-fit={fit?'true':'false'} data-board-scale={renderEdge/standardEdge*100} data-scrollable={scrollable?'true':'false'} aria-label={scrollable?t('拡大盤面。スクロールして移動できます'):undefined}>
  <div ref={board} role="grid" aria-rowcount={n} aria-colcount={n} aria-label={t('{rule} {n}×{n} 盤面',{rule:ruleLabel(locale,session.kind),n})} className={`board variable-board size-${n} kind-${session.kind}`} data-selection-design={settings.selectionDesign} style={style}>
   {grid.map((v,i)=>{
    const r=Math.floor(i/n),c=i%n,cage=cages.get(i),sameCage=(j:number)=>cage?.cells.includes(j);
    const related=settings.area&&selected>=0&&(r===Math.floor(selected/n)||c===selected%n||settings.selectionDesign!=='guide'&&region(selected)>=0&&region(selected)===region(i));
    const edgeStyle:CSSProperties={borderRightWidth:c<n-1&&region(i)!==region(i+1)?'2px':undefined,
     borderBottomWidth:r<n-1&&region(i)!==region(i+n)?'2px':undefined};
    return <button role="gridcell" key={i} data-cell={i} tabIndex={i===(selected<0?0:selected)?0:-1} aria-rowindex={r+1} aria-colindex={c+1}
     aria-label={t('{r}行{c}列 {value}{fixed}{sum}',{r:r+1,c:c+1,value:v||((notes[i]?.length?t('メモ')+' '+notes[i].join('・'):t('空白'))),fixed:session.puzzle[i]?t(' 固定'):'',sum:cage&&i===cage.cells[0]?t(' 合計{sum}',{sum:cage.sum}):''})}
     aria-selected={i===selected} style={edgeStyle}
     className={`cell ${session.puzzle[i]?'given':''} ${related?'related':''} ${settings.same&&(chosen||grid[selected])===v&&v?'same':''} ${i===selected?'selected':''} ${v&&conflicts(session,grid,i,v)?'conflict':''} ${c===n-1?'last-column':''} ${r===n-1?'last-row':''}`}
     onFocus={()=>onFocusCell?.(i)} onClick={()=>onSelect(i)}>
     {cage&&<><span aria-hidden="true" className="cage-outline" style={{borderTopWidth:r===0||!sameCage(i-n)?'1px':'0',borderBottomWidth:r===n-1||!sameCage(i+n)?'1px':'0',borderLeftWidth:c===0||!sameCage(i-1)?'1px':'0',borderRightWidth:c===n-1||!sameCage(i+1)?'1px':'0'}}/>{i===cage.cells[0]&&<span className="cage-sum" aria-hidden="true">{cage.sum}</span>}</>}
     {v?<span className="cell-value">{v}{conflicts(session,grid,i,v)&&<span className="conflict-mark" aria-label={t('重複またはルールの矛盾')}>!</span>}</span>:<span className="notes">{Array.from({length:n},(_,j)=><span key={j} className={`${settings.noteFocus&&(chosen||grid[selected])===j+1?'note-focus':''} ${settings.noteWarning&&notes[i]?.includes(j+1)&&conflicts(session,grid,i,j+1)?'note-conflict':''}`}>{notes[i]?.includes(j+1)?j+1:''}</span>)}</span>}
    </button>;
   })}
   {session.links&&<svg className="neighbor-lines" viewBox={`0 0 ${n*100} ${n*100}`} aria-hidden="true">{session.links.map(([a,b],i)=>{
    const ax=(a%n+.5)*100,ay=(Math.floor(a/n)+.5)*100,bx=(b%n+.5)*100,by=(Math.floor(b/n)+.5)*100;
    return <line key={i} x1={ax+(bx-ax)*.34} y1={ay+(by-ay)*.34} x2={ax+(bx-ax)*.66} y2={ay+(by-ay)*.66}/>;
   })}</svg>}
  </div>
 </div>;
}
