import {input,json,fail,owner,hash,validKey,limit} from './http.js';
import {japanDay} from './shared/daily-plan.js';
import {usageView} from './shared/provider-usage.js';
export const apiVersion='1.2.0';
const account='3fb1db1d33caddf96fec77fac7d571e6',database='7bb28b61-5fe2-47ce-b71b-b0e04fc3747b';
export async function visit(request,env) {
  if(request.method!=='POST')fail(405,'この操作は利用できません。');
  if(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1')return json({ok:true});
  const data=await input(request,400);
  if(!validKey(data.visitor)||!validKey(data.session)||Object.keys(data).some(key=>!['visitor','session'].includes(key)))fail(400,'入力を確認してください。');
  const now=Date.now(),day=japanDay(now),db=env.DB;
  const [visitor,session]=await Promise.all([hash(day+':visitor:'+data.visitor),hash(day+':session:'+data.session)]);
  if(await db.prepare('SELECT session FROM visit_sessions WHERE day=? AND session=?').bind(day,session).first())return json({ok:true});
  await limit(db,request,'visits',120,3600000);
  // batch is transactional: concurrent retransmissions of the same session add
  // one visit only. Check for it before inserting either the browser or session.
  await db.batch([
    db.prepare('INSERT INTO visit_days(day,browsers,visits,first_at,last_at) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM visit_browsers WHERE day=? AND visitor=?) THEN 0 ELSE 1 END,1,?,? WHERE NOT EXISTS(SELECT 1 FROM visit_sessions WHERE day=? AND session=?) ON CONFLICT(day) DO UPDATE SET browsers=visit_days.browsers+excluded.browsers,visits=visit_days.visits+1,last_at=excluded.last_at').bind(day,day,visitor,now,now,day,session),
    db.prepare('INSERT INTO visit_browsers(day,visitor,created) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM visit_sessions WHERE day=? AND session=?) ON CONFLICT(day,visitor) DO NOTHING').bind(day,visitor,now,day,session),
    db.prepare('INSERT INTO visit_sessions(day,session,created) VALUES(?,?,?) ON CONFLICT(day,session) DO NOTHING').bind(day,session,now)
  ]);
  return json({ok:true});
}
const safeJSON=value=>{try{return JSON.parse(value)}catch{return null}};
export async function overview(request,env) {
  if(request.method!=='GET')fail(405,'この操作は利用できません。');
  if(!await owner(request,env))fail(403,'管理用キーを入力してください。');
  const now=Date.now(),day=japanDay(now),firstDay=japanDay(now-29*86400000),db=env.DB;
  const result=await db.batch([
    db.prepare('SELECT day,browsers,visits FROM visit_days WHERE day>=? ORDER BY day').bind(firstDay),
    db.prepare('SELECT MIN(first_at) AS since FROM visit_days'),
    db.prepare('SELECT status,COUNT(*) AS n FROM inquiries GROUP BY status'),
    db.prepare('SELECT day,COUNT(*) AS count FROM daily_assignments WHERE day>=? GROUP BY day ORDER BY day LIMIT 31').bind(day),
    db.prepare('SELECT COUNT(*) AS backupCount,COALESCE(SUM(bytes),0) AS backupBytes FROM cloud_saves'),
    db.prepare('SELECT COALESCE(SUM(bytes),0) AS uploadBytes FROM cloud_uploads'),
    db.prepare('SELECT COALESCE(SUM(length(data)),0) AS contactImageBytes FROM contact_images'),
    db.prepare("SELECT value FROM daily_maintenance WHERE key='cloudflare-refill'"),
    db.prepare("SELECT payload FROM owner_usage_snapshots WHERE id='cloudflare'")
  ]);
  const history=result[0].results.map(row=>({day:row.day,browsers:row.browsers,visits:row.visits}));
  const today=history.find(row=>row.day===day)||{browsers:0,visits:0};
  const inquiries={total:0,received:0,reading:0,answered:0,closed:0,open:0};
  for(const row of result[2].results){inquiries.total+=row.n;if(Object.hasOwn(inquiries,row.status)&&row.status!=='total'&&row.status!=='open')inquiries[row.status]=row.n;}
  inquiries.open=inquiries.received+inquiries.reading;
  const days=result[3].results.map(row=>({day:row.day,count:row.count}));let readyDays=0,through=null;
  for(let offset=0;offset<31;offset++){const current=days.find(row=>row.day===japanDay(now+offset*86400000));if(current?.count!==3)break;readyDays++;through=current.day;}
  const refill=safeJSON(result[7].results[0]?.value),snapshot=safeJSON(result[8].results[0]?.payload);
  const databaseBytes=result.find(row=>typeof row.meta?.size_after==='number')?.meta.size_after??null;
  return json({ok:true,generatedAt:now,
    site:{url:'https://atugari.github.io/nanpure/',version:env.SITE_VERSION||null,apiVersion},
    traffic:{since:result[1].results[0]?.since??null,day,timezone:'Asia/Tokyo',today:{browsers:today.browsers,visits:today.visits},history,note:'計測開始後の目安です。同じ日の同じブラウザーを1件と数えます。人数ではありません。計測を拒否した端末や一部の通信は含まれません。'},
    inquiries,
    stock:{todayCount:days.find(row=>row.day===day)?.count||0,readyDays,through,lastRefillAt:Number.isSafeInteger(refill?.at)?refill.at:null,days},
    storage:{...result[4].results[0],...result[5].results[0],...result[6].results[0],backupLimitBytes:200*1024*1024},
    usage:usageView(snapshot,now,databaseBytes),
    links:{cloudflare:'https://dash.cloudflare.com/'+account,workers:'https://dash.cloudflare.com/'+account+'/workers/services/view/puzzle-api/production/metrics',d1:'https://dash.cloudflare.com/'+account+'/workers/d1/databases/'+database,manage:'https://atugari.github.io/nanpure/?view=manage',github:'https://github.com/atugari/atugari.github.io/actions'}
  });
}
