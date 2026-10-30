(function(w){'use strict';
if(w.NPCollectionEntry)return;
const navigation=document.createElement('script');navigation.src='/puzzles/navigation.js?v=20261031-move4';document.head.append(navigation);
const messages={"すぐ遊べる問題集":{"en":"Ready-to-play puzzles","zh-Hans":"现成谜题集","zh-Hant":"現成謎題集","ko":"바로 즐기는 퍼즐 모음","es":"Puzles listos para jugar","fr":"Grilles prêtes à jouer","de":"Fertige Rätsel","pt":"Desafios prontos","it":"Puzzle pronti","nl":"Kant-en-klare puzzels","sv":"Färdiga pussel","pl":"Gotowe łamigłówki","cs":"Připravené hlavolamy","ru":"Готовые головоломки","id":"Teka-teki siap dimainkan","vi":"Bộ câu đố có sẵn","th":"ปริศนาพร้อมเล่น","hi":"खेलने के लिए तैयार पहेलियाँ","ar":"ألغاز جاهزة للعب"},"ナンプレ22ルール・生成を待たずに遊ぶ":{"en":"22 rule types · Play without waiting","zh-Hans":"22种规则 · 无需等待生成","zh-Hant":"22種規則 · 不必等待產生","ko":"22가지 규칙 · 생성 대기 없이","es":"22 tipos de reglas · Juega sin esperar","fr":"22 types de règles · Jouez sans attendre","de":"22 Regelarten · Ohne Wartezeit spielen","pt":"22 tipos de regras · Jogue sem esperar","it":"22 tipi di regole · Gioca senza attese","nl":"22 soorten regels · Spelen zonder wachten","sv":"22 regeltyper · Spela utan väntan","pl":"22 rodzaje zasad · Graj bez czekania","cs":"22 typů pravidel · Hrajte bez čekání","ru":"22 вида правил · Играйте без ожидания","id":"22 jenis aturan · Tanpa menunggu pembuatan","vi":"22 kiểu luật · Chơi ngay, không chờ tạo","th":"กติกา 22 แบบ · ไม่ต้องรอสร้าง","hi":"22 तरह के नियम · बनने का इंतज़ार नहीं","ar":"22 نوعًا من القواعد · العب دون انتظار"}};
// Register feature copy before the shared runtime walks the home text.
w.NPTranslations=w.NPTranslations||{};for(const [source,translations]of Object.entries(messages))w.NPTranslations[source]=translations;
function mount(){
 document.querySelectorAll('[data-collection-entry]').forEach(node=>{if(!node.closest('.designed-home'))node.remove()});
 const home=document.querySelector('.designed-home');if(!home||home.querySelector('[data-collection-entry]'))return;
 const choices=home.querySelector('.start-choices');if(!choices)return;
 const link=document.createElement('a');link.className='np-collection-entry';link.dataset.collectionEntry='';link.href='/nanpure/collection/';
 link.innerHTML='<span class="np-collection-copy"><strong>すぐ遊べる問題集</strong><small>ナンプレ22ルール・生成を待たずに遊ぶ</small></span><span aria-hidden="true">›</span>';
 choices.after(link);
}
w.NPCollectionEntry={mount};
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}).observe(document.documentElement,{childList:true,subtree:true});
mount();
})(window);
