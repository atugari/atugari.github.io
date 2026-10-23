// Network-search helpers shared by the website and Worker. No dictionary input.
export const positions=['top','left','right','bottom'];
export const MAX_CANDIDATES=3;
const han=/^[\u3400-\u9fff]$/;
export function problem(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!input.arms||typeof input.arms!=='object'||Array.isArray(input.arms)||Object.keys(input).some(k=>!['arms','answer'].includes(k)))throw Error('問題の漢字を確認してください。');
 const keys=Object.keys(input.arms);
 if(keys.length<2||keys.length>4||keys.some(k=>!positions.includes(k)||!han.test(input.arms[k]))||input.answer!=null&&!han.test(input.answer))throw Error('周りの漢字を2〜4か所、1文字ずつ入力してください。');
 return{arms:Object.fromEntries(positions.filter(k=>input.arms[k]).map(k=>[k,input.arms[k]])),answer:input.answer??null};
}
export function words(p,answer){if(!han.test(answer))throw Error('候補の漢字を1文字入力してください。');return Object.entries(p.arms).map(([position,char])=>({position,text:['top','left'].includes(position)?char+answer:answer+char}));}
export function discoveryQueries(input){const p=problem(input),shape=Object.entries(p.arms).map(([k,c])=>['top','left'].includes(k)?c+'□':'□'+c).join(' ');return[shape+' 共通 漢字 二字熟語',...Object.values(p.arms).map(c=>'"'+c+'" 二字熟語 一覧')];}
export function candidateQuery(input,answer){return words(problem(input),answer).map(w=>'"'+w.text+'"').join(' ');}
export function searchUrl(query){return'https://www.google.com/search?'+new URLSearchParams({q:query,hl:'ja'});}
export function searchLinks(input,answer=null){const p=problem(input),queries=[{label:'この問題の別解候補をネットで探す',query:discoveryQueries(p)[0]}];if(answer)queries.push({label:'候補「'+answer+'」の熟語をまとめて検索',query:candidateQuery(p,answer)},...words(p,answer).map(w=>({label:w.text+'の用例を検索',query:'"'+w.text+'" 意味 用例'})));return queries.map(item=>({...item,url:searchUrl(item.query)}));}
export function safeResult(result){
 if(!result||typeof result.url!=='string'||typeof result.content!=='string')return null;
 let url;try{url=new URL(result.url);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.href.length>2000)return null;
 return{title:String(result.title||url.hostname).replace(/<[^>]*>/g,'').slice(0,160),url:url.href,content:result.content.slice(0,12000)};
}
function plain(text){return text.replace(/https?:\/\/\S+/g,' ').replace(/<[^>]*>/g,' ');}
function tokens(text){return[...plain(text).matchAll(/(?<!\p{Script=Han})[\u3400-\u9fff]{2}(?!\p{Script=Han})/gu)].map(m=>m[0]);}
export function evidence(text,results){return results.filter(r=>tokens(r.title+' '+r.content).includes(text)).map(({title,url})=>({title,url}));}
export function discover(input,results){
 const p=problem(input),candidates=new Map();
 for(const result of results)for(const text of new Set(tokens(result.title+' '+result.content)))for(const[position,char]of Object.entries(p.arms)){
  const incoming=['top','left'].includes(position),answer=incoming?text[1]:text[0];
  if((incoming?text[0]:text[1])!==char||answer===p.answer)continue;
  if(!candidates.has(answer))candidates.set(answer,new Set());candidates.get(answer).add(position);
 }
 return[...candidates].sort((a,b)=>b[1].size-a[1].size||a[0].localeCompare(b[0],'ja')).map(([answer])=>answer);
}
export async function inspectNetwork(input,search){
 const p=problem(input),queries=[],discovered=[];let failed=0;
 async function run(query){try{const raw=await search(query),results=raw.map(safeResult).filter(Boolean);queries.push({query,ok:true,results:results.map(({title,url})=>({title,url}))});return results;}catch{failed++;queries.push({query,ok:false,results:[]});return[];}}
 for(const query of discoveryQueries(p))discovered.push(...await run(query));
 const found=discover(p,discovered),answers=found.slice(0,MAX_CANDIDATES),candidates=[];
 for(const answer of answers){const entries=[];
  for(const item of words(p,answer)){
   let sources=evidence(item.text,discovered);
   if(!sources.length)sources=evidence(item.text,await run('"'+item.text+'" 意味 用例'));
   sources=[...new Map(sources.map(s=>[s.url,s])).values()].slice(0,3);
   entries.push({...item,sources});
  }
  candidates.push({answer,words:entries,allWordsFound:entries.every(w=>w.sources.length>0)});
 }
 return{version:1,provider:'Tavily',checkedAt:Date.now(),status:failed?'incomplete':candidates.some(c=>c.allWordsFound)?'candidates-found':'no-candidates-found',candidates,discoveredCandidates:found.length,truncated:found.length>MAX_CANDIDATES,failedQueries:failed,queries,exhaustive:false};
}
