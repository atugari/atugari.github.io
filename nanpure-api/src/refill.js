import { fail, json, owner } from './http.js';

const inventorySql = `SELECT p.profile_key AS profileKey,p.catalogue_key AS catalogueKey,
  p.descriptor,p.baseline_count AS baselineCount,p.target_count AS targetCount,
  p.catalog_release AS catalogRelease,p.enabled,
  (SELECT COUNT(*) FROM refill_items i
    WHERE i.profile_key=p.profile_key AND i.exported_at IS NULL) AS pendingItems,
  p.baseline_count+(SELECT COUNT(*) FROM refill_items i
    WHERE i.profile_key=p.profile_key AND i.exported_at IS NULL) AS inventoryCount
  FROM refill_profiles p ORDER BY p.profile_key`;

export async function refillAdmin(request, env) {
  if (request.method !== 'GET') fail(405, 'この操作は利用できません。');
  if (!await owner(request, env)) fail(403, '管理用キーを確認してください。');
  if (!env.DB) fail(503, 'サーバーに接続できません。');

  const db = env.DB;
  const snapshot = await db.prepare(`SELECT catalog_release AS catalogRelease,
    total_count AS baselineCount,profile_count AS profileCount,created
    FROM refill_baseline_snapshots WHERE id=1`).first();
  if (!snapshot) fail(503, '補充在庫の基準データがまだ登録されていません。');

  const totals = await db.prepare(`SELECT COUNT(*) AS profileCount,
    COALESCE(SUM(baseline_count),0) AS baselineCount,
    COALESCE(SUM((SELECT COUNT(*) FROM refill_items i
      WHERE i.profile_key=p.profile_key AND i.exported_at IS NULL)),0) AS pendingGeneratedCount,
    COALESCE(SUM(MAX(0,target_count-baseline_count-
      (SELECT COUNT(*) FROM refill_items i
        WHERE i.profile_key=p.profile_key AND i.exported_at IS NULL))),0) AS totalShortage,
    COALESCE(SUM(CASE WHEN baseline_count+
      (SELECT COUNT(*) FROM refill_items i
        WHERE i.profile_key=p.profile_key AND i.exported_at IS NULL)<target_count
      THEN 1 ELSE 0 END),0) AS shortageProfiles,
    COALESCE(SUM(CASE WHEN baseline_count=0 AND
      (SELECT COUNT(*) FROM refill_items i
        WHERE i.profile_key=p.profile_key AND i.exported_at IS NULL)=0
      THEN 1 ELSE 0 END),0) AS emptyProfiles,
    COALESCE(SUM(enabled),0) AS enabledProfiles
    FROM refill_profiles p`).first();
  const jobs = await db.prepare('SELECT state,COUNT(*) AS count FROM refill_jobs GROUP BY state ORDER BY state').all();
  const batches = await db.prepare('SELECT state,COUNT(*) AS count FROM refill_batches GROUP BY state ORDER BY state').all();

  const url = new URL(request.url);
  let profiles;
  if (url.searchParams.get('profiles') === '1') {
    const result = await db.prepare(inventorySql).all();
    profiles = result.results.map(row => ({
      ...row, descriptor: JSON.parse(row.descriptor),
      shortage: Math.max(0, row.targetCount - row.inventoryCount)
    }));
  }
  return json({
    enabled: totals.enabledProfiles > 0,
    snapshot,
    totals: { ...totals, targetCount: 100 },
    jobs: jobs.results,
    batches: batches.results,
    ...(profiles ? { profiles } : {})
  });
}
