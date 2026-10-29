(function(w){'use strict';
if(w.NPCollectionEntry)return;
function mount(){
 document.querySelectorAll('[data-collection-entry]').forEach(node=>{if(!node.closest('.designed-home'))node.remove()});
 const home=document.querySelector('.designed-home');if(!home||home.querySelector('[data-collection-entry]'))return;
 const choices=home.querySelector('.start-choices');if(!choices)return;
 const link=document.createElement('a');link.className='np-collection-entry';link.dataset.collectionEntry='';link.href='/nanpure/collection/';
 link.innerHTML='<span class="np-collection-copy"><strong>すぐ遊べる10万問</strong><small>23ルール・生成を待たずに遊ぶ</small></span><span aria-hidden="true">›</span>';
 choices.after(link);
}
w.NPCollectionEntry={mount};
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}).observe(document.documentElement,{childList:true,subtree:true});
mount();
})(window);
