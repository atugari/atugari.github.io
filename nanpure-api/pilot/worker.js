import api from '../src/index.js';
import {body, hash, newKey, validKey} from '../src/http.js';
import {cleanVending} from '../src/vending.js';

const shelf = '/nanpure/vending/';
const ownerPage = shelf + 'owner.html';
const loginPath = '/pilot/login';
const logoutPath = '/pilot/logout';
const cookie = '__Host-nanpure-pilot';
const life = 12 * 60 * 60;
const vendingPath = '/api/vending';
const ownerPath = vendingPath + '/admin';
const mobilePath = vendingPath + '/worker';

function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  // A same-origin form POST needs its Origin; no-referrer makes Chromium send null.
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {status: response.status, headers});
}

function redirect(location, setCookie) {
  const headers = new Headers({Location: location});
  if (setCookie) headers.set('Set-Cookie', setCookie);
  return new Response(null, {status: 303, headers});
}

function landing(path) {
  if ([ownerPage, shelf + 'owner'].includes(path)) return ownerPage;
  if (path === '/nanpure/') return path;
  return shelf;
}

function login(next, denied = false) {
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>ナンプレ帳の試験棚</title></head>
<body><main><h1>ナンプレ帳の試験棚</h1><p>試験用の管理者キーで接続してください。</p>
${denied ? '<p role="alert">試験用の管理者キーを確認してください。</p>' : ''}
<form method="post" action="${loginPath}"><input name="next" type="hidden" value="${next}">
<label>試験用の管理者キー <input name="key" type="password" required autocomplete="off" autocapitalize="none" spellcheck="false"></label>
<button type="submit">接続する</button></form></main></body></html>`, {
    status: denied ? 403 : 200,
    headers: {'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'"}
  });
}

function sessionCookie(value, maxAge = life) {
  return `${cookie}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function sessionHash(request) {
  const token = (request.headers.get('Cookie') || '').split(/;\s*/)
    .find(value => value.startsWith(cookie + '='))?.slice(cookie.length + 1);
  return validKey(token) ? hash('nanpure-vending-pilot:' + token) : null;
}

async function route(request, env) {
  const url = new URL(request.url);
  const {pathname} = url;
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== url.origin) return new Response(null, {status: 403});
  if (!validKey(env.OWNER_KEY_HASH)) return new Response('試験棚は準備中です。', {status: 503});

  if (pathname === ownerPath || pathname === mobilePath) return api.fetch(request, env);
  if (pathname === loginPath && request.method === 'POST' && origin === url.origin) {
    let values;
    try {
      values = new URLSearchParams(new TextDecoder().decode(await body(request, 1024)));
    } catch {
      return login(shelf, true);
    }
    const key = values.get('key');
    const next = landing(values.get('next'));
    if (!validKey(key) || !equal(await hash(key), env.OWNER_KEY_HASH)) return login(next, true);
    const token = newKey();
    await env.DB.prepare('INSERT INTO pilot_sessions (token_hash, expires) VALUES (?,?)')
      .bind(await hash('nanpure-vending-pilot:' + token), Date.now() + life * 1000).run();
    return redirect(next, sessionCookie(token));
  }
  const session = await sessionHash(request);
  if (pathname === logoutPath && request.method === 'POST' && origin === url.origin) {
    if (session) await env.DB.prepare('DELETE FROM pilot_sessions WHERE token_hash=?').bind(session).run();
    return redirect(shelf, sessionCookie('', 0));
  }
  if (!session || !await env.DB.prepare('SELECT 1 FROM pilot_sessions WHERE token_hash=? AND expires>?')
    .bind(session, Date.now()).first()) {
    if (pathname.startsWith('/api/')) return Response.json({error: '試験棚に接続し直してください。'}, {status: 401});
    if (request.method === 'GET' && ['/', '/nanpure/', shelf, shelf.slice(0, -1), shelf + 'index.html', ownerPage, shelf + 'owner'].includes(pathname)) {
      return login(landing(pathname));
    }
    return new Response(null, {status: 401});
  }

  if (pathname === vendingPath) return api.fetch(request, env);
  if (pathname.startsWith('/api/')) return new Response(null, {status: 404});
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, {status: 405});
  if (pathname === '/') return redirect(shelf);
  if (pathname === '/nanpure/' || pathname === '/nanpure') return redirect(env.NOTEBOOK_PATH + '#numbers');
  if (pathname === shelf.slice(0, -1)) return redirect(shelf);
  if (pathname === shelf) url.pathname = shelf + 'index.html';
  if (pathname === shelf + 'owner') url.pathname = ownerPage;
  return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request, env) {
    return privateResponse(await route(request, env));
  },
  async scheduled(_event, env) {
    const now = Date.now();
    await cleanVending(env.DB, now);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(now),
      env.DB.prepare('DELETE FROM pilot_sessions WHERE expires<=?').bind(now)
    ]);
  }
};
