import{input,json,fail,identity,owner,hash,newKey,validKey,camel,limit}from'./http.js';
import{validateContact}from'./shared/contact.js';
import{parseContactImage}from'./shared/contact-image.js';
import{validId,contactStatus}from'./shared/contact-access.js';
const fields='id,category,topic,detail,region,method,result,locale,created,status,response,updated,context,image_source';
async function allowed(request,row,env){if(!row)return false;const sender=await identity(request,'x-nanpure-key',false),key=request.headers.get('x-contact-key');return row.sender===sender||validKey(key)&&await hash(key)===row.access_hash||await owner(request,env)}
export async function contact(request,env,url){const db=env.DB,sender=await identity(request,'x-nanpure-key',false);
 if(request.method==='GET'){
  const id=url.searchParams.get('id');if(id){if(!validId(id))fail(400,'受付番号を確認してください。');const row=await db.prepare('SELECT * FROM inquiries WHERE id=?').bind(id).first();if(!await allowed(request,row,env))fail(404,'確認リンクを開くか、送信したブラウザでお試しください。');const {sender:_,access_hash:__,request_id:___,...safe}=row;return json({items:[camel(safe)]})}
  if(!sender)return json({items:[]});const select=url.searchParams.get('summary')==='1'?'id,response,updated':fields;const rows=await db.prepare('SELECT '+select+' FROM inquiries WHERE sender=? ORDER BY created DESC LIMIT 50').bind(sender).all();return json({items:rows.results.map(camel)});
 }
 if(!sender)fail(401,'送信画面を開き直してください。');const data=await input(request,820000),value=validateContact(data);
 if(!value||data.website)fail(400,'種類を選び、詳しい内容を1〜1000文字で入力してください。');const requestId=data.requestId||crypto.randomUUID();if(!validId(requestId))fail(400,'送信画面を開き直してください。');
 const existing=await db.prepare('SELECT id FROM inquiries WHERE sender=? AND request_id=?').bind(sender,requestId).first();if(existing)return json({ok:true,id:existing.id});
 const image=data.image?parseContactImage(data.image):null;if(data.image&&!image)fail(400,'PNG・JPEGの小さい画像を添付し直してください。');
 await limit(db,request,'contact',8,86400000);
 const recent=await db.prepare('SELECT id FROM inquiries WHERE sender=? AND created>? LIMIT 1').bind(sender,Date.now()-60000).first();if(recent)fail(429,'続けて送信する場合は1分ほどお待ちください。');
 const id=crypto.randomUUID(),accessKey=newKey(),accessHash=await hash(accessKey);
 const context=data.context&&typeof data.context==='object'?JSON.stringify(Object.fromEntries(['screen','puzzle','browser','viewport','version'].filter(k=>typeof data.context[k]==='string').map(k=>[k,data.context[k].slice(0,160)]))):null;
 const queries=[db.prepare('INSERT INTO inquiries(id,category,topic,detail,region,method,result,locale,sender,created,request_id,access_hash,context,image_source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,value.category,value.topic,value.detail,value.region,value.method,value.result,value.locale,sender,Date.now(),requestId,accessHash,context,image?.source||null)];
 if(image){const used=await db.prepare('SELECT COALESCE(SUM(length(data)),0) AS n FROM contact_images').first();if(used.n+image.bytes.length>30*1024*1024)fail(507,'画像の保存容量がいっぱいです。画像なしで送信してください。');queries.push(db.prepare('INSERT INTO contact_images(id,mime,data) VALUES(?,?,?)').bind(id,image.mime,image.bytes.buffer))}
 await db.batch(queries);return json({ok:true,id,accessKey});
}
export async function contactImage(request,env,url){const id=url.searchParams.get('id');if(!validId(id))fail(404,'画像がありません。');const row=await env.DB.prepare('SELECT sender,access_hash FROM inquiries WHERE id=?').bind(id).first();if(!await allowed(request,row,env))fail(404,'画像がありません。');const image=await env.DB.prepare('SELECT mime,data FROM contact_images WHERE id=?').bind(id).first();if(!image)fail(404,'画像がありません。');return new Response(new Uint8Array(image.data),{headers:{'Content-Type':image.mime,'Content-Security-Policy':"default-src 'none'; sandbox"}})}
export async function admin(request,env){if(!await owner(request,env))fail(403,'管理用キーを入力してください。');const db=env.DB;
 if(request.method==='GET'){const [items,records]=await Promise.all([db.prepare('SELECT '+fields+' FROM inquiries ORDER BY created DESC LIMIT 100').all(),db.prepare('SELECT id,day,level,started,finished,solved,elapsed,name,abandoned,excluded,review_note FROM attempts WHERE finished IS NOT NULL ORDER BY day DESC,elapsed LIMIT 100').all()]);return json({items:items.results.map(camel),records:records.results.map(camel)})}
 const b=await input(request,18000);if(!validId(b.id))fail(400,'受付番号を確認してください。');let row;
 if(b.type==='record'){if(typeof b.excluded!=='boolean'||typeof b.reason!=='string'||b.reason.length>500||b.excluded&&!b.reason.trim())fail(400,'理由を入力してください。');row=await db.prepare('UPDATE attempts SET excluded=?,review_note=? WHERE id=? RETURNING id').bind(b.excluded?Date.now():null,b.reason.trim(),b.id).first()}
 else{if(!Object.hasOwn(contactStatus,b.status)||typeof b.response!=='string'||b.response.length>3000||b.status==='answered'&&!b.response.trim())fail(400,'状態と返答を確認してください。');row=await db.prepare('UPDATE inquiries SET status=?,response=?,updated=? WHERE id=? RETURNING id').bind(b.status,b.response.trim(),Date.now(),b.id).first()}
 return json({ok:!!row});
}
