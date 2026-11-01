/* Input assistance is opt-in and scoped to game controls. Never intercept text fields or page scrolling. */
(()=>{'use strict';if(window.NPTapAid)return;let active=null,synthetic=false,suppressUntil=0;
const selector='.keypad button,.tools button,#number-controls button,.tutorial-digits button,.tutorial-tools button';
function control(e){return e.target?.closest?.(selector)}
function options(el){const scope=el?.closest('[data-np-aid]')||document.documentElement;return{enabled:scope.dataset.npAid==='true',tolerance:Number(scope.dataset.npTolerance)||28}}
function clear(){if(active)active.el.classList.remove('np-touch-held');active=null}
document.addEventListener('contextmenu',e=>{if(control(e)||e.target?.closest?.('.cell'))e.preventDefault()},true);
document.addEventListener('selectstart',e=>{if(control(e)||e.target?.closest?.('.cell'))e.preventDefault()},true);
document.addEventListener('pointerdown',e=>{const el=control(e);if(!el||el.disabled||!options(el).enabled||e.pointerType==='mouse')return;if(active){active.cancelled=true;e.preventDefault();e.stopImmediatePropagation();return}if(e.isPrimary===false)return;const o=options(el);active={el,id:e.pointerId,x:e.clientX,y:e.clientY,tolerance:o.tolerance,cancelled:false};el.classList.add('np-touch-held');try{el.setPointerCapture(e.pointerId)}catch{}e.preventDefault();e.stopImmediatePropagation()},true);
document.addEventListener('pointermove',e=>{if(!active||active.id!==e.pointerId)return;if(Math.hypot(e.clientX-active.x,e.clientY-active.y)>active.tolerance){active.cancelled=true;active.el.classList.remove('np-touch-held')}e.preventDefault();e.stopImmediatePropagation()},true);
document.addEventListener('pointerup',e=>{if(!active||active.id!==e.pointerId)return;const a=active;clear();suppressUntil=Date.now()+700;e.preventDefault();e.stopImmediatePropagation();if(!a.cancelled&&a.el.isConnected&&!a.el.disabled){synthetic=true;a.el.click();synthetic=false}},true);
document.addEventListener('pointercancel',e=>{if(active?.id===e.pointerId){clear();suppressUntil=Date.now()+700}},true);
document.addEventListener('click',e=>{if(!synthetic&&e.detail!==0&&Date.now()<suppressUntil&&control(e)){e.preventDefault();e.stopImmediatePropagation()}},true);
window.addEventListener('blur',clear);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()});
const style=document.createElement('style');style.textContent=`.keypad button,.tools button,#number-controls button,.tutorial-tools button,.tutorial-digits button,.cell{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none}.keypad button *,.tools button *,#number-controls button *{-webkit-user-select:none!important;user-select:none!important}[data-np-aid=true] .keypad button,[data-np-aid=true] .tools button,[data-np-aid=true] #number-controls button{touch-action:none!important}.np-touch-held{outline:3px solid #b77b36!important;outline-offset:-3px}`;document.head.append(style);window.NPTapAid={options};
})();
