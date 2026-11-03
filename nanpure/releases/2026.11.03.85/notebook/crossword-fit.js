/* Keep the board and word editor in the visible viewport, including an embedded keyboard. */
(function(w){'use strict';let queued=false,observed=null,baseline=0,keyboard=false,closeTimer=0;const root=document.documentElement;
function viewport(){let height=w.visualViewport?.height||w.innerHeight;try{if(parent!==w&&w.frameElement){const v=parent.visualViewport,rect=w.frameElement.getBoundingClientRect();height=Math.min(height,(v?.height||parent.innerHeight)+(v?.offsetTop||0)-rect.top)}}catch{}return Math.max(100,Math.floor(height))}
function refresh(){if(!queued){queued=true;requestAnimationFrame(measure)}}
function measure(){queued=false;const play=document.getElementById('cw-play');if(!play)return;const height=viewport(),input=document.getElementById('answer'),focused=document.activeElement===input;baseline=Math.max(baseline,height);const smaller=baseline-height>110;
 if(focused&&smaller)keyboard=true;else if(!smaller)keyboard=false;
 document.body.classList.toggle('cw-keyboard',keyboard);root.style.setProperty('--cw-viewport',height+'px');
 const area=play.querySelector('.cw-board-area'),board=area?.querySelector('.board');if(!area||!board)return;if(observed!==area){observer?.disconnect();observed=area;observer?.observe(area)}const edge=Math.max(40,Math.floor(Math.min(area.clientWidth,area.clientHeight,484)));if(board.style.width!==edge+'px'){board.style.width=edge+'px';board.style.height=edge+'px';board.style.setProperty('--cw-letter',Math.max(10,Math.min(27,(edge/window.NPCrossword.getCurrent().n)*.55))+'px')}
}
const observer=typeof ResizeObserver==='function'?new ResizeObserver(refresh):null;
w.NPCrosswordFit={refresh};w.addEventListener('resize',refresh);w.visualViewport?.addEventListener('resize',refresh);w.visualViewport?.addEventListener('scroll',refresh);try{if(parent!==w){parent.visualViewport?.addEventListener('resize',refresh);parent.visualViewport?.addEventListener('scroll',refresh)}}catch{}
document.addEventListener('focusin',refresh);document.addEventListener('focusout',()=>{clearTimeout(closeTimer);closeTimer=setTimeout(refresh,180)});w.addEventListener('orientationchange',()=>{baseline=0;refresh()});
})(window);
