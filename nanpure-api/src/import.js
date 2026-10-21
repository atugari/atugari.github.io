import{owner,input,fail,json}from'./http.js';
import{validateStock}from'./shared/stock-puzzle.js';
const columns={attempts:['id','player','day','level','started','finished','solved','elapsed','name','abandoned','excluded','review_note'],inquiries:['id','category','topic','detail','region','method','result','locale','sender','created','status','response','updated','access_hash','request_id','context','image_source'],daily_assignments:['slot','day','level','fingerprint','payload','created']};
// Owner-only additive transfer. Identifiers and uniqueness checks are allowlisted.
const unique={attempts:['player','day','level'],inquiries:['sender','request_id'],daily_assignments:['fingerprint']};
export async function importLegacy(request,env){
 if(!await owner(request,env))fail(403,'操作できません。');
 const b=await input(request,200000);
 if(!Object.hasOwn(columns,b.table)||!Array.isArray(b.rows)||b.rows.length>25||(b.mode!==undefined&&b.mode!=='check'))fail(400,'移行データを確認してください。');
 const names=columns[b.table],pk=names[0],keys=unique[b.table],seen=new Set();
 for(const row of b.rows){
  if(!row||typeof row!=='object'||typeof row[pk]!=='string'||!row[pk]||seen.has(row[pk])||names.some(n=>row[n]!==null&&row[n]!==undefined&&!['string','number'].includes(typeof row[n])))fail(400,'移行データを確認してください。');
  seen.add(row[pk]);
  if(b.table==='daily_assignments')validateStock(JSON.parse(row.payload));
 }
 const checks=b.rows.length?await env.DB.batch(b.rows.map(row=>env.DB.prepare('SELECT '+names.join(',')+' FROM '+b.table+' WHERE '+pk+'=? OR ('+keys.map(n=>n+'=?').join(' AND ')+')').bind(row[pk],...keys.map(n=>row[n]??null)))):[];
 const summary={checked:b.rows.length,identical:0,missing:0,conflicts:0};
 for(let i=0;i<b.rows.length;i++){
  const existing=checks[i].results;
  if(!existing.length)summary.missing++;
  else if(existing.length===1&&names.every(n=>(existing[0][n]??null)===(b.rows[i][n]??null)))summary.identical++;
  else summary.conflicts++;
 }
 if(b.mode==='check')return json({ok:summary.conflicts===0,...summary});
 if(summary.conflicts)return json({ok:false,...summary,error:'既存のデータと内容が異なるため、移行を中止しました。'},409);
 const queries=b.rows.map(row=>env.DB.prepare('INSERT INTO '+b.table+'('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+') ON CONFLICT DO NOTHING').bind(...names.map(n=>row[n]??null)));
 const results=queries.length?await env.DB.batch(queries):[];
 return json({ok:true,inserted:results.reduce((n,r)=>n+(r.meta?.changes||0),0)});
}
