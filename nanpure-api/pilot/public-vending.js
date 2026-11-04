import {Problem, fail, hash, input, json, limit, siteOrigin, validKey} from '../src/http.js';
import {decodePuzzle, vendingEnabled} from '../src/vending.js';
import {canonicalCatalogueIdentity} from '../src/shared/vending-catalogue-engine.generated.js';

export const publicPath = '/api/vending/public';
const hour = 3_600_000;
const day = 24 * hour;
const profilePattern = /^[A-Za-z0-9:_-]{1,90}$/;
const allowedFields = ['action', 'id', 'profile', 'stockDigest'];
const offersPerPage = 8;
const quotaMatch = '(key=? AND count>=?) OR (key=? AND count>=?) OR (key=? AND count>=?)';
const outOfStock = '在庫がなくなりました。別の条件を選ぶか、少し後にお試しください。';
const quotaMessage = '続けて受け取る場合は時間をおいてください。';
const receiptSql = `SELECT o.profile,o.public_digest AS stockDigest,p.payload FROM vending_orders o
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

async function listOffers(request, env, profile, cursor) {
  if (!profilePattern.test(profile)) fail(400, '受け取る問題の条件を確認してください。');
  let after = [];
  if (cursor !== null) {
    const match = /^(\d{1,16}):([a-f0-9]{64})$/.exec(cursor);
    if (!match || !Number.isSafeInteger(Number(match[1]))) fail(400, '在庫の表示を開き直してください。');
    after = [Number(match[1]), match[2]];
  }
  await limit(env.DB, request, 'vending-public-offer', 60, 60_000);
  const position = after.length ? ' AND (created,digest)>(?,?)' : '';
  const {results} = await env.DB.prepare(`SELECT digest,created,payload FROM vending_puzzles
    WHERE profile=? AND order_id IS NULL AND payload IS NOT NULL
      AND EXISTS(SELECT 1 FROM vending_catalogue WHERE profile=?${profileScope(env)})${position}
    ORDER BY created,digest LIMIT ?`).bind(profile, profile, ...after, offersPerPage + 1).all();
  const page = results.slice(0, offersPerPage);
  const offers = [];
  for (const {digest, payload} of page) {
    const puzzle = await decodePuzzle(payload);
    offers.push({stockDigest: digest, notebookDigest: await hash(canonicalCatalogueIdentity(puzzle))});
  }
  const last = page.at(-1);
  return json({offers, nextCursor: results.length > offersPerPage ? `${last.created}:${last.digest}` : null});
}

async function serveReceipt(receipt, profile, stockDigest) {
  if (receipt.profile !== profile || (stockDigest !== undefined && receipt.stockDigest !== stockDigest)) {
    fail(409, '別の受け取り番号でやり直してください。');
  }
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
  if (!['take', 'replay'].includes(data.action) || !validKey(data.id) || typeof data.profile !== 'string' ||
      !profilePattern.test(data.profile) || Object.keys(data).some(key => !allowedFields.includes(key)) ||
      (Object.hasOwn(data, 'stockDigest') && (data.action === 'replay' || !validKey(data.stockDigest)))) {
    fail(400, '在庫から受け取る問題の条件を確認してください。');
  }
  const stockDigest = data.stockDigest ?? null;
  const now = Date.now();
  const browser = await hash('vending-public-browser:' + browserKey);
  // Both IDs are scoped away from the pilot's private hex-only receipts.
  const client = 'public:' + browser;
  const id = 'public:' + await hash(`vending-public-receipt:${browser}:${data.id}`);
  const db = env.DB;
  const receipt = db.prepare(receiptSql).bind(id, client);
  const previous = await receipt.first();
  if (data.action === 'replay') {
    if (!previous) fail(404, '受け取りの記録が見つかりませんでした。');
    return serveReceipt(previous, data.profile);
  }
  if (previous) return serveReceipt(previous, data.profile, stockDigest);

  await limit(db, request, 'vending-public-attempt', 20, 60_000);
  const ip = await hash('vending-public-ip:' + (request.headers.get('cf-connecting-ip') || 'unknown'));
  const quotas = quotaKeys(browser, ip, now);
  const budget = quotas.flatMap(quota => [quota.key, quota.max]);
  const selection = stockDigest === null ? '' : ' AND digest=?';
  const stock = `SELECT 1 FROM vending_catalogue WHERE profile=? AND available>0${profileScope(env)}
    AND EXISTS(SELECT 1 FROM vending_puzzles WHERE profile=? AND order_id IS NULL AND payload IS NOT NULL${selection})`;
  const stockBindings = [data.profile, data.profile, ...(stockDigest === null ? [] : [stockDigest])];
  const capped = `SELECT 1 FROM rate_limits WHERE ${quotaMatch}`;
  // New clients select a specific unassigned board after checking their notebook.
  // The trigger still selects the first unassigned board for older clients.
  // Claim, count and close in one D1 transaction so a failed or concurrent
  // request cannot leave an open order or hold an uncollected board.
  const [, , , , result, failure] = await db.batch([
    db.prepare(`INSERT INTO vending_orders (id,client,count,original_count,reserve,created,closed,profile,public_digest)
      SELECT ?,?,1,1,0,?,?,?,? WHERE EXISTS(${stock}) AND NOT EXISTS(${capped})
      ON CONFLICT(id) DO NOTHING`).bind(id, client, now, now, data.profile, stockDigest, ...stockBindings, ...budget),
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
      .bind(...stockBindings, ...budget, id, client)
  ]);
  if (result.results[0]) return serveReceipt(result.results[0], data.profile, stockDigest);
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
  if (request.method === 'GET') {
    const {searchParams} = new URL(request.url);
    const profile = searchParams.get('profile'), cursor = searchParams.get('after');
    if (profile !== null) return listOffers(request, env, profile, cursor);
    if (cursor !== null) fail(400, '受け取る問題の条件を確認してください。');
    return listStock(env);
  }
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
