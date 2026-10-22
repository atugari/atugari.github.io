import{input,json,fail,identity,limit}from'./http.js';
import{japanDay,dailySummary}from'./shared/daily-plan.js';
import{dailyScore,scoring,scorePeriod,fallbackSizeSql,scoreSql}from'./shared/ranking.js';
const recordDay=d=>d+':cloudflare-v1';
const publicPuzzle=p=>{const {solution,...safe}=p;return safe};
async function puzzle(db,day,level){const r=await db.prepare('SELECT payload FROM daily_assignments WHERE slot=?').bind(day+':'+level).first();if(!r)fail(503,'問題を準備しています。少し待って再試行してください。');return JSON.parse(r.payload)}
export async function daily(request,db){
 const today=japanDay(),player=await identity(request,'x-nanpure-key',request.method!=='GET');
 if(request.method==='GET'){
  const rows=await db.prepare('SELECT level FROM daily_assignments WHERE day=? ORDER BY level').bind(today).all();
  const records=player?(await db.prepare('SELECT level,started,finished,solved,abandoned FROM attempts WHERE player=? AND day=?').bind(player,recordDay(today)).all()).results:[];
  return json({day:today,serverNow:Date.now(),records,challenges:rows.results.map(r=>dailySummary(today,r.level))});
 }
 await limit(db,request,'daily',240,60000);
 const b=await input(request),level=Number(b.level);if(![1,2,3].includes(level))fail(400,'難易度を選んでください。');
 if(b.day!==undefined&&b.day!==today){
  if(b.action!=='start'||b.mode!=='practice'||typeof b.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.day)||!Number.isFinite(Date.parse(b.day))||new Date(b.day).toISOString().slice(0,10)!==b.day||b.day>=today)fail(400,'過去の問題は練習として開いてください。');
  const p=await puzzle(db,b.day,level),now=Date.now();return json({...p,id:'archive-'+b.day+'-'+level,started:now,serverNow:now,finished:false,solved:false,elapsed:0,ranked:false,resumed:false});
 }
 const day=recordDay(today);
 if(b.action==='start'){
  if(b.mode!==undefined&&!['auto','ranked','practice'].includes(b.mode))fail(400,'開始方法が不正です。');
  const p=await puzzle(db,today,level),now=Date.now();
  const created=await db.prepare('INSERT INTO attempts(id,player,day,level,started) VALUES(?,?,?,?,?) ON CONFLICT(player,day,level) DO NOTHING RETURNING id').bind(crypto.randomUUID(),player,day,level,now).first();
  let a=await db.prepare('SELECT * FROM attempts WHERE player=? AND day=? AND level=?').bind(player,day,level).first();
  if(b.mode==='practice'){
   await db.prepare('UPDATE attempts SET abandoned=? WHERE id=? AND finished IS NULL AND abandoned IS NULL').bind(now,a.id).run();
   return json({...p,id:'practice-'+a.id,started:now,serverNow:now,finished:false,solved:false,elapsed:0,ranked:false,resumed:false});
  }
  // Re-read after the insert: concurrent practice must never regain eligibility.
  a=await db.prepare('SELECT * FROM attempts WHERE id=?').bind(a.id).first();const ordinary=b.mode==='auto'&&!!a.abandoned;
  return json({...publicPuzzle(p),id:ordinary?'practice-'+a.id:a.id,started:ordinary?now:a.started,serverNow:now,finished:ordinary?false:!!a.finished,solved:ordinary?false:!!a.solved,elapsed:ordinary?0:a.elapsed,ranked:!a.abandoned,resumed:!created,...(a.abandoned?{solution:p.solution}:{})});
 }
 if(!['finish','abandon','check'].includes(b.action)||typeof b.id!=='string')fail(400,'もう一度問題を開いてください。');
 const a=await db.prepare('SELECT * FROM attempts WHERE id=? AND player=? AND day=? AND level=?').bind(b.id,player,day,level).first();if(!a)fail(400,'日付が変わりました。今日の問題を開いてください。');
 const p=await puzzle(db,today,level);
 if(b.action==='abandon'&&!a.finished){const changed=await db.prepare('UPDATE attempts SET abandoned=? WHERE id=? AND finished IS NULL RETURNING id').bind(Date.now(),a.id).first();if(!changed)fail(409,'この問題は記録済みです。');return json({ok:true,solution:p.solution,ranked:false})}
 if(a.abandoned)fail(409,'この挑戦は練習に切り替わっています。ランキングには送信できません。');
 if(a.finished){if(b.action==='check')return json({ok:true,correct:true,elapsed:a.elapsed,finished:true});fail(409,'この問題は記録済みです。')}
 if(!Array.isArray(b.grid)||b.grid.length!==p.solution.length||b.grid.some((v,i)=>!Number.isInteger(v)||v!==p.solution[i])){if(b.action==='check')return json({ok:true,correct:false});fail(400,'まだ正しく埋まっていないマスがあります。')}
 const now=Date.now();
 if(b.action==='check'){
  await db.prepare('UPDATE attempts SET solved=?,elapsed=? WHERE id=? AND solved IS NULL AND finished IS NULL AND abandoned IS NULL').bind(now,now-a.started,a.id).run();
  const current=await db.prepare('SELECT solved,elapsed,finished,abandoned FROM attempts WHERE id=?').bind(a.id).first();if(current.abandoned)fail(409,'この挑戦は練習に切り替わっています。');return json({ok:true,correct:true,elapsed:current.elapsed,finished:!!current.finished});
 }
 const name=typeof b.name==='string'?b.name.normalize('NFKC').trim():'';
 if(!name||[...name].length>16||/[\p{Cc}\p{Cf}]/u.test(name))fail(400,'表示名を1〜16文字で入力してください。');
 const elapsed=a.solved&&a.elapsed!==null?a.elapsed:now-a.started;if(elapsed<5000)fail(400,'記録時間を確認できません。');
 const changed=await db.prepare('UPDATE attempts SET finished=?,solved=COALESCE(solved,?),elapsed=?,name=? WHERE id=? AND finished IS NULL AND abandoned IS NULL RETURNING id').bind(now,now,elapsed,name,a.id).first();if(!changed)fail(409,'この問題は記録済みです。');return json({ok:true,elapsed,score:dailyScore(level,p.n,elapsed)});
}
export async function ranking(url,db,request){
 const mode=url.searchParams.get('mode')||'time',requestedPeriod=url.searchParams.get('period')||'today';
 if(!['time','score'].includes(mode)||!['today','week','month','all'].includes(requestedPeriod))fail(400,'ランキングの種類と期間を確認してください。');
 const level=Number(url.searchParams.get('level')||1);if(![1,2,3].includes(level))fail(400,'難易度を選んでください。');
 const player=request?await identity(request,'x-nanpure-key',false):null;
 const now=Date.now(),day=japanDay(now),period=mode==='time'?'today':requestedPeriod,{from,to}=scorePeriod(period,now),lower=from||'0000-01-01';
 // Keep the original edition boundary: book-v2 and cloudflare-v1 could use
 // different puzzles on the same date. Historical rows remain untouched.
 const eligible=`WITH eligible AS (
  SELECT a.id,a.player,a.day,a.level,a.name,a.elapsed,a.finished,
   CASE WHEN json_valid(d.payload) THEN CASE WHEN json_extract(d.payload,'$.n') IN (6,8,9,12,16) THEN CAST(json_extract(d.payload,'$.n') AS INTEGER) ELSE ${fallbackSizeSql} END ELSE ${fallbackSizeSql} END AS n
  FROM attempts a LEFT JOIN daily_assignments d ON d.slot=substr(a.day,1,10)||':'||a.level
  WHERE a.day>=? AND a.day<? AND length(a.day)=24 AND substr(a.day,11)=':cloudflare-v1'
   AND a.finished IS NOT NULL AND a.solved IS NOT NULL AND a.abandoned IS NULL AND a.excluded IS NULL
   AND a.level IN (1,2,3) AND typeof(a.elapsed)='integer' AND a.elapsed>=5000
   AND a.name IS NOT NULL AND length(trim(a.name))>0 ${mode==='time'?'AND a.level=?':''}
 ), unique_attempts AS (
  SELECT *,ROW_NUMBER() OVER(PARTITION BY player,day,level ORDER BY elapsed,finished,id) AS attempt_number FROM eligible
 ), points AS (
  SELECT *,${scoreSql} AS score FROM unique_attempts WHERE attempt_number=1
 )`;
 const bindings=[lower,to+'~',...(mode==='time'?[level]:[])];
 const selected=mode==='time'?`${eligible}, ranked AS (
  SELECT player,name,elapsed,score,1 AS clears,
   RANK() OVER(ORDER BY elapsed) AS rank,
   ROW_NUMBER() OVER(ORDER BY elapsed,finished,id) AS position,
   COUNT(*) OVER() AS total_players,COUNT(*) OVER() AS total_clears
  FROM points
 ) SELECT * FROM ranked WHERE position<=50 OR player=? ORDER BY position`:
 `${eligible}, totals AS (
  SELECT player,SUM(score) AS score,COUNT(*) AS clears,SUM(elapsed) AS elapsed,MAX(finished) AS last_finished FROM points GROUP BY player
 ), names AS (
  SELECT player,name,ROW_NUMBER() OVER(PARTITION BY player ORDER BY finished DESC,day DESC,level DESC,id DESC) AS latest FROM points
 ), ranked AS (
  SELECT totals.player,names.name,totals.elapsed,totals.score,totals.clears,
   RANK() OVER(ORDER BY totals.score DESC) AS rank,
   ROW_NUMBER() OVER(ORDER BY totals.score DESC,last_finished,totals.player) AS position,
   COUNT(*) OVER() AS total_players,SUM(totals.clears) OVER() AS total_clears
  FROM totals JOIN names ON names.player=totals.player AND names.latest=1
 ) SELECT * FROM ranked WHERE position<=50 OR player=? ORDER BY position`;
 const result=await db.prepare(selected).bind(...bindings,player).all();
 const safe=row=>({rank:row.rank,name:row.name,elapsed:row.elapsed,score:row.score,clears:row.clears,isMe:!!player&&row.player===player});
 const own=player?result.results.find(row=>row.player===player):null;
 const completed=mode==='time'?(await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE day=? AND level=? AND solved IS NOT NULL AND abandoned IS NULL AND excluded IS NULL').bind(recordDay(day),level).first()).n:(result.results[0]?.total_clears||0);
 return json({day,mode,period,from,to,timezone:'Asia/Tokyo',level,rows:result.results.filter(row=>row.position<=50).map(safe),totalPlayers:result.results[0]?.total_players||0,myRank:own?.rank??null,myEntry:own?safe(own):null,completed,scoring});
}
export async function archive(url,db){const today=japanDay(),month=url.searchParams.get('month')||today.slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7))fail(400,'月を確認してください。');const rows=await db.prepare('SELECT day,level,json_extract(payload,\'$.kind\') AS kind,json_extract(payload,\'$.n\') AS n FROM daily_assignments WHERE day>=? AND day<? AND day<=? ORDER BY day,level').bind(month+'-01',month+'-32',today).all();return json({today,days:rows.results})}
