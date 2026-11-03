import {input,json,fail,owner,identity,limit,newKey,validKey} from './http.js';

export const generationTTL=45000;
export async function cleanGeneration(db,now=Date.now()) {
  await db.batch([
    db.prepare('DELETE FROM generation_requests WHERE expires<?').bind(now),
    db.prepare('DELETE FROM generation_relays WHERE expires<?').bind(now)
  ]);
}
export function candidate(value,level) {
  if(!value||value.kind!=='normal'||value.n!==9||value.level!==level||value.rating?.level!==level||
    !Array.isArray(value.puzzle)||value.puzzle.length!==81||!value.puzzle.every(d=>Number.isInteger(d)&&d>=0&&d<=9)||
    !Array.isArray(value.solution)||value.solution.length!==81||!value.solution.every(d=>Number.isInteger(d)&&d>=1&&d<=9))fail(400,'生成結果を確認できません。');
  return value;
}
export async function generation(request,env,url) {
  const db=env.DB,now=Date.now();
  if(url.pathname==='/api/generation/relay') {
    if(!await owner(request,env))fail(403,'管理用キーを確認してください。');
    if(request.method!=='POST')fail(405,'POSTで送信してください。');
    const data=await input(request,12000);
    if(!validKey(data.session))fail(400,'接続をやり直してください。');
    if(data.action==='stop') {
      await db.batch([
        db.prepare('DELETE FROM generation_relays WHERE session=?').bind(data.session),
        db.prepare("UPDATE generation_requests SET relay_session=NULL,lease=NULL,lease_until=NULL WHERE state='pending' AND relay_session=?").bind(data.session)
      ]);return json({ok:true});
    }
    if(data.action==='result') {
      if(!validKey(data.id)||!validKey(data.lease))fail(400,'依頼を確認してください。');
      const row=await db.prepare("SELECT level FROM generation_requests WHERE id=? AND state='pending' AND relay_session=? AND lease=? AND lease_until>? AND expires>?").bind(data.id,data.session,data.lease,now,now).first();
      if(!row)fail(409,'この依頼は終了しました。');
      const p=candidate(data.p,row.level);
      const saved=await db.prepare("UPDATE generation_requests SET state='done',result=?,expires=? WHERE id=? AND state='pending' AND relay_session=? AND lease=? AND lease_until>? AND expires>? RETURNING id").bind(JSON.stringify(p),now+90000,data.id,data.session,data.lease,now,now).first();
      if(!saved)fail(409,'この依頼は終了しました。');
      return json({ok:true});
    }
    if(data.action!=='poll'||!Number.isInteger(data.capacity)||data.capacity<0||data.capacity>8)fail(400,'接続設定を確認してください。');
    await cleanGeneration(db,now);
    const joined=await db.prepare("INSERT INTO generation_relays(id,session,capacity,expires) VALUES('primary',?,?,?) ON CONFLICT(id) DO UPDATE SET session=excluded.session,capacity=excluded.capacity,expires=excluded.expires WHERE generation_relays.session=excluded.session OR generation_relays.expires<? RETURNING id").bind(data.session,data.capacity,now+12000,now).first();
    if(!joined)fail(409,'別の作業室が接続中です。先にそちらの接続を止めてください。');
    let job=await db.prepare("UPDATE generation_requests SET lease_until=? WHERE state='pending' AND relay_session=? AND lease_until>? AND expires>? RETURNING id,level,lease,expires").bind(now+10000,data.session,now,now).first();
    if(!job&&data.capacity>0)job=await db.prepare("UPDATE generation_requests SET relay_session=?,lease=?,lease_until=? WHERE id=(SELECT id FROM generation_requests WHERE state='pending' AND expires>? AND (relay_session IS NULL OR lease_until<=?) ORDER BY created LIMIT 1) AND state='pending' RETURNING id,level,lease,expires").bind(data.session,newKey(),now+10000,now,now).first();
    return json({ok:true,job:job||null});
  }
  const client=await identity(request),id=url.searchParams.get('id');
  if(request.method==='GET') {
    if(!validKey(id))fail(400,'依頼を確認してください。');
    await limit(db,request,'generation-poll',180,60000);
    const row=await db.prepare('SELECT state,result FROM generation_requests WHERE id=? AND client=? AND expires>?').bind(id,client,now).first();
    if(!row)fail(404,'この依頼は終了しました。');
    return json(row.state==='done'?{state:'done',p:JSON.parse(row.result)}:{state:row.state});
  }
  if(request.method!=='POST')fail(405,'この操作は利用できません。');
  const data=await input(request,1000);
  if(data.action==='cancel') {
    if(!validKey(data.id))fail(400,'依頼を確認してください。');
    await db.prepare("UPDATE generation_requests SET state='cancelled',result=NULL,expires=? WHERE id=? AND client=? AND state='pending'").bind(now+1000,data.id,client).run();
    return json({ok:true});
  }
  if(data.action!=='create'||data.kind!=='normal'||data.n!==9||!Number.isInteger(data.level)||data.level<4||data.level>18||Object.keys(data).some(k=>!['action','kind','n','level'].includes(k)))fail(400,'この条件は端末で生成してください。');
  const ready=await db.prepare("SELECT id FROM generation_relays WHERE id='primary' AND capacity>0 AND expires>?").bind(now).first();
  if(!ready)return json({available:false});
  await limit(db,request,'generation-create',60,600000);
  await cleanGeneration(db,now);
  const jobId=newKey();
  const row=await db.prepare("INSERT OR IGNORE INTO generation_requests(id,client,level,created,expires) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM generation_requests WHERE state='pending')<20 RETURNING id,expires").bind(jobId,client,data.level,now,now+generationTTL).first();
  return json(row?{available:true,...row}:{available:false});
}
