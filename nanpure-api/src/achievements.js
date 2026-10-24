import{fail,json,input,identity,limit}from'./http.js';
export function validateAchievements(value){
 if(value.version!==1||!Array.isArray(value.owned)||value.owned.length>1000||value.owned.some(id=>typeof id!=='string'||!/^NP-\d{4}$/.test(id)||Number(id.slice(3))<1||Number(id.slice(3))>1000))fail(400,'称号の記録を確認してください。');
 return [...new Set(value.owned)].sort();
}
export async function achievements(request,db){
 if(request.method==='POST'){
  const who=await identity(request,'x-cloud-key');const owned=validateAchievements(await input(request,16000));await limit(db,request,'titles-sync',12,300000);const now=Date.now();
  await db.batch([
   db.prepare('INSERT INTO achievement_members(identity,catalog_version,joined_at,updated_at) VALUES(?,1,?,?) ON CONFLICT(identity) DO UPDATE SET catalog_version=1,updated_at=excluded.updated_at').bind(who,now,now),
   db.prepare("INSERT INTO achievement_owned(identity,title_id,catalog_version,received_at) SELECT ?,value,1,? FROM json_each(?) WHERE true ON CONFLICT(identity,title_id) DO NOTHING").bind(who,now,JSON.stringify(owned))
  ]);
 }
 const [member,owned]=await Promise.all([
  db.prepare('SELECT COUNT(*) AS total, MAX(updated_at) AS updated FROM achievement_members WHERE catalog_version=1').first(),
  db.prepare('SELECT title_id, COUNT(*) AS owners FROM achievement_owned WHERE catalog_version=1 AND identity IN (SELECT identity FROM achievement_members WHERE catalog_version=1) GROUP BY title_id').all()
 ]);
 const counts=Object.fromEntries(Array.from({length:1000},(_,i)=>['NP-'+String(i+1).padStart(4,'0'),0]));for(const row of owned.results)if(Object.hasOwn(counts,row.title_id))counts[row.title_id]=Math.min(member.total,row.owners);
 return json({version:1,total:member.total,counts,updatedAt:member.updated||null,cohort:'participating-save-data'});
}
