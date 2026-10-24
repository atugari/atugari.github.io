// Generate replacements before atomically swapping unpublished assignments.
import{dailySummary,japanDay,smallDailyFrom}from'../src/shared/daily-plan.js';
import{generateStock}from'../src/shared/stock-generate.js';
import{validateStock,fingerprintPuzzle}from'../src/shared/stock-puzzle.js';
export async function replaceLargeDaily({query,now=Date.now(),generate=generateStock}){
 const boundary=[smallDailyFrom,japanDay(now)].sort().at(-1);
 const rows=(await query("SELECT slot,day,level,fingerprint,payload FROM daily_assignments WHERE day>=? AND json_valid(payload) AND CAST(json_extract(payload,'$.n') AS INTEGER)>9 ORDER BY day,level",[boundary])).results;
 let replaced=0;
 for(const row of rows){
  // Never change a puzzle somebody has already started.
  if((await query('SELECT id FROM attempts WHERE substr(day,1,10)=? AND level=? LIMIT 1',[row.day,row.level])).results.length)throw Error('Oversized published puzzle needs review: '+row.day+' level '+row.level);
  const summary=dailySummary(row.day,row.level);let done=false;
  for(let tries=0;tries<24;tries++){
   const stock=await generate(summary.kind,summary.n,row.level,4000);if(!stock)continue;validateStock(stock);
   if(stock.n>9||stock.level!==row.level||stock.kind!==summary.kind)throw Error('Replacement configuration changed');
   const fingerprint=await fingerprintPuzzle(stock),payload=JSON.stringify({...stock,...summary});
   const updated=await query("UPDATE OR IGNORE daily_assignments SET fingerprint=?,payload=?,created=? WHERE slot=? AND fingerprint=? AND payload=? AND NOT EXISTS(SELECT 1 FROM attempts WHERE substr(day,1,10)=? AND level=?) RETURNING slot",[fingerprint,payload,now,row.slot,row.fingerprint,row.payload,row.day,row.level]);
   if(updated.results.length){replaced++;done=true;break;}
   const current=(await query('SELECT payload FROM daily_assignments WHERE slot=?',[row.slot])).results[0];if(current&&JSON.parse(current.payload).n<=9){done=true;break;}
  }
  if(!done)throw Error('Could not safely replace future daily '+row.day+' level '+row.level);
 }
 await query('UPDATE daily_stock SET retired=1 WHERE n>9 AND retired=0');
 const remaining=(await query("SELECT COUNT(*) AS n FROM daily_assignments WHERE day>=? AND json_valid(payload) AND CAST(json_extract(payload,'$.n') AS INTEGER)>9",[boundary])).results[0].n;
 if(remaining)throw Error('Future oversized daily puzzles remain');
 return{replaced,smallDailyFrom,boundary,remaining};
}
