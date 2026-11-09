import {input,json,fail,owner,hash,validKey,limit} from './http.js';
import {japanDay} from './shared/daily-plan.js';

const games=new Set(['plaza','nanpure','shirupure','wado','crossword','cross','tenbin','paths','studio','workshop','maru','tobe','maze','speed','kuroshiro','move','memo','timer','skins','other']);
const events=new Set(['page_view','screen_view','game_start','game_complete','game_abandon','ad_impression']);
const clean=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f]/.test(v);
export async function collectPareasobiEvent(request,env){
 if(request.method!=='POST')fail(405,'この操作は利用できません。');
 if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1')return json({ok:true,ignored:true});
 const data=await input(request,1200);
 if(Object.keys(data).some(k=>!['visitor','session','eventId','game','page','screen','event'].includes(k))||
   !validKey(data.visitor)||!validKey(data.session)||!validKey(data.eventId)||
   !games.has(data.game)||!events.has(data.event)||!clean(data.page,180)||!clean(data.screen,48))fail(400,'入力を確認してください。');
 const now=Date.now(),day=japanDay(now);
 await limit(env.DB,request,'pareasobi-analytics',600,3600000);
 const [visitor,session,eventId]=await Promise.all([
  hash('pareasobi:visitor:'+data.visitor),
  hash(day+':pareasobi:session:'+data.session),
  hash('pareasobi:event:'+data.eventId)
 ]);
 await env.DB.prepare('INSERT INTO pareasobi_events(event_id,day,game,page,screen,event,visitor,session,created) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING')
  .bind(eventId,day,data.game,data.page,data.screen,data.event,visitor,session,now).run();
 return json({ok:true});
}
export async function pareasobiAnalytics(request,env){
 if(request.method!=='GET')fail(405,'この操作は利用できません。');
 if(!await owner(request,env))fail(403,'管理用キーを入力してください。');
 const url=new URL(request.url),range=url.searchParams.get('range')||'30d';
 const days=({today:1,'7d':7,'30d':30,'90d':90})[range];
 if(!days)fail(400,'集計期間を確認してください。');
 const now=Date.now(),today=japanDay(now),from=japanDay(now-(days-1)*86400000),db=env.DB;
 const [totals,daily,byGame,byScreen,ads,events]=await Promise.all([
  db.prepare(`SELECT COUNT(*) AS events,COUNT(DISTINCT visitor) AS visitors,COUNT(DISTINCT session) AS sessions,
   SUM(CASE WHEN event='page_view' THEN 1 ELSE 0 END) AS pageViews,
   SUM(CASE WHEN event='game_start' THEN 1 ELSE 0 END) AS starts,
   SUM(CASE WHEN event='game_complete' THEN 1 ELSE 0 END) AS completes,
   SUM(CASE WHEN event='game_abandon' THEN 1 ELSE 0 END) AS abandons,
   SUM(CASE WHEN event='ad_impression' THEN 1 ELSE 0 END) AS adImpressions
   FROM pareasobi_events WHERE day>=?`).bind(from).first(),
  db.prepare(`SELECT day,
   SUM(CASE WHEN event='page_view' THEN 1 ELSE 0 END) AS pageViews,
   COUNT(DISTINCT visitor) AS visitors,
   SUM(CASE WHEN event='game_start' THEN 1 ELSE 0 END) AS starts,
   SUM(CASE WHEN event='ad_impression' THEN 1 ELSE 0 END) AS adImpressions
   FROM pareasobi_events WHERE day>=? GROUP BY day ORDER BY day`).bind(from).all(),
  db.prepare(`SELECT game,COUNT(DISTINCT visitor) AS visitors,COUNT(DISTINCT session) AS sessions,
   SUM(CASE WHEN event='page_view' THEN 1 ELSE 0 END) AS pageViews,
   SUM(CASE WHEN event='game_start' THEN 1 ELSE 0 END) AS starts,
   SUM(CASE WHEN event='game_complete' THEN 1 ELSE 0 END) AS completes,
   SUM(CASE WHEN event='game_abandon' THEN 1 ELSE 0 END) AS abandons,
   SUM(CASE WHEN event='ad_impression' THEN 1 ELSE 0 END) AS adImpressions
   FROM pareasobi_events WHERE day>=? GROUP BY game ORDER BY pageViews DESC,starts DESC`).bind(from).all(),
  db.prepare(`SELECT game,screen,COUNT(*) AS views,COUNT(DISTINCT visitor) AS visitors
   FROM pareasobi_events WHERE day>=? AND event='screen_view' GROUP BY game,screen ORDER BY views DESC LIMIT 100`).bind(from).all(),
  db.prepare(`SELECT game,page,screen,COUNT(*) AS impressions,COUNT(DISTINCT visitor) AS visitors
   FROM pareasobi_events WHERE day>=? AND event='ad_impression' GROUP BY game,page,screen ORDER BY impressions DESC LIMIT 100`).bind(from).all(),
  db.prepare(`SELECT event,COUNT(*) AS count FROM pareasobi_events WHERE day>=? GROUP BY event ORDER BY count DESC`).bind(from).all()
 ]);
 const asNum=x=>Number(x)||0;
 return json({ok:true,generatedAt:now,range,from,today,timezone:'Asia/Tokyo',
  totals:Object.fromEntries(['events','visitors','sessions','pageViews','starts','completes','abandons','adImpressions'].map(k=>[k,asNum(totals?.[k])])),
  daily:daily.results.map(r=>({day:r.day,pageViews:asNum(r.pageViews),visitors:asNum(r.visitors),starts:asNum(r.starts),adImpressions:asNum(r.adImpressions)})),
  games:byGame.results.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='number'?v: v]))),
  screens:byScreen.results,ads:ads.results,events:events.results,
  note:'利用者数は同じ日の同じブラウザーを1件とする匿名推計です。実人数ではありません。広告表示数は実表示を検知できた広告枠のみを数えます。'
 });
}
export async function cleanupPareasobiAnalytics(db,now=Date.now()){
 const cutoff=now-90*86400000;
 await db.prepare('DELETE FROM pareasobi_events WHERE created<?').bind(cutoff).run();
}
