import{input,json,fail,hash,validKey,limit,owner}from'./http.js';
import{japanDay}from'./shared/daily-plan.js';
const EVENTS=new Set(['page_view','game_access','game_start','game_complete','screen_view','ad_impression','ad_click']);
const SAFE=/^[a-z0-9_-]{1,48}$/;
const clean=(v,max=48)=>typeof v==='string'&&v.length<=max&&SAFE.test(v);
export async function pareAnalytics(request,env,url){
 const db=env.DB;
 if(request.method==='POST'){
  if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1')return json({ok:true,skipped:true});
  const data=await input(request,700);
  if(Object.keys(data).some(k=>!['visitor','session','game','screen','event'].includes(k))||
    !validKey(data.visitor)||!validKey(data.session)||!clean(data.game,40)||!clean(data.screen)||!EVENTS.has(data.event))fail(400,'入力を確認してください。');
  await limit(db,request,'pare-analytics',240,3600000);
  const now=Date.now(),day=japanDay(now),visitor=await hash(day+':pare:visitor:'+data.visitor),session=await hash(day+':pare:session:'+data.session);
  const statements=[db.prepare('INSERT INTO pare_analytics_daily(day,game,screen,event,count) VALUES(?,?,?,?,1) ON CONFLICT(day,game,screen,event) DO UPDATE SET count=count+1').bind(day,data.game,data.screen,data.event)];
  if(['page_view','game_access','game_start'].includes(data.event)){
   const kind=data.event==='game_start'?'player':'visitor';
   statements.push(db.prepare('INSERT OR IGNORE INTO pare_analytics_unique(day,game,kind,visitor,created) VALUES(?,?,?,?,?)').bind(day,data.game,kind,visitor,now));
   if(data.event==='game_start')statements.push(db.prepare('INSERT OR IGNORE INTO pare_analytics_unique(day,game,kind,visitor,created) VALUES(?,?,?,?,?)').bind(day,'pareasobi','player',visitor,now));
  }
  if(['page_view','game_access','game_start'].includes(data.event)){
   statements.push(db.prepare('INSERT OR IGNORE INTO pare_analytics_sessions(day,game,session,created) VALUES(?,?,?,?)').bind(day,data.game,session,now));
  }
  await db.batch(statements);
  return json({ok:true});
 }
 if(request.method==='GET'){
  if(!await owner(request,env))fail(403,'管理用キーを入力してください。');
  const requested=Number(url.searchParams.get('days')||30),days=Number.isInteger(requested)?Math.max(1,Math.min(90,requested)):30;
  const now=Date.now(),today=japanDay(now),firstDay=japanDay(now-(days-1)*86400000);
  const [daily,unique,sessions]=await Promise.all([
   db.prepare('SELECT day,game,screen,event,count FROM pare_analytics_daily WHERE day>=? ORDER BY day,game,screen,event').bind(firstDay).all(),
   db.prepare('SELECT day,game,kind,COUNT(*) AS count FROM pare_analytics_unique WHERE day>=? GROUP BY day,game,kind ORDER BY day,game,kind').bind(firstDay).all(),
   db.prepare('SELECT game,COUNT(*) AS count FROM pare_analytics_sessions WHERE day>=? GROUP BY game').bind(firstDay).all()
  ]);
  const games=new Map(),history=new Map(),screens=new Map();
  const gameFor=id=>{if(!games.has(id))games.set(id,{id,pageViews:0,accesses:0,players:0,completions:0,screenViews:0,adImpressions:0,adClicks:0});return games.get(id)};
  const add=(o,event,n)=>{if(event==='page_view')o.pageViews+=n;else if(event==='game_access')o.accesses+=n;else if(event==='game_start')o.players+=n;else if(event==='game_complete')o.completions+=n;else if(event==='screen_view')o.screenViews+=n;else if(event==='ad_impression')o.adImpressions+=n;else if(event==='ad_click')o.adClicks+=n};
  for(const row of daily.results||[]){
   const n=Number(row.count)||0,g=gameFor(row.game);add(g,row.event,n);
   const h=history.get(row.day)||{day:row.day,pageViews:0,accesses:0,starts:0,players:0,adImpressions:0};if(row.event==='game_start')h.starts+=n;else add(h,row.event,n);history.set(row.day,h);
   const key=row.game+':'+row.screen,sc=screens.get(key)||{game:row.game,screen:row.screen,pageViews:0,accesses:0,starts:0,completions:0,views:0,adImpressions:0,adClicks:0};
   if(row.event==='page_view')sc.pageViews+=n;else if(row.event==='game_access')sc.accesses+=n;else if(row.event==='game_start')sc.starts+=n;else if(row.event==='game_complete')sc.completions+=n;else if(row.event==='screen_view')sc.views+=n;else if(row.event==='ad_impression')sc.adImpressions+=n;else if(row.event==='ad_click')sc.adClicks+=n;
   screens.set(key,sc);
  }
  const uniqueByDay=new Map(),uniqueTotals=new Map();
  for(const row of unique.results||[]){
   const n=Number(row.count)||0,key=row.day+':'+row.game,all=uniqueByDay.get(key)||{day:row.day,game:row.game,visitors:0,players:0};
   if(row.kind==='player')all.players=n;else all.visitors=n;uniqueByDay.set(key,all);
   const h=history.get(row.day)||{day:row.day,pageViews:0,accesses:0,starts:0,players:0,visitors:0,adImpressions:0};
   if(row.game==='pareasobi'){if(row.kind==='player')h.players=n;else h.visitors=n;history.set(row.day,h);continue;}
   const g=uniqueTotals.get(row.game)||{visitors:0,players:0};if(row.kind==='player')g.players+=n;else g.visitors+=n;uniqueTotals.set(row.game,g);
   history.set(row.day,h);
  }
  for(const [id,g]of games){const u=uniqueTotals.get(id)||{};g.uniqueVisitors=u.visitors||0;g.uniquePlayers=u.players||0;g.sessions=0;}
  for(const row of sessions.results||[]){const g=gameFor(row.game);g.sessions=Number(row.count)||0;}
  const totals={pageViews:0,accesses:0,players:0,completions:0,screenViews:0,adImpressions:0,adClicks:0,uniqueVisitors:0,uniquePlayers:0,sessions:0};
  for(const g of games.values())for(const k of Object.keys(totals))totals[k]+=g[k]||0;
  // Site-wide unique people are deduplicated under one shared scope, not summed across games.
  const siteUnique=await db.prepare("SELECT COUNT(*) AS count FROM pare_analytics_unique WHERE day>=? AND game='pareasobi' AND kind='visitor'").bind(firstDay).first();
  totals.uniqueVisitors=Number(siteUnique?.count)||0;
  const sitePlayers=await db.prepare("SELECT COUNT(*) AS count FROM pare_analytics_unique WHERE day>=? AND game='pareasobi' AND kind='player'").bind(firstDay).first();
  totals.uniquePlayers=Number(sitePlayers?.count)||0;
  totals.sessions=[...(sessions.results||[])].reduce((sum,row)=>sum+(Number(row.count)||0),0);
  return json({ok:true,generatedAt:now,timezone:'Asia/Tokyo',days,from:firstDay,to:today,totals,games:[...games.values()].sort((a,b)=>b.accesses-a.accesses||a.id.localeCompare(b.id)),screens:[...screens.values()].sort((a,b)=>b.adImpressions-a.adImpressions||b.views-a.views),history:[...history.values()].sort((a,b)=>a.day.localeCompare(b.day)),uniqueByDay:[...uniqueByDay.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.game.localeCompare(b.game)),note:'利用者数は同じ日のブラウザー単位の推定値です。実人数ではありません。DNT/GPCを有効にした訪問は記録しません。広告表示は広告配信側の実表示コールバックを受けた場合のみ記録します。'});
 }
 fail(405,'この操作は利用できません。');
}
