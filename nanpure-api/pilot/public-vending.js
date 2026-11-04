import {Problem, fail, hash, input, json, limit, siteOrigin, validKey} from '../src/http.js';
import {decodePuzzle, vendingEnabled} from '../src/vending.js';

export const publicPath = '/api/vending/public';
const hour = 3_600_000;
const day = 24 * hour;
const profilePattern = /^[A-Za-z0-9:_-]{1,90}$/;
const allowedFields = ['action', 'id', 'profile'];
const quotaMatch = '(key=? AND count>=?) OR (key=? AND count>=?) OR (key=? AND count>=?)';
const outOfStock = '在庫がなくなりました。別の条件を選ぶか、少し後にお試しください。';
const quotaMessage = '続けて受け取る場合は時間をおいてください。';
const receiptSql = `SELECT o.profile,p.payload FROM vending_orders o
  LEFT JOIN vending_puzzles p ON p.order_id=o.id AND p.collected IS NOT NULL
  WHERE o.id=? AND o.client=? AND o.closed IS NOT NULL AND o.received=1`;

function profileScope(env) {
  return env.VENDING_CATALOGUE_ENABLED === '1' ? '' : ' AND expanded=0';
}

async function listStock(env) {
  const {results} = await env.DB.prepare(`SELECT profile,kind,n,level,complexity,multi_shape AS multiShape,
    linked_shape AS linkedShape,available FROM vending_catalogue WHERE available>0${profileScope(env)}
    ORDER BY kind,n,level,profile`).all();
  return json({profiles: results.map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)))});
}

async function serveReceipt(receipt, profile) {
  if (receipt.profile !== profile) fail(409, '別の受け取り番号でやり直してください。');
  if (!receipt.payload) fail(409, '受け取り内容の保存期間が終了しました。');
  const {verification, ...puzzle} = await decodePuzzle(receipt.payload);
  return json({puzzle});
}

function quotaKeys(browser, ip, now) {
  const hourly = Math.floor(now / hour), daily = Math.floor(now / day);
  return [
    {key: `vending-public:browser:${browser}:${hourly}`, max: 3, expires: (hourly + 2) * hour},
    {key: `vending-public:ip:${ip}:${hourly}`, max: 8, expires: (hourly + 2) * hour},
    {key: `vending-public:global:${daily}`, max: 30, expires: (daily + 2) * day}
  ];
}

async function takePuzzle(request, env) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    fail(415, 'JSONで送信してください。');
  }
  const browserKey = request.headers.get('x-nanpure-key');
  if (!validKey(browserKey)) fail(401, 'この画面を開き直してください。');
  const data = await input(request, 512);
  if (data.action !== 'take' || !validKey(data.id) || typeof data.profile !== 'string' ||
      !profilePattern.test(data.profile) || Object.keys(data).some(key => !allowedFields.includes(key))) {
    fail(400, '在庫から受け取る問題の条件を確認してください。');
  }
  const now = Date.now();
  const [browser, ip] = await Promise.all([
    hash('vending-public-browser:' + browserKey),
    hash('vending-public-ip:' + (request.headers.get('cf-connecting-ip') || 'unknown'))
  ]);
  // Both IDs are scoped away from the pilot's private hex-only receipts.
  const client = 'public:' + browser;
  const id = 'public:' + await hash(`vending-public-receipt:${browser}:${data.id}`);
  const db = env.DB;
  const receipt = db.prepare(receiptSql).bind(id, client);
  const previous = await receipt.first();
  if (previous) return serveReceipt(previous, data.profile);

  await limit(db, request, 'vending-public-attempt', 20, 60_000);
  const quotas = quotaKeys(browser, ip, now);
  const budget = quotas.flatMap(quota => [quota.key, quota.max]);
  const stock = `SELECT 1 FROM vending_catalogue WHERE profile=? AND available>0${profileScope(env)}
    AND EXISTS(SELECT 1 FROM vending_puzzles WHERE profile=? AND order_id IS NULL AND payload IS NOT NULL)`;
  const capped = `SELECT 1 FROM rate_limits WHERE ${quotaMatch}`;
  // The existing trigger allocates the first unassigned board of this profile.
  // Claim, count and close in one D1 transaction so a failed or concurrent
  // request cannot leave an open order or hold an uncollected board.
  const [, , , , result, failure] = await db.batch([
    db.prepare(`INSERT INTO vending_orders (id,client,count,original_count,reserve,created,closed,profile)
      SELECT ?,?,1,1,0,?,?,? WHERE EXISTS(${stock}) AND NOT EXISTS(${capped})
      ON CONFLICT(id) DO NOTHING`).bind(id, client, now, now, data.profile, data.profile, data.profile, ...budget),
    db.prepare(`INSERT INTO rate_limits (key,count,expires)
      SELECT key,1,expires FROM (SELECT ? AS key,? AS expires UNION ALL SELECT ?,? UNION ALL SELECT ?,?)
      WHERE EXISTS(SELECT 1 FROM vending_orders WHERE id=? AND client=? AND assigned=1 AND received=0)
      ON CONFLICT(key) DO UPDATE SET count=count+1`)
      .bind(...quotas.flatMap(quota => [quota.key, quota.expires]), id, client),
    db.prepare(`UPDATE vending_puzzles SET collected=? WHERE order_id=? AND collected IS NULL
      AND EXISTS(SELECT 1 FROM vending_orders WHERE id=? AND client=? AND assigned=1 AND received=0)`)
      .bind(now, id, id, client),
    db.prepare('UPDATE vending_orders SET received=1 WHERE id=? AND client=? AND assigned=1 AND received=0').bind(id, client),
    receipt,
    db.prepare(`SELECT EXISTS(${stock}) AS ready, EXISTS(${capped}) AS limited
      WHERE NOT EXISTS(SELECT 1 FROM vending_orders WHERE id=? AND client=? AND received=1)`)
      .bind(data.profile, data.profile, ...budget, id, client)
  ]);
  if (result.results[0]) return serveReceipt(result.results[0], data.profile);
  const status = failure.results[0];
  if (!status?.ready) fail(409, outOfStock);
  if (status.limited) fail(429, quotaMessage);
  fail(503, '問題を受け取れませんでした。少し待って再試行してください。');
}

async function route(request, env, origin) {
  if (origin !== siteOrigin && !(origin === null && request.method === 'GET')) {
    fail(403, '送信元を確認できません。');
  }
  if (request.headers.has('authorization') || request.headers.has('cookie')) {
    fail(403, '公開の受け取り画面を開き直してください。');
  }
  if (!vendingEnabled(env) || env.VENDING_PUBLIC_PLAY !== '1' || !validKey(env.OWNER_KEY_HASH) || !env.DB) {
    fail(503, '公開の問題は準備中です。');
  }
  if (request.method === 'GET') return listStock(env);
  if (request.method === 'POST') return takePuzzle(request, env);
  if (request.method !== 'OPTIONS') fail(405, 'この操作は利用できません。');

  const method = request.headers.get('access-control-request-method');
  const headers = (request.headers.get('access-control-request-headers') || '').toLowerCase()
    .split(',').map(header => header.trim()).filter(Boolean);
  if (method !== 'POST' || headers.some(header => !['content-type', 'x-nanpure-key'].includes(header))) {
    fail(405, 'この操作は利用できません。');
  }
  return new Response(null, {status: 204, headers: {
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type, X-Nanpure-Key',
    'Access-Control-Max-Age': '600'
  }});
}

export async function publicVending(request, env) {
  const origin = request.headers.get('origin');
  let response;
  try {
    response = await route(request, env, origin);
  } catch (error) {
    response = error instanceof Problem ? json({error: error.message}, error.status)
      : json({error: '通信できませんでした。少し待って再試行してください。'}, 503);
  }
  const headers = new Headers(response.headers);
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (origin === siteOrigin) headers.set('Access-Control-Allow-Origin', siteOrigin);
  return new Response(response.body, {status: response.status, headers});
}
