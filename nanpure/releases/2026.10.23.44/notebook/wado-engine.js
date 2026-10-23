(function(w){
 'use strict';
 const levels=[
  {name:'1 · いちばんやさしい',choices:2,readings:4,maxRank:1,minAverage:1,help:'身近な熟語・2択・すべての読みつき'},
  {name:'2 · とてもやさしい',choices:3,readings:4,maxRank:1,minAverage:1,help:'身近な熟語・3択・すべての読みつき'},
  {name:'3 · やさしい',choices:4,readings:4,maxRank:1,minAverage:1,help:'身近な熟語・4択・すべての読みつき'},
  {name:'4 · 選択肢を増やす',choices:6,readings:4,maxRank:1,minAverage:1,help:'身近な熟語・6択・すべての読みつき'},
  {name:'5 · 漢字を思い出す',choices:0,readings:4,maxRank:1,minAverage:1,help:'身近な熟語・選択肢なし・すべての読みつき'},
  {name:'6 · 少しのヒントで',choices:0,readings:1,maxRank:1,minAverage:1,help:'身近な熟語・選択肢なし・読みのヒント1つ'},
  {name:'7 · ヒントなしで',choices:0,readings:0,maxRank:1,minAverage:1,help:'身近な熟語・選択肢と読みなし'},
  {name:'8 · 熟語の幅を広げる',choices:0,readings:0,maxRank:2,minAverage:1.5,help:'日常の幅広い熟語・選択肢と読みなし'},
  {name:'9 · むずかしい',choices:0,readings:0,maxRank:3,minAverage:2,help:'抽象的な熟語も使用・選択肢と読みなし'},
  {name:'10 · いちばんむずかしい',choices:0,readings:0,maxRank:3,minAverage:2.75,help:'幅広い語彙が必要な熟語を中心に・選択肢と読みなし'}
 ];
 const positions=['top','left','right','bottom'],kanji=/^[\u3400-\u9fff]$/;
 const word=(p,position,answer=p.answer)=>['top','left'].includes(position)?p.arms[position]+answer:answer+p.arms[position];
 function rng(seed){let state=seed>>>0;return()=>{state=(state+0x6d2b79f5)>>>0;let x=Math.imul(state^(state>>>15),state|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};}
 function shuffle(values,random){const a=values.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 function fingerprint(p){const before=['top','left'].filter(k=>p.arms[k]).map(k=>p.arms[k]).sort().join(''),after=['right','bottom'].filter(k=>p.arms[k]).map(k=>p.arms[k]).sort().join('');return before+'>'+after;}
 function create(data){
  if(data?.version!==1||!Array.isArray(data.words)||typeof data.checks!=='string')throw Error('辞書を読み込めませんでした。');
  const words=new Map(),checks=new Set(data.checks.split(' ')),inIndex=new Map(),outIndex=new Map(),pool=new Map();
  function add(map,key,value){if(!map.has(key))map.set(key,new Set());map.get(key).add(value);}
  for(const text of checks){if(!/^[\u3400-\u9fff]{2}$/.test(text))throw Error('辞書の形式を確認してください。');add(inIndex,text[0],text[1]);add(outIndex,text[1],text[0]);}
  for(const item of data.words){if(!checks.has(item.text)||!['1','2','3'].includes(String(item.rank))||!/[ぁ-ゖ]/.test(item.reading))throw Error('熟語データを確認してください。');words.set(item.text,Object.freeze({...item}));}
  for(const entry of words.values()){
   const [a,b]=entry.text;
   if(a===b)continue;
   for(const char of [a,b])if(!pool.has(char))pool.set(char,{before:[],after:[]});
   pool.get(b).before.push(entry);pool.get(a).after.push(entry);
  }
  const choicePool=[...new Set([...words.values()].filter(e=>e.rank===1).map(e=>e.text).join(''))];
  const configurations=new Map();
  function candidates(p){
   let result=null;
   for(const key of positions){if(!p.arms[key])continue;const allowed=(['top','left'].includes(key)?inIndex:outIndex).get(p.arms[key])||new Set();result=result===null?new Set(allowed):new Set([...result].filter(c=>allowed.has(c)));}
   return result?[...result].sort():[];
  }
  function configuration(level,count){
   const key=level+':'+count;if(configurations.has(key))return configurations.get(key);
   const config=levels[level-1],answerPool=[...pool].map(([answer,entry])=>({answer,before:entry.before.filter(w=>w.rank<=config.maxRank),after:entry.after.filter(w=>w.rank<=config.maxRank)})).filter(e=>e.before.length>=(count===4?2:1)&&e.after.length>=(count===4?2:1));
   configurations.set(key,answerPool);return answerPool;
  }
  function generate({level=1,count=4,seed=Date.now(),seen=[]}={}){
   if(!Number.isInteger(level)||level<1||level>10||![2,3,4].includes(count)||!Number.isInteger(seed))throw Error('生成条件を確認してください。');
   const config=levels[level-1],random=rng(seed),answerPool=configuration(level,count),known=new Set(seen);
   for(let trial=0;trial<20000&&answerPool.length;trial++){
    const entry=answerPool[Math.floor(random()*answerPool.length)],before=shuffle(entry.before,random),after=shuffle(entry.after,random),useLeft=count===4||count===3&&random()<.5,useBottom=count===4||count===3&&!useLeft;
    if(useLeft&&before.length<2||useBottom&&after.length<2)continue;
    const arms={top:before[0].text[0],right:after[0].text[1]};
    if(useLeft)arms.left=before[1].text[0];if(useBottom)arms.bottom=after[1].text[1];
    if(new Set(Object.values(arms)).size!==count)continue;
    const p={version:1,level,count,arms,answer:entry.answer,choices:[]};
    const average=positions.filter(k=>arms[k]).reduce((sum,k)=>sum+words.get(word(p,k)).rank,0)/count;
    if(average<config.minAverage||known.has(fingerprint(p)))continue;
    const answers=candidates(p);if(answers.length!==1||answers[0]!==p.answer)continue;
    if(config.choices)p.choices=shuffle([p.answer,...shuffle(choicePool.filter(c=>c!==p.answer),random).slice(0,config.choices-1)],random);
    return p;
   }
   throw Error('この条件で新しい問題が見つかりませんでした。難易度や熟語の数を変えてください。');
  }
  function validate(p){
   if(p?.version!==1||!Number.isInteger(p.level)||p.level<1||p.level>10||![2,3,4].includes(p.count)||!kanji.test(p.answer)||!p.arms||typeof p.arms!=='object'||Array.isArray(p.arms))throw Error('問題データを確認してください。');
   const keys=Object.keys(p.arms),config=levels[p.level-1];
   if(keys.length!==p.count||!p.arms.top||!p.arms.right||keys.some(k=>!positions.includes(k)||!kanji.test(p.arms[k]))||new Set(Object.values(p.arms)).size!==p.count)throw Error('問題の配置を確認してください。');
   const entries=keys.map(k=>words.get(word(p,k)));if(entries.some(e=>!e||e.rank>config.maxRank)||entries.reduce((s,e)=>s+e.rank,0)/p.count<config.minAverage)throw Error('熟語を確認してください。');
   const answers=candidates(p);if(answers.length!==1||answers[0]!==p.answer)throw Error('答えが一つに定まりません。');
   if(!Array.isArray(p.choices)||p.choices.length!==config.choices||p.choices.some(c=>!kanji.test(c))||new Set(p.choices).size!==p.choices.length||config.choices&&!p.choices.includes(p.answer))throw Error('選択肢を確認してください。');
   if(p.created!==undefined&&(!Number.isSafeInteger(p.created)||p.created<0))throw Error('保存日時を確認してください。');return p;
  }
  function hints(p){return positions.filter(k=>p.arms[k]).slice(0,levels[p.level-1].readings).map(position=>({position,reading:words.get(word(p,position)).reading}));}
  return{generate,validate,candidates,fingerprint,word,hints,levels,positions,entry:text=>words.get(text),sourceDate:data.sourceDate};
 }
 w.NPWado={create,levels,positions,word,fingerprint};
})(typeof window==='undefined'?globalThis:window);
