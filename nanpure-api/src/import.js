import{owner,input,fail,json}from'./http.js';
import{validateStock}from'./shared/stock-puzzle.js';
const columns={attempts:['id','player','day','level','started','finished','solved','elapsed','name','abandoned','excluded','review_note'],inquiries:['id','category','topic','detail','region','method','result','locale','sender','created','status','response','updated','access_hash','request_id','context','image_source'],daily_assignments:['slot','day','level','fingerprint','payload','created']};
// Owner-only additive transfer. No caller SQL or identifiers are executed.
export async function importLegacy(request,env){if(!await owner(request,env))fail(403,'操作できません。');const b=await input(request,200000);if(!Object.hasOwn(columns,b.table)||!Array.isArray(b.rows)||b.rows.length>25)fail(400,'移行データを確認してください。');const names=columns[b.table],queries=[];
 for(const row of b.rows){if(!row||typeof row!=='object'||names.some(n=>row[n]!==null&&row[n]!==undefined&&!['string','number'].includes(typeof row[n])))fail(400,'移行データを確認してください。');if(b.table==='daily_assignments')validateStock(JSON.parse(row.payload));queries.push(env.DB.prepare('INSERT INTO '+b.table+'('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+') ON CONFLICT DO NOTHING').bind(...names.map(n=>row[n]??null)))}
 const results=queries.length?await env.DB.batch(queries):[];return json({ok:true,inserted:results.reduce((n,r)=>n+(r.meta?.changes||0),0)});
}
