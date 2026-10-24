// Runs on GitHub Actions, never inside a Worker. Future answers stay only in D1.
import{generateStock}from'../src/shared/stock-generate.js';
import{fingerprintPuzzle,validateStock}from'../src/shared/stock-puzzle.js';
import{dailySummary,japanDay}from'../src/shared/daily-plan.js';
import{replaceLargeDaily}from'./repair-daily-size.mjs';
const account='3fb1db1d33caddf96fec77fac7d571e6',database='7bb28b61-5fe2-47ce-b71b-b0e04fc3747b';
const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)throw Error('Deployment credential is required');
async function query(sql,params=[]){for(let attempt=0;attempt<4;attempt++){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});const d=await r.json();if(r.ok&&d.success&&d.result?.every(x=>x.success))return d.result[0];if(r.status<500&&r.status!==429)throw Error('D1 query rejected ('+r.status+')');await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)))}throw Error('D1 unavailable')}
const now=Date.now(),today=japanDay();
await query('DELETE FROM rate_limits WHERE expires<?',[now]);
await query('DELETE FROM cloud_chunks WHERE revision IN(SELECT revision FROM cloud_uploads WHERE expires<?)',[now]);
await query('DELETE FROM cloud_uploads WHERE expires<?',[now]);
const repaired=await replaceLargeDaily({query,now});
const present=new Set((await query('SELECT slot FROM daily_assignments WHERE day>=?',[today])).results.map(r=>r.slot));
let added=0;
for(let offset=0;offset<21;offset++){
 const day=japanDay(now+offset*86400000);
 for(const level of[1,2,3]){
  const slot=day+':'+level;if(present.has(slot))continue;
  const summary=dailySummary(day,level);let success=false;
  for(let tries=0;tries<12;tries++){
   const stock=await generateStock(summary.kind,summary.n,level,4000);if(!stock)continue;validateStock(stock);
   const fingerprint=await fingerprintPuzzle(stock),payload=JSON.stringify({...stock,...summary});
   const result=await query('INSERT INTO daily_assignments(slot,day,level,fingerprint,payload,created) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING slot',[slot,day,level,fingerprint,payload,Date.now()]);
   if(result.results.length){added++;success=true;break}
   if((await query('SELECT slot FROM daily_assignments WHERE slot=?',[slot])).results.length){success=true;break}
  }
  if(!success)throw Error('Daily generation needs retry for '+day+' level '+level);
 }
}
await query("INSERT INTO daily_maintenance(key,value,expires) VALUES('cloudflare-refill',?,0) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify({at:Date.now(),added,...repaired})]);
console.log(`Daily inventory ready: ${repaired.replaced} future oversized puzzles replaced; 21 days, ${added} new puzzles. No answer data was logged.`);
