import {fail,json,input,identity,limit,hash} from './http.js';
import {cleanRoom,MAX_BYTES} from '../../nanpure/gallery/model.mjs';
const project=r=>({id:r.id,room:JSON.parse(r.content),published:!!r.published,revision:r.revision,updated:r.updated,bytes:r.bytes});
export async function gallery(request,db,url=new URL(request.url)){
 if(request.method==='GET'){
  if(url.searchParams.get('mine')==='1'){
   const who=await identity(request,'x-gallery-key');const r=await db.prepare('SELECT * FROM galleries WHERE owner=?').bind(who).first();return json({gallery:r?project(r):null});
  }
  const id=url.searchParams.get('room');if(!/^[a-f0-9]{24}$/.test(id||''))fail(404,'この展示室は見つかりません。');
  const r=await db.prepare('SELECT id,content,published,revision,updated,bytes FROM galleries WHERE id=? AND published=1').bind(id).first();
  if(!r)fail(404,'この展示室は非公開か、見つかりません。');return json({gallery:project(r)});
 }
 const who=await identity(request,'x-gallery-key');const data=await input(request,MAX_BYTES+12000);
 if(!['save','unpublish'].includes(data.action)||!Number.isSafeInteger(data.expected)||data.expected<0)fail(400,'保存する内容を確認してください。');
 await limit(db,request,'gallery-edit',60,300000);
 const old=await db.prepare('SELECT id,revision,bytes FROM galleries WHERE owner=?').bind(who).first();
 if((old?.revision||0)!==data.expected)fail(409,'別の画面で展示室が更新されました。下書きを残しているので、最新の展示室を読み込んで確認してください。');
 if(data.action==='unpublish'){
  if(!old)fail(404,'まだ展示室を保存していません。');
  const r=await db.prepare('UPDATE galleries SET published=0,revision=revision+1,updated=? WHERE owner=? AND revision=? RETURNING *').bind(Date.now(),who,data.expected).first();
  if(!r)fail(409,'展示室が更新されました。もう一度読み込んでください。');return json({gallery:project(r)});
 }
 let room;try{room=cleanRoom(data.room)}catch(e){fail(400,e.message)}
 if(typeof data.published!=='boolean')fail(400,'公開範囲を選んでください。');
 const content=JSON.stringify(room),bytes=new TextEncoder().encode(content).length;
 // D1 exposes actual size in query metadata. Leave room for the other features.
 const capacity=await db.prepare('SELECT 1').all();const used=capacity.meta?.size_after??capacity.meta?.database_size;
 if(Number.isFinite(used)&&used>=400*1024*1024&&bytes>(old?.bytes||0))fail(507,'保存容量が少なくなっています。下書きは端末に残ります。管理者による容量の対応後に再試行してください。');
 const id=old?.id||(await hash('gallery-public:'+who)).slice(0,24),now=Date.now();
 const row=old
  ?await db.prepare('UPDATE galleries SET content=?,published=?,revision=revision+1,updated=?,bytes=? WHERE owner=? AND revision=? RETURNING *').bind(content,data.published?1:0,now,bytes,who,data.expected).first()
  :await db.prepare('INSERT INTO galleries(id,owner,content,published,revision,updated,bytes) VALUES(?,?,?,?,1,?,?) ON CONFLICT(owner) DO NOTHING RETURNING *').bind(id,who,content,data.published?1:0,now,bytes).first();
 if(!row)fail(409,'展示室が更新されました。下書きを残しているので、最新の展示室を確認してください。');
 return json({gallery:project(row)});
}
