// Deployment and D1 connectivity check. Game APIs are migrated in a later release.
// This Worker never accepts SQL, credentials, or writes from public requests.
const allowedOrigin = 'https://atugari.github.io';
const schemaTables = ['attempts', 'daily_stock', 'daily_assignments',
  'daily_maintenance', 'inquiries', 'cloud_saves'];

function reply(request, body, status = 200, extra = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Origin',
    ...extra,
  };
  if (request.headers.get('Origin') === allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin !== null && origin !== allowedOrigin && origin !== url.origin) {
      return reply(request, { error: 'origin_not_allowed' }, 403);
    }
    const health = url.pathname === '/' || url.pathname === '/api/health';
    if (!health) return reply(request, { error: 'not_found' }, 404);
    if (request.method === 'OPTIONS') {
      if (request.headers.get('Access-Control-Request-Method') !== 'GET' ||
          request.headers.get('Access-Control-Request-Headers')) {
        return reply(request, { error: 'method_not_allowed' }, 405);
      }
      return reply(request, null, 204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    }
    if (request.method !== 'GET') {
      return reply(request, { error: 'method_not_allowed' }, 405, { Allow: 'GET, OPTIONS' });
    }
    if (!env.DB) return reply(request, { ok: false, database: 'unavailable' }, 503);
    try {
      // Reading sqlite_master confirms D1 works without creating or changing tables.
      const result = await env.DB.prepare(
        'SELECT name FROM sqlite_master WHERE type = ? AND name IN (?, ?, ?, ?, ?, ?)'
      ).bind('table', ...schemaTables).all();
      const installed = new Set(result.results.map(row => row.name));
      return reply(request, {
        ok: true,
        service: 'puzzle-api',
        version: '0.1.0',
        database: 'connected',
        schema: schemaTables.every(name => installed.has(name)) ? 'installed' : 'pending',
        gameApi: 'pending',
      });
    } catch {
      // Never disclose database identifiers, queries, or provider error messages.
      return reply(request, { ok: false, database: 'unavailable' }, 503);
    }
  },
};
