export function matching(records,filters={}){
 const query=String(filters.query||'').trim().toUpperCase();
 return records.filter(r=>(!filters.technique||r.used[filters.technique])&&(!filters.level||String(r.level)===String(filters.level))&&(!filters.completion||filters.completion==='all'||(filters.completion==='solved'?r.solved:!r.solved))&&(!query||r.id.includes(query)));
}
export function pickRoute(record,type=''){
 const i=record.routes.findIndex(r=>!type||r.stats.used[type]);return i<0?0:i;
}
export function practiceScenes(route,type=''){
 return route.steps.map((step,at)=>({step,at})).filter(x=>!type||x.step.type===type).map(x=>{
  const target=x.step.cuts.length?x.step.cuts[0].i:x.step.focus[0];
  const answers=x.step.cuts.length?x.step.cuts.filter(c=>c.i===target).map(c=>c.d):x.step.digits.slice();
  return {...x,target,answers};
 });
}
export function practiceHint(step){return {...step,cuts:[],digits:[]};}
export function solvedRoute(record){return record.routes.find(r=>r.status==='solved')||null;}
export function routeName(route){return route.strategy==='basic'?'基本の順で探す':'別の順で探す';}
export function statusName(status){return {solved:'最後まで確認済み',stalled:'途中まで確認済み',limited:'時間内の確認は途中まで'}[status]||'手順を確認中';}
