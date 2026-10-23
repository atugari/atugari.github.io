import{body,fail,input,json,limit,Problem}from'./http.js';
import{problem,discoveryQueries,inspectNetwork,MAX_CANDIDATES}from'./shared/wado-web.js';
const available=env=>env.WADO_WEB_ENABLED==='true'&&typeof env.TAVILY_API_KEY==='string'&&env.TAVILY_API_KEY.length>=8;
export async function wadoWeb(request,env){
 if(request.method==='GET')return json({enabled:available(env),provider:'Tavily'});
 if(!available(env))fail(503,'ネット自動検索はまだ接続されていません。外部検索のリンクから確認できます。');
 let p;try{p=problem(await input(request,1000));}catch(error){if(error instanceof Problem)throw error;fail(400,error.message);}
 await limit(env.DB,request,'wado-web',3,3600000);
 // Reserve the worst-case number of calls atomically BEFORE any paid request.
 const maximum=discoveryQueries(p).length+MAX_CANDIDATES*Object.keys(p.arms).length;
 const cap=/^[1-9]\d{0,3}$/.test(env.WADO_WEB_DAILY_QUERIES||'')?Math.min(1000,Number(env.WADO_WEB_DAILY_QUERIES)):40;
 const monthlyCap=/^[1-9]\d{0,2}$/.test(env.WADO_WEB_MONTHLY_QUERIES||'')?Math.min(900,Number(env.WADO_WEB_MONTHLY_QUERIES)):900;
 const day=new Date().toISOString().slice(0,10),key='wado-web-budget:'+day,expires=Date.now()+172800000;
 const monthKey='wado-web-budget-month:'+day.slice(0,7),now=new Date(),monthExpires=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,2);
 const month=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) SELECT ?,?,? WHERE ?<=? ON CONFLICT(key) DO UPDATE SET count=count+excluded.count WHERE count+excluded.count<=? RETURNING count').bind(monthKey,maximum,monthExpires,maximum,monthlyCap,monthlyCap).first();
 if(!month)fail(429,'今月のネット自動検索の上限に達しました。外部検索のリンクから確認できます。');
 const budget=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) SELECT ?,?,? WHERE ?<=? ON CONFLICT(key) DO UPDATE SET count=count+excluded.count WHERE count+excluded.count<=? RETURNING count').bind(key,maximum,expires,maximum,cap,cap).first();
 if(!budget){await env.DB.prepare('UPDATE rate_limits SET count=MAX(0,count-?) WHERE key=?').bind(maximum,monthKey).run();fail(429,'今日のネット自動検索の上限に達しました。外部検索のリンクから確認できます。');}
 let calls=0;const deadline=Date.now()+45000;
 const search=async query=>{
  if(Date.now()>deadline||calls>=maximum)throw Error('Query budget exceeded');calls++;
  const response=await fetch('https://api.tavily.com/search',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+env.TAVILY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({query,topic:'general',search_depth:'basic',max_results:5,include_answer:false,include_raw_content:false,include_images:false,auto_parameters:false,language:'ja',filter_by_language:true}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Search unavailable');
  // Treat malformed/oversized responses as failed searches, never as zero hits.
  const raw=await body(response,1000000);let data;try{data=JSON.parse(new TextDecoder().decode(raw));}catch{throw Error('Invalid search response');}
  if(!Array.isArray(data.results)||data.results.length>20||data.results.some(r=>!r||typeof r.url!=='string'||typeof r.content!=='string'))throw Error('Invalid search response');
  return data.results;
 };
 try{const report=await inspectNetwork(p,search);return json({...report,notice:'検索結果の用例から見つけた候補です。誤記・固有名詞・引用などもあるため原文で確認してください。ネット全体での唯一解の証明ではありません。'});}
 finally{const unused=maximum-calls;if(unused)await env.DB.prepare('UPDATE rate_limits SET count=MAX(0,count-?) WHERE key IN (?,?)').bind(unused,key,monthKey).run();}
}
