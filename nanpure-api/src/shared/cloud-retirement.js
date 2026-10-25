// One shared service end date for every user, never a per-backup expiry.
export const cloudRetiresAt = Date.parse('2026-11-09T00:00:00+09:00');
export const cloudRetirement = {at:cloudRetiresAt,timezone:'Asia/Tokyo'};
export const cloudRetired = (now=Date.now()) => now>=cloudRetiresAt;

export function cloudDeletionStatements(now=Date.now()){
  if(!cloudRetired(now))return [];
  return [
    {sql:'DELETE FROM cloud_chunks',params:[]},
    {sql:'DELETE FROM cloud_uploads',params:[]},
    {sql:'DELETE FROM cloud_saves',params:[]},
    {sql:"DELETE FROM rate_limits WHERE key LIKE 'cloud%'",params:[]},
    {sql:"INSERT INTO daily_maintenance(key,value,expires) VALUES('cloud-retired',?,0) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params:[JSON.stringify({retiredAt:cloudRetiresAt,purgedAt:now})]}
  ];
}

// Idempotent and transactional. Keep unrelated daily, ranking, contact and
// achievement data, and the empty legacy tables needed by older health checks.
export async function deleteRetiredCloudData(db,now=Date.now()){
  const statements=cloudDeletionStatements(now);
  if(!statements.length)return false;
  if(await db.prepare("SELECT key FROM daily_maintenance WHERE key='cloud-retired'").first())return true;
  await db.batch(statements.map(({sql,params})=>db.prepare(sql).bind(...params)));
  return true;
}
