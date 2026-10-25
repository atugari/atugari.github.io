import{input,body,json,fail,identity,validKey}from'./http.js';
import{japanDay}from'./shared/daily-plan.js';
const maxBytes=5*1024*1024,chunkBytes=128*1024,capacity=200*1024*1024,dailySaves=3;
const savedFields='revision,created,bytes,puzzles,chunks,digest';
const limits={maxBytes,dailySaves,timezone:'Asia/Tokyo'};
function windowFor(owner,now){const day=japanDay(now),start=Date.parse(day+'T00:00:00+09:00');return{day,start,resetAt:start+86400000,key:'cloud-save-v2:'+owner+':'+day};}
async function quota(db,owner,now=Date.now()){
 const w=windowFor(owner,now),row=await db.prepare('SELECT COALESCE((SELECT count FROM rate_limits WHERE key=?),0) AS used,(SELECT COUNT(*) FROM cloud_uploads WHERE owner=? AND created>=? AND created<? AND expires>?) AS reserved').bind(w.key,owner,w.start,w.resetAt,now).first();
 return{day:w.day,used:row.used,reserved:row.reserved,remaining:Math.max(0,dailySaves-row.used-row.reserved),resetAt:w.resetAt,serverNow:now};
}
export async function cloud(request,db,url){
 const owner=await identity(request,'x-cloud-key');const action=url.searchParams.get('action'),revision=url.searchParams.get('revision');
 if(request.method==='GET'){
  const save=await db.prepare('SELECT '+savedFields+' FROM cloud_saves WHERE owner=?').bind(owner).first();
  if(action==='chunk'){
   const position=Number(url.searchParams.get('position'));if(!save||revision!==save.revision||!Number.isInteger(position)||position<0||position>=save.chunks)fail(404,'保存データがありません。');
   const row=await db.prepare('SELECT data FROM cloud_chunks WHERE owner=? AND revision=? AND position=?').bind(owner,revision,position).first();if(!row)fail(404,'保存データがありません。');return new Response(new Uint8Array(row.data),{headers:{'Content-Type':'application/octet-stream'}});
  }
  return json({signedIn:true,save,limits,quota:await quota(db,owner)});
 }
 if(action==='chunk'){
  const position=Number(url.searchParams.get('position'));const upload=await db.prepare('SELECT * FROM cloud_uploads WHERE revision=? AND owner=? AND expires>?').bind(revision,owner,Date.now()).first();
  if(!upload||!Number.isInteger(position)||position<0||position>=upload.chunks)fail(409,'保存を最初からやり直してください。');
  const bytes=await body(request,chunkBytes);const expected=position===upload.chunks-1?upload.bytes-position*chunkBytes:chunkBytes;if(bytes.byteLength!==expected)fail(400,'保存データの大きさが合いません。');
  const result=await db.prepare('INSERT INTO cloud_chunks(owner,revision,position,data) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM cloud_uploads WHERE revision=? AND owner=? AND expires>?) ON CONFLICT(revision,position) DO UPDATE SET data=excluded.data RETURNING position').bind(owner,revision,position,bytes.buffer,revision,owner,Date.now()).first();if(!result)fail(409,'保存を最初からやり直してください。');return json({ok:true});
 }
 const b=await input(request,2000);
 if(b.action==='begin'){
  if(Number.isInteger(b.bytes)&&b.bytes>maxBytes)fail(413,'5MBを超える場合は「引き継ぎファイルを保存」を使ってください。');
  if(!Number.isInteger(b.bytes)||b.bytes<1||b.chunks!==Math.ceil(b.bytes/chunkBytes)||!Number.isInteger(b.puzzles)||b.puzzles<0||b.puzzles>100000||!validKey(b.digest)||!(b.expected===null||typeof b.expected==='string'&&/^[a-f0-9-]{36}$/.test(b.expected)))fail(400,'保存データを確認してください。');
  const previous=await db.prepare('SELECT revision FROM cloud_saves WHERE owner=?').bind(owner).first();if((previous?.revision||null)!==b.expected)fail(409,'別の端末で更新されています。最新の状態に更新してください。');
  const now=Date.now(),id=crypto.randomUUID(),w=windowFor(owner,now);
  // Reserve capacity and a daily slot in the same statement. A shared IP does
  // not merge separate save IDs; two devices using one code share the quota.
  const added=await db.prepare('INSERT INTO cloud_uploads(revision,owner,expected,created,expires,bytes,chunks,puzzles,digest) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(bytes),0) FROM cloud_saves)+(SELECT COALESCE(SUM(bytes),0) FROM cloud_uploads)+?<=? AND (SELECT COUNT(*) FROM cloud_uploads WHERE owner=? AND expires>?)<2 AND COALESCE((SELECT count FROM rate_limits WHERE key=?),0)+(SELECT COUNT(*) FROM cloud_uploads WHERE owner=? AND created>=? AND created<? AND expires>?)<? RETURNING revision').bind(id,owner,b.expected,now,now+3600000,b.bytes,b.chunks,b.puzzles,b.digest,b.bytes,capacity,owner,now,w.key,owner,w.start,w.resetAt,now,dailySaves).first();
  if(!added){const q=await quota(db,owner,now);if(q.remaining===0)fail(429,'今日のクラウド保存は上限に達しました。日本時間の0時に回数が戻ります。');const active=await db.prepare('SELECT COUNT(*) AS n FROM cloud_uploads WHERE owner=? AND expires>?').bind(owner,now).first();if(active.n>=2)fail(409,'別の保存処理が進行中です。少し待って再試行してください。');fail(507,'現在クラウドに保存できません。引き継ぎファイルを保存し、後でもう一度お試しください。');}
  return json({ok:true,revision:id,chunkBytes,limits,quota:await quota(db,owner,now)});
 }
 if(b.action==='commit'){
  const upload=await db.prepare('SELECT * FROM cloud_uploads WHERE revision=? AND owner=? AND expires>?').bind(b.revision,owner,Date.now()).first();
  if(!upload){const save=await db.prepare('SELECT '+savedFields+' FROM cloud_saves WHERE owner=? AND revision=?').bind(owner,b.revision).first();if(save)return json({ok:true,save,limits,quota:await quota(db,owner)});fail(409,'保存を最初からやり直してください。')}
  const size=await db.prepare('SELECT COUNT(*) AS chunks,COALESCE(SUM(length(data)),0) AS bytes FROM cloud_chunks WHERE revision=? AND owner=?').bind(b.revision,owner).first();if(size.chunks!==upload.chunks||size.bytes!==upload.bytes)fail(409,'保存が途中です。もう一度保存してください。');
  const previous=upload.expected,w=windowFor(owner,upload.created);
  const result=await db.batch([
   db.prepare('INSERT INTO cloud_saves(owner,revision,object_key,created,bytes,puzzles,chunks,digest) SELECT ?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM cloud_saves WHERE owner=? AND revision=?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,object_key=excluded.object_key,created=excluded.created,bytes=excluded.bytes,puzzles=excluded.puzzles,chunks=excluded.chunks,digest=excluded.digest WHERE cloud_saves.revision=? RETURNING '+savedFields).bind(owner,b.revision,b.revision,Date.now(),upload.bytes,upload.chunks===0?0:upload.puzzles,upload.chunks,upload.digest,previous,owner,previous,previous),
   db.prepare('INSERT INTO rate_limits(key,count,expires) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM cloud_uploads WHERE owner=? AND revision=?) AND EXISTS(SELECT 1 FROM cloud_saves WHERE owner=? AND revision=?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(w.key,w.resetAt+2*86400000,owner,b.revision,owner,b.revision),
   db.prepare('DELETE FROM cloud_uploads WHERE revision=? AND EXISTS(SELECT 1 FROM cloud_saves WHERE owner=? AND revision=?)').bind(b.revision,owner,b.revision),
   db.prepare('DELETE FROM cloud_chunks WHERE owner=? AND revision=? AND EXISTS(SELECT 1 FROM cloud_saves WHERE owner=? AND revision=?)').bind(owner,previous,owner,b.revision)
  ]);
  if(!result[0].results.length)fail(409,'別の端末で更新されています。最新の状態に更新してください。');return json({ok:true,save:result[0].results[0],limits,quota:await quota(db,owner)});
 }
 if(b.action==='cancel'&&typeof b.revision==='string'){
  await db.batch([db.prepare('DELETE FROM cloud_chunks WHERE owner=? AND revision=? AND EXISTS(SELECT 1 FROM cloud_uploads WHERE revision=? AND owner=?)').bind(owner,b.revision,b.revision,owner),db.prepare('DELETE FROM cloud_uploads WHERE owner=? AND revision=?').bind(owner,b.revision)]);return json({ok:true});
 }
 fail(400,'操作を確認してください。');
}
