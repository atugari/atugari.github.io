(function(w){'use strict';
if(w.NPCollectionEntry)return;
const messages={"すぐ遊べる10万問":{"en":"100,000 ready-to-play puzzles","zh-Hans":"10万道现成谜题","zh-Hant":"10萬道現成謎題","ko":"바로 즐기는 퍼즐 10만 개","es":"100.000 puzles listos para jugar","fr":"100 000 grilles prêtes à jouer","de":"100.000 fertige Rätsel","pt":"100.000 desafios prontos","it":"100.000 puzzle pronti","nl":"100.000 kant-en-klare puzzels","sv":"100 000 färdiga pussel","pl":"100 000 gotowych łamigłówek","cs":"100 000 připravených hlavolamů","ru":"100 000 готовых головоломок","id":"100.000 teka-teki siap dimainkan","vi":"100.000 câu đố có sẵn","th":"ปริศนาพร้อมเล่น 100,000 ข้อ","hi":"खेलने के लिए तैयार 1,00,000 पहेलियाँ","ar":"100,000 لغز جاهز للعب"},"23ルール・生成を待たずに遊ぶ":{"en":"23 rule types · Play without waiting","zh-Hans":"23种规则 · 无需等待生成","zh-Hant":"23種規則 · 不必等待產生","ko":"23가지 규칙 · 생성 대기 없이","es":"23 tipos de reglas · Juega sin esperar","fr":"23 types de règles · Jouez sans attendre","de":"23 Regelarten · Ohne Wartezeit spielen","pt":"23 tipos de regras · Jogue sem esperar","it":"23 tipi di regole · Gioca senza attese","nl":"23 soorten regels · Spelen zonder wachten","sv":"23 regeltyper · Spela utan väntan","pl":"23 rodzaje zasad · Graj bez czekania","cs":"23 typů pravidel · Hrajte bez čekání","ru":"23 вида правил · Играйте без ожидания","id":"23 jenis aturan · Tanpa menunggu pembuatan","vi":"23 kiểu luật · Chơi ngay, không chờ tạo","th":"กติกา 23 แบบ · ไม่ต้องรอสร้าง","hi":"23 तरह के नियम · बनने का इंतज़ार नहीं","ar":"23 نوعًا من القواعد · العب دون انتظار"}};
// Register feature copy before the shared runtime walks the home text.
w.NPTranslations=w.NPTranslations||{};for(const [source,translations]of Object.entries(messages))w.NPTranslations[source]=translations;
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
