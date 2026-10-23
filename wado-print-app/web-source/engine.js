(function(global){
 'use strict';
 const positions=['top','left','right','bottom'];
 const labels={top:'上',left:'左',right:'右',bottom:'下'};
 const levels=[
  ['1 · いちばんやさしい',1,4.2,1,'特によく使われる熟語だけで作ります。'],
  ['2 · とてもやさしい',1,4.0,1,'よく使われる熟語を中心に作ります。'],
  ['3 · やさしい',1,3.7,1,'身近な熟語の範囲を少し広げます。'],
  ['4 · 日常のことば',1,3.4,1,'日常で見かける熟語を幅広く使います。'],
  ['5 · 少し背伸び',2,0,1.25,'やや見かけにくい熟語も交ぜます。'],
  ['6 · ことばを広げる',2,0,1.5,'やや見かけにくい熟語の割合を増やします。'],
  ['7 · 手ごたえあり',2,0,1.75,'やや見かけにくい熟語を中心に作ります。'],
  ['8 · むずかしい',3,0,2,'使用頻度の低い熟語も使います。'],
  ['9 · かなりむずかしい',3,0,2.5,'使用頻度の低い熟語の割合を増やします。'],
  ['10 · いちばんむずかしい',3,0,2.75,'使用頻度の低い熟語を中心に作ります。']
 ].map(([name,maxRank,minZipf,minAverage,help])=>({name,maxRank,minZipf,minAverage,help}));
 const kanji=/^[\u3400-\u9fff]$/;
 const word=(p,position)=>['top','left'].includes(position)?p.arms[position]+p.answer:p.answer+p.arms[position];
 const fingerprint=p=>['top','left'].filter(k=>p.arms[k]).map(k=>p.arms[k]).sort().join('')+'>'+['right','bottom'].filter(k=>p.arms[k]).map(k=>p.arms[k]).sort().join('');
 function random(seed){let n=seed>>>0;return()=>{n=(n+0x6d2b79f5)>>>0;let x=Math.imul(n^(n>>>15),n|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};}
 function shuffle(list,rng){const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 function create(data,bank){
  if(data?.revision!=='whole-lexicon-2'||!Array.isArray(data.words)||bank?.version!==1||!Array.isArray(bank.words))throw Error('同梱データを読み込めませんでした。元のHTMLファイルを開き直してください。');
  const words=new Map(data.words.map(w=>[w.text,w])),hints=new Map(bank.words.map(h=>[h.text,h])),hintSystem=WadoClues.create(bank),pool=new Map(),configs=new Map();
  function add(char,side,item){if(!pool.has(char))pool.set(char,{before:[],after:[]});pool.get(char)[side].push(item);}
  for(const w of words.values()){if(w.text[0]===w.text[1])continue;add(w.text[1],'before',w);add(w.text[0],'after',w);}
  function clue(p,position=p.hintPosition){const h=hints.get(word(p,position));return h&&[h.broad,h.category,h.detail].every(s=>typeof s==='string'&&s.length>2&&!s.includes(p.answer))?h:null;}
  function config(level,count){const key=level+':'+count;if(configs.has(key))return configs.get(key);const c=levels[level-1],ok=w=>w.rank<=c.maxRank&&w.zipf>=c.minZipf;const values=[...pool].map(([answer,e])=>({answer,before:e.before.filter(ok),after:e.after.filter(ok)})).filter(e=>e.before.length>=(count===4?2:1)&&e.after.length>=(count===4?2:1));configs.set(key,values);return values;}
  function generate({level=2,count=4,seed=Date.now(),seen=[]}={}){
   if(!Number.isInteger(level)||level<1||level>10||![2,3,4].includes(count)||!Number.isSafeInteger(seed))throw Error('生成条件を確認してください。');
   const c=levels[level-1],rng=random(seed),entries=config(level,count),known=new Set(seen);
   for(let attempt=0;attempt<40000&&entries.length;attempt++){
    const e=entries[Math.floor(rng()*entries.length)],before=shuffle(e.before,rng),after=shuffle(e.after,rng),left=count===4||count===3&&rng()<.5,bottom=count===4||count===3&&!left;
    if(left&&before.length<2||bottom&&after.length<2)continue;
    const arms={top:before[0].text[0],right:after[0].text[1]};if(left)arms.left=before[1].text[0];if(bottom)arms.bottom=after[1].text[1];
    if(new Set(Object.values(arms)).size!==count)continue;
    const p={schema:1,level,count,arms,answer:e.answer};
    const used=positions.filter(k=>arms[k]);if(used.reduce((sum,k)=>sum+words.get(word(p,k)).rank,0)/count<c.minAverage||known.has(fingerprint(p)))continue;
    const targets=used.filter(k=>clue(p,k)&&hintSystem.rich(p,k));if(!targets.length)continue;
    p.hintPosition=targets[Math.floor(rng()*targets.length)];return p;
   }
   throw Error('この条件で新しい問題が見つかりませんでした。問題数を減らすか、難しさ・熟語の数を変えてください。');
  }
  function validatePuzzle(input){
   if(!input||input.schema!==1||!Number.isInteger(input.level)||input.level<1||input.level>10||![2,3,4].includes(input.count)||!kanji.test(input.answer)||!input.arms||typeof input.arms!=='object'||Array.isArray(input.arms))throw Error('問題の形式を確認してください。');
   const keys=Object.keys(input.arms),c=levels[input.level-1];if(keys.length!==input.count||!input.arms.top||!input.arms.right||keys.some(k=>!positions.includes(k)||!kanji.test(input.arms[k]))||new Set(Object.values(input.arms)).size!==input.count)throw Error('問題の配置を確認してください。');
   const entries=keys.map(k=>words.get(word(input,k)));if(entries.some(w=>!w||w.rank>c.maxRank||w.zipf<c.minZipf)||entries.reduce((s,w)=>s+w.rank,0)/input.count<c.minAverage)throw Error('問題の熟語を確認してください。');
   if(!keys.includes(input.hintPosition)||!clue(input))throw Error('ヒントを確認してください。');
   const p={schema:1,level:input.level,count:input.count,answer:input.answer,arms:Object.fromEntries(positions.filter(k=>input.arms[k]).map(k=>[k,input.arms[k]])),hintPosition:input.hintPosition};
   if(input.id!==undefined){if(typeof input.id!=='string'||!/^WA-[A-Z0-9-]{5,48}$/.test(input.id))throw Error('問題番号を確認してください。');p.id=input.id;}
   if(input.created!==undefined){if(!Number.isSafeInteger(input.created)||input.created<0)throw Error('作成日時を確認してください。');p.created=input.created;}
   if(input.hintChoice!==undefined){if(typeof input.hintChoice!=='string'||!/^\w+\.[0-9]{1,2}$/.test(input.hintChoice))throw Error('選んだヒントを確認してください。');if(hintSystem.validChoice(p,input.hintChoice))p.hintChoice=input.hintChoice;}
   return p;
  }
  return{generate,validatePuzzle,clue,hintSystem,entry:text=>words.get(text),hintWordCount:hints.size};
 }
 global.WadoPrint={create,levels,positions,labels,word,fingerprint};
})(typeof window==='undefined'?globalThis:window);
