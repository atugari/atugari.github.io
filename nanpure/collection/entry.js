(function(w){'use strict';
if(w.NPCollectionEntry)return;
const navigation=document.createElement('script');navigation.src='/puzzles/navigation.js?v=20261104-home-cleanup';document.head.append(navigation);
const learnMessages={"en":"Learn solving techniques","zh-Hans":"学习解题方法","zh-Hant":"學習解題方法","ko":"풀이 기법 배우기","es":"Aprender técnicas","fr":"Apprendre les techniques","de":"Lösungstechniken lernen","pt":"Aprender técnicas","it":"Impara le tecniche","nl":"Leer oplostechnieken","sv":"Lär dig lösningstekniker","pl":"Poznaj techniki","cs":"Naučte se techniky","ru":"Изучить приёмы решения","id":"Pelajari teknik","vi":"Học kỹ thuật giải","th":"เรียนรู้เทคนิคการแก้","hi":"हल करने की तकनीकें सीखें","ar":"تعلّم طرق الحل"};
// Register feature copy before the shared runtime walks the home text.
w.NPTranslations=w.NPTranslations||{};w.NPTranslations['解法で学ぶ']=learnMessages;
function mountLearning(home){
 let live=null;document.querySelectorAll('[data-learning-entry]').forEach(link=>{if(home&&home.contains(link)&&!live)live=link;else link.remove()});
 const host=home?.querySelector('.home-bottom-links');if(!host||live)return;
 const link=document.createElement('a');link.href='/nanpure/learn/';link.dataset.learningEntry='';link.className='np-learning-entry';link.textContent='解法で学ぶ';host.append(link);
}
function mount(){
 const home=document.querySelector('.designed-home');
 mountLearning(home);
 document.querySelectorAll('[data-collection-entry]').forEach(node=>node.remove());
}
w.NPCollectionEntry={mount};
new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
mount();
})(window);
