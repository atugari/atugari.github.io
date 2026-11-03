import {fail,json,input,identity,limit,hash} from './http.js';
import {cleanSlot} from '../../nanpure/gallery/model.mjs';
import {events,phase,reactions,cleanText,cleanReplay,MAX_REPLAY_BYTES,puzzleKey} from '../../nanpure/exhibitions/model.mjs';
const visible='e.active=1 AND g.published=1';
const idOK=id=>/^[a-f0-9]{24}$/.test(id||'');
const eventFor=id=>{const event=events.find(e=>e.id===id);if(!event)fail(404,'この企画展は見つかりません。');return event};
const roomName=r=>{try{return JSON.parse(r).name}catch{return 'ナンプレイヤー'}};
async function entry(db,id){if(!idOK(id))fail(404,'作品が見つかりません。');const row=await db.prepare(`SELECT e.*,g.content AS room_content FROM exhibition_entries e JOIN galleries g ON g.id=e.room_id WHERE e.id=? AND ${visible}`).bind(id).first();if(!row)fail(404,'この作品は出展を取り下げたか、展示室が非公開になっています。');return row;}
const publicEntry=r=>({id:r.id,event:r.event,roomId:r.room_id,author:roomName(r.room_content),slot:JSON.parse(r.content),revision:r.revision,created:r.created});
async function counters(db,id,who){const rows=await db.prepare('SELECT kind,COUNT(*) AS count,MAX(CASE WHEN owner=? THEN 1 ELSE 0 END) AS mine FROM exhibition_reactions WHERE entry_id=? GROUP BY kind').bind(who||'',id).all();return Object.fromEntries(reactions.map(kind=>{const r=rows.results.find(r=>r.kind===kind);return [kind,{count:r?.count||0,mine:!!r?.mine}]}));}
export async function exhibitions(request,db,url){
 const who=await identity(request,'x-gallery-key',request.method==='POST');
 if(request.method==='GET'){
  const replay=url.searchParams.get('replay');if(replay){if(!idOK(replay))fail(404,'リプレイが見つかりません。');const r=await db.prepare('SELECT * FROM gallery_replays WHERE id=? AND active=1').bind(replay).first();if(!r)fail(404,'リプレイは非公開か、見つかりません。');if(r.entry_id)await entry(db,r.entry_id);return json({replay:{id:r.id,title:r.title,name:r.name,revision:r.revision,recording:JSON.parse(r.content),mine:r.owner===who}});}
  if(url.searchParams.get('mine')==='replays'){if(!who)fail(401,'この画面を開き直してください。');const rows=await db.prepare('SELECT id,title,name,revision,created,entry_id,fingerprint FROM gallery_replays WHERE owner=? AND active=1 ORDER BY created DESC LIMIT 50').bind(who).all();return json({replays:rows.results});}
  if(url.searchParams.get('mine')==='entries'){if(!who)fail(401,'この画面を開き直してください。');const rows=await db.prepare('SELECT id,event,slot,active,revision FROM exhibition_entries WHERE owner=? ORDER BY created DESC LIMIT 100').bind(who).all();return json({entries:rows.results});}
  if(url.searchParams.has('room')){const room=url.searchParams.get('room');if(!idOK(room))fail(404,'展示室が見つかりません。');const rows=await db.prepare(`SELECT e.id,e.event,e.slot,e.content FROM exhibition_entries e JOIN galleries g ON g.id=e.room_id WHERE e.room_id=? AND ${visible} ORDER BY e.created DESC LIMIT 100`).bind(room).all();return json({entries:rows.results.map(r=>({id:r.id,event:r.event,slot:r.slot,record:JSON.parse(r.content).record}))});}
  const id=url.searchParams.get('entry');if(id){const r=await entry(db,id);const rows=await db.prepare('SELECT id,title,name,created FROM gallery_replays WHERE entry_id=? AND active=1 ORDER BY created DESC LIMIT 30').bind(id).all();return json({entry:publicEntry(r),mine:r.owner===who,reactions:await counters(db,id,who),replays:rows.results});}
  const requested=url.searchParams.get('event'),event=eventFor(requested||events[0].id),page=Number(url.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'ページを確認してください。');
  const totals=await db.prepare(`SELECT COUNT(*) AS n FROM exhibition_entries e JOIN galleries g ON g.id=e.room_id WHERE e.event=? AND ${visible}`).bind(event.id).first();
  const rows=await db.prepare(`SELECT e.id,e.event,e.room_id,e.content,e.revision,e.created,g.content AS room_content FROM exhibition_entries e JOIN galleries g ON g.id=e.room_id WHERE e.event=? AND ${visible} ORDER BY e.created,e.id LIMIT 12 OFFSET ?`).bind(event.id,(page-1)*12).all();
  return json({events:events.map(e=>({...e,phase:phase(e)})),event:{...event,phase:phase(event)},entries:rows.results.map(publicEntry),page,total:totals.n,totalPages:Math.max(1,Math.ceil(totals.n/12))});
 }
 const data=await input(request,MAX_REPLAY_BYTES+20000);await limit(db,request,'exhibitions-write',80,300000);
 if(data.action==='submit'){
  const event=eventFor(data.event);if(phase(event)!=='open')fail(409,'この企画展は現在、出展を受け付けていません。');
  if(!Number.isSafeInteger(data.slot)||data.slot<0||data.slot>6||data.confirm!==true)fail(400,'出展する作品と公開内容を確認してください。');
  const room=await db.prepare('SELECT * FROM galleries WHERE owner=? AND published=1').bind(who).first();if(!room)fail(409,'先に自分の展示室を保存して、URLで公開してください。');
  let slot;try{slot=cleanSlot(JSON.parse(room.content).slots[data.slot]);if(!slot?.record)throw Error('問題の作品を選んでください。')}catch(e){fail(400,e.message)}
  const old=await db.prepare('SELECT id,revision,active FROM exhibition_entries WHERE event=? AND owner=? AND slot=?').bind(event.id,who,data.slot).first();
  if((old?.revision||0)!==data.expected)fail(409,'出展内容が更新されています。読み込み直して確認してください。');
  const count=await db.prepare('SELECT COUNT(*) n FROM exhibition_entries WHERE event=? AND owner=? AND active=1').bind(event.id,who).first();if(!old?.active&&count.n>=3)fail(409,'一つの企画展に出展できるのは3作品までです。');
  const fingerprint=await hash(puzzleKey(slot.record)),duplicate=await db.prepare('SELECT id FROM exhibition_entries WHERE event=? AND owner=? AND fingerprint=? AND id<>?').bind(event.id,who,fingerprint,old?.id||'').first();if(duplicate)fail(409,'この問題はすでに出展しています。');
  const capacity=await db.prepare('SELECT 1').all(),used=capacity.meta?.size_after??capacity.meta?.database_size;if(Number.isFinite(used)&&used>=400*1024*1024)fail(507,'保存容量が少なくなっています。出展はまだ反映されていません。');
  const id=old?.id||(await hash(crypto.randomUUID()+who)).slice(0,24),now=Date.now(),content=JSON.stringify(slot);
  const r=old?await db.prepare('UPDATE exhibition_entries SET content=?,fingerprint=?,active=1,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=? AND (active=1 OR (SELECT COUNT(*) FROM exhibition_entries WHERE event=? AND owner=? AND active=1)<3) RETURNING revision').bind(content,fingerprint,now,id,who,data.expected,event.id,who).first():await db.prepare('INSERT INTO exhibition_entries(id,event,owner,room_id,slot,content,fingerprint,created,updated) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM exhibition_entries WHERE event=? AND owner=? AND active=1)<3 ON CONFLICT DO NOTHING RETURNING revision').bind(id,event.id,who,room.id,data.slot,content,fingerprint,now,now,event.id,who).first();
  if(!r)fail(409,'出展内容が更新されています。読み込み直してください。');return json({id,revision:r.revision});
 }
 if(data.action==='withdraw'){
  if(!idOK(data.id))fail(400,'作品を確認してください。');const r=await db.prepare('UPDATE exhibition_entries SET active=0,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=? RETURNING id').bind(Date.now(),data.id,who,data.expected).first();if(!r)fail(409,'出展内容が更新されたか、編集権限がありません。');return json({withdrawn:true});
 }
 if(data.action==='react'){
  const r=await entry(db,data.id);if(!reactions.includes(data.kind)||typeof data.enabled!=='boolean')fail(400,'感想を確認してください。');if(r.owner===who)fail(400,'自分の作品への感想は記録しません。');
  if(data.enabled)await db.prepare('INSERT INTO exhibition_reactions(entry_id,owner,kind,created) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').bind(data.id,who,data.kind,Date.now()).run();else await db.prepare('DELETE FROM exhibition_reactions WHERE entry_id=? AND owner=? AND kind=?').bind(data.id,who,data.kind).run();return json({reactions:await counters(db,data.id,who)});
 }
 if(data.action==='publishReplay'){
  let recording,title,name;try{recording=cleanReplay(data.recording);title=cleanText(data.title,60,true);name=cleanText(data.name||'ナンプレイヤー',40,true)}catch(e){fail(400,e.message)}
  if(data.confirm!==true)fail(400,'リプレイに含まれる問題・手順・説明の公開を確認してください。');
  if(data.entry){const e=await entry(db,data.entry);if(puzzleKey(JSON.parse(e.content).record)!==puzzleKey(recording.record))fail(400,'この作品を解いたリプレイを選んでください。');}
  const count=await db.prepare('SELECT COUNT(*) n,COALESCE(SUM(bytes),0) bytes FROM gallery_replays WHERE owner=? AND active=1').bind(who).first();if(count.n>=50||count.bytes>8*1024*1024)fail(409,'公開できるリプレイの上限です。古い公開を取り下げてからお試しください。');
  const capacity=await db.prepare('SELECT 1').all(),used=capacity.meta?.size_after??capacity.meta?.database_size;if(Number.isFinite(used)&&used>=400*1024*1024)fail(507,'保存容量が少なくなっています。リプレイは端末に残ります。');
  const id=(await hash(crypto.randomUUID()+who)).slice(0,24),fingerprint=await hash(puzzleKey(recording.record)),content=JSON.stringify(recording),now=Date.now(),bytes=new TextEncoder().encode(content).length;const saved=await db.prepare('INSERT INTO gallery_replays(id,owner,entry_id,content,title,name,fingerprint,created,updated,bytes) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM gallery_replays WHERE owner=? AND active=1)<50 AND (SELECT COALESCE(SUM(bytes),0) FROM gallery_replays WHERE owner=? AND active=1)+?<=? RETURNING id').bind(id,who,data.entry||null,content,title,name,fingerprint,now,now,bytes,who,who,bytes,8*1024*1024).first();if(!saved)fail(409,'公開できるリプレイの上限です。古い公開を取り下げてからお試しください。');return json({id,revision:1});
 }
 if(data.action==='unpublishReplay'){
  if(!idOK(data.id))fail(400,'リプレイを確認してください。');const r=await db.prepare('UPDATE gallery_replays SET active=0,content=?,bytes=2,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=? RETURNING id').bind('{}',Date.now(),data.id,who,data.expected).first();if(!r)fail(409,'リプレイが更新されたか、編集権限がありません。');return json({unpublished:true});
 }
 fail(400,'操作を確認してください。');
}
