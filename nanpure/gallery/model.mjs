// Portable gallery data. The same format is used by Workers, OCI and the browser.
export const VERSION=1,MAX_SLOTS=7,MAX_BYTES=256*1024;
export const themes=['cream','sage','night'],frames=['wood','gold','simple'];
export const puzzleFields=['uid','id','kind','n','level','puzzle','solution','regions','linked','cages','thermos','arrows','lines','marks','constraints','links','steps','crosses','clues','kropkiMode','blockRows','blockCols','complexity','kStyle','shapeVersion','variantVersion','expansionVersion','trioVersion','multiShape','linkedShape','rating','verification','pattern','patternVersion'];
const text=(v,max)=>{if(typeof v!=='string'||v.length>max)throw Error('文字数を確認してください。');return v.trim()};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function cleanPuzzle(p){
 if(!p||!integer(p.n,4,100)||typeof p.kind!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(p.kind))throw Error('問題の形式を確認してください。');
 const a=Array.from(p.puzzle||[]),s=Array.from(p.solution||[]),max=p.linked?Math.max(p.n,...(Array.isArray(p.linked.boards)?p.linked.boards.map(b=>integer(b.n,4,100)?b.n:p.n):[])):p.n;
 if(a.length<16||a.length>20000||s.length!==a.length||a.some((v,i)=>!integer(v,0,max)||!integer(s[i],1,max)||v&&v!==s[i]))throw Error('問題の数字を確認してください。');
 if(!['multi','samurai','linked'].includes(p.kind)&&!p.linked&&a.length!==p.n*p.n)throw Error('盤面の大きさを確認してください。');
 const out={};for(const k of puzzleFields)if(p[k]!==undefined)out[k]=JSON.parse(JSON.stringify(p[k]));
 out.puzzle=a;out.solution=s;out.level=integer(p.level,0,10)?p.level:0;
 if(JSON.stringify(out).length>MAX_BYTES)throw Error('この問題は展示できる容量を超えています。');
 return out;
}
export function validCompletion(p){return !!(p&&(p.completed||p.done)&&!p.titleRevealed&&!p.video?.revealed&&!p.video?.auto&&Array.isArray(p.grid)&&p.grid.length===p.solution?.length&&p.grid.every((v,i)=>v===p.solution[i]));}
export function slotFromPuzzle(p,origin='created',detail={}){
 const record=cleanPuzzle(p);return {type:origin==='clear'?'clear':'puzzle',origin,title:detail.title||p.title||`${record.n}×${record.n} ナンプレ`,caption:'',record,...(origin==='clear'?{elapsed:Number.isFinite(detail.elapsed)?Math.max(0,Math.round(detail.elapsed)):Math.max(0,Math.round((p.elapsed||0)*1000)),at:Object.hasOwn(detail,'at')?detail.at:Date.now(),hints:detail.hints??p.video?.hints??null,errors:detail.errors??p.video?.errors??null}:{} )};
}
export function cleanSlot(s){
 if(s===null)return null;if(!s||!['puzzle','clear','title'].includes(s.type))throw Error('飾る内容を確認してください。');
 const out={type:s.type,title:text(s.title,60),caption:text(s.caption||'',180)};
 if(s.type==='title'){if(!/^NP-\d{4}$/.test(s.titleId||'')||!integer(Number(s.titleId.slice(3)),1,1000))throw Error('称号を確認してください。');out.titleId=s.titleId;}
 else{out.record=cleanPuzzle(s.record);out.origin=['created','favorite','clear'].includes(s.origin)?s.origin:'favorite';}
 if(s.type==='clear'){
  if(!integer(s.elapsed,0,315360000000)||(s.at!==null&&!integer(s.at,1,8640000000000000)))throw Error('クリア記録を確認してください。');
  out.elapsed=s.elapsed;out.at=s.at;out.hints=s.hints===null?null:integer(s.hints,0,1000000)?s.hints:null;out.errors=s.errors===null?null:integer(s.errors,0,1000000)?s.errors:null;out.recordOrigin='device';
 }
 if(s.credit&&/^[a-f0-9]{24}$/.test(s.credit.id||''))out.credit={id:s.credit.id,name:text(s.credit.name,40)};
 return out;
}
export function cleanRoom(r){
 if(!r||r.version!==VERSION||!Array.isArray(r.slots)||r.slots.length!==MAX_SLOTS)throw Error('展示室の形式を確認してください。');
 const out={version:VERSION,name:text(r.name,40),bio:text(r.bio||'',200),theme:themes.includes(r.theme)?r.theme:'cream',frame:frames.includes(r.frame)?r.frame:'wood',slots:r.slots.map(cleanSlot)};
 if(!out.name)throw Error('展示室の名前を入力してください。');
 if(new TextEncoder().encode(JSON.stringify(out)).length>MAX_BYTES)throw Error('展示室の容量が上限を超えました。飾る問題を減らしてください。');
 return out;
}
export const emptyRoom=()=>({version:VERSION,name:'わたしの展示室',bio:'お気に入りの問題と、遊んだ足跡。',theme:'cream',frame:'wood',slots:Array(MAX_SLOTS).fill(null)});
export function duration(ms){const sec=Math.floor(ms/1000),h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);return (h?h+'時間':'')+(m?m+'分':'')+(sec%60)+'秒';}
