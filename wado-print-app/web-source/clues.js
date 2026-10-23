(function(g){
 'use strict';
 const positions=['top','left','right','bottom'],labels={top:'上',left:'左',right:'右',bottom:'下'};
 const grades=[{value:1,label:'難しめ',help:'連想や広い手がかりから考える'},{value:2,label:'ふつう',help:'種類・使う場面・働きなどで絞る'},{value:3,label:'やさしめ',help:'具体的な意味・特徴・例から考える'}];
 const views={association:'連想',scene:'使う場面',function:'働き・用途',feature:'特徴',contrast:'対比',meaning:'意味',category:'種類',field:'分野'};
 const word=(p,k)=>['top','left'].includes(k)?p.arms[k]+p.answer:p.answer+p.arms[k];
 const key=p=>positions.map(k=>k+':'+(p.arms[k]||'')).join('|')+'>'+p.answer;
 function hash(s){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
 function create(bank){
  if(bank?.version!==1||!Array.isArray(bank.words))throw Error('ヒントのデータを読み込めませんでした。');
  const words=new Map(bank.words.map(w=>[w.text,w]));
  function all(p){
   const result=[];
   for(const position of positions){if(!p.arms[position])continue;const h=words.get(word(p,position));if(!h)continue;
    const entries=[{grade:1,view:'field',text:h.broad},{grade:2,view:'category',text:h.category},{grade:3,view:'meaning',text:h.detail},...(h.variants||[]).map(v=>({...v,preferred:true}))];
    for(const [index,c]of entries.entries())if([1,2,3].includes(c.grade)&&views[c.view]&&typeof c.text==='string'&&c.text.length>2&&c.text.length<=100&&!c.text.includes(p.answer))result.push({...c,id:position+'.'+index,position,word:h.text,label:grades[c.grade-1].label,viewLabel:views[c.view]});
   }
   return result.filter((c,i,a)=>a.findIndex(x=>x.text===c.text&&x.grade===c.grade)===i);
  }
  function rich(p,position){const list=all(p).filter(c=>c.preferred&&(!position||c.position===position));return grades.every(g=>list.some(c=>c.grade===g.value));}
  function richWords(p){return [...new Set(all(p).filter(c=>c.preferred).map(c=>c.word))].filter(w=>grades.every(g=>all(p).some(c=>c.preferred&&c.word===w&&c.grade===g.value)));}
  function similar(a,b){const clean=s=>s.replace(/[\s、。・「」『』（）(),.!?]/g,''),x=clean(a),y=clean(b);if(Math.min(x.length,y.length)<8)return x===y;const grams=s=>new Set([...s].slice(1).map((c,i)=>s[i]+c)),u=grams(x),v=grams(y),intersection=[...u].filter(c=>v.has(c)).length;return intersection/(u.size+v.size-intersection)>.5;}
  function suggestions(p){
   const available=all(p),list=available.filter(c=>c.preferred||!available.some(x=>x.preferred&&x.grade===c.grade)),chosen=[],usedViews=new Set(),usedIds=new Set();
   const order=(a,b)=>Number(!!b.preferred)-Number(!!a.preferred)||(a.view==='field')-(b.view==='field')||hash(key(p)+a.id)-hash(key(p)+b.id);
   function add(c,force=false){if(c&&!usedIds.has(c.id)&&(force||!chosen.some(x=>similar(x.text,c.text)))){chosen.push(c);usedIds.add(c.id);usedViews.add(c.view);}}
   for(const grade of [1,2,3])add(list.filter(c=>c.grade===grade).sort(order)[0],true);
   for(const c of list.slice().sort(order))if(!usedViews.has(c.view)&&chosen.length<8)add(c);
   for(const c of list.slice().sort(order))if(chosen.length<6)add(c);
   const manual=available.find(c=>c.id===p.hintChoice);if(manual&&!usedIds.has(manual.id)){if(chosen.length>=8)chosen.pop();add(manual,true);}
   return chosen.sort((a,b)=>a.grade-b.grade||order(a,b));
  }
  function plan(puzzles,grade,{respectSelection=true}={}){
   const result=new Map(),viewCounts=new Map(),textCounts=new Map(),recent=[];
   for(const p of puzzles){if(!grade){result.set(key(p),null);continue;}const list=all(p),manual=respectSelection&&list.find(c=>c.id===p.hintChoice);let options=list.filter(c=>c.grade===grade);const dedicated=options.filter(c=>c.preferred);if(dedicated.length)options=dedicated;
    const preferred=options.filter(c=>c.preferred&&!textCounts.get(c.text)&&c.view!==recent.at(-1)?.view);if(preferred.length)options=preferred;
    const score=c=>(textCounts.get(c.text)||0)*1000+(c.view===recent.at(-1)?.view?250:0)+(c.preferred?0:20)+(viewCounts.get(c.view)||0)*20+(hash(key(p)+c.id)%1000)/1000;
    const chosen=manual||options.sort((a,b)=>score(a)-score(b))[0]||null;result.set(key(p),chosen);
    if(chosen){viewCounts.set(chosen.view,(viewCounts.get(chosen.view)||0)+1);textCounts.set(chosen.text,(textCounts.get(chosen.text)||0)+1);recent.push(chosen);if(recent.length>8){const old=recent.shift();viewCounts.set(old.view,viewCounts.get(old.view)-1);textCounts.set(old.text,textCounts.get(old.text)-1);}}
   }
   return result;
  }
  function validChoice(p,id){return typeof id==='string'&&all(p).some(c=>c.id===id);}
  return{all,rich,richWords,suggestions,plan,validChoice,key,wordCount:words.size,richWordCount:[...words.values()].filter(w=>w.variants?.length>=3).length};
 }
 g.WadoClues={create,grades,views,labels,key};
})(typeof window==='undefined'?globalThis:window);
