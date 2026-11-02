import {identity,input,json,fail,limit} from './http.js';
export const defaultPlayerName='ナンプレイヤー';
export function cleanNickname(value){
 if(typeof value!=='string')fail(400,'ニックネームを確認してください。');
 const name=value.normalize('NFKC').trim();
 if([...name].length>16||/[\p{Cc}\p{Cf}]/u.test(name))fail(400,'ニックネームは16文字以内で入力してください。');
 return name;
}
export async function saveNickname(db,player,value){
 const name=cleanNickname(value);
 await db.prepare('INSERT INTO ranking_profiles(player,name,updated) VALUES(?,?,?) ON CONFLICT(player) DO UPDATE SET name=excluded.name,updated=excluded.updated').bind(player,name,Date.now()).run();
 return {name,displayName:name||defaultPlayerName};
}
export async function rankingProfile(request,db){
 const player=await identity(request);
 if(request.method==='GET'){
  const row=await db.prepare('SELECT name FROM ranking_profiles WHERE player=?').bind(player).first();
  const name=row?.name||'';return json({name,displayName:name||defaultPlayerName});
 }
 const data=await input(request,4096);cleanNickname(data.name);
 await limit(db,request,'ranking-name',30,60000);
 return json(await saveNickname(db,player,data.name));
}
