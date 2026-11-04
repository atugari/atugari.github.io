import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildFleetModule, patchWorkerSource, readPinnedWorker, sha256 } from './patch-worker.mjs';

const namespace = '__nanpureFleet_0123456789abcdef01234567';
const body = `{
  if (!vendingEnabled(env)) fail(503, '問題の受け取り機能は準備中です。');
  const now = Date.now();
  if (pathname === '/api/vending/admin') return admin(request, env, now);
  const expanded = catalogueEnabled(env);
  if (pathname === '/api/vending/worker') return worker(request, env.DB, now, expanded);
  return orders(request, env.DB, now, expanded);
}`;
const common = `
// SYNTHETIC_PRIVATE_MARKER — never a real credential or live Worker source.
var Problem = class extends Error { constructor(status,message){super(message);this.status=status;} };
var fail = (status,message)=>{throw new Problem(status,message);};
var vendingEnabled = env=>env.VENDING_ENABLED==='1';
var catalogueEnabled = env=>env.VENDING_CATALOGUE_ENABLED==='1';
async function admin(request,env,now){
  if(request.headers.get('Authorization')!=='Bearer fixture-owner')fail(403,'owner required');
  if(request.method==='POST')fail(400,'unsupported owner action');
  return Response.json({route:'admin'});
}
async function worker(request,db,now,expanded){
  if(request.headers.get('Authorization')!=='Bearer fixture-worker')fail(403,'worker required');
  const data=await request.json();
  if(data.action==='crash')throw new Error('SYNTHETIC_INTERNAL_ERROR');
  return Response.json({route:'worker',expanded});
}
async function orders(request,db,now,expanded){
  if(!request.headers.get('X-Nanpure-Key'))fail(401,'client required');
  return Response.json({route:'orders',expanded});
}
async function vending(request, env, pathname) ${body}
`;
const outer = `
async function cleanVending(db,now){db.cleanups.push(now);}
const legacyDefault={
  async scheduled(event,env){await cleanVending(env.DB,event.scheduledTime);},
  async fetch(request,env){
    let response;const url=new URL(request.url),origin=request.headers.get('Origin');
    try{
      if(origin!==null&&origin!==url.origin)fail(403,'legacy origin gate');
      if(!['GET','POST'].includes(request.method))fail(405,'legacy method gate');
      if(request.method==='POST'&&!origin&&url.pathname!=='/api/vending/worker')fail(403,'legacy origin required');
      if(url.pathname==='/other-api')response=Response.json({legacyOther:true});
      else if(['/api/vending','/api/vending/admin','/api/vending/worker'].includes(url.pathname)){
        if(url.pathname==='/api/vending'&&env.VENDING_PUBLIC_PLAY!=='1')fail(404,'legacy private gate');
        response=await vending(request,env,url.pathname);
      }else response=await env.ASSETS.fetch(request);
    }catch(error){response=Response.json({error:error instanceof Problem?error.message:'legacy generic error'},
      {status:error instanceof Problem?error.status:503});}
    const headers=new Headers(response.headers);headers.set('X-Legacy-Gate','preserved');
    headers.set('Cache-Control','no-store');
    return new Response(response.body,{status:response.status,headers});
  }
};
export {legacyDefault as default};
`;
const fixture = () => common + outer;
const failure = code => error => error.code === code;
function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-patch-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('structural patch preserves all bytes except one body and its dedicated import', () => {
  for (const original of [fixture(), fixture().replace(
    'var Problem = class extends Error { constructor(status,message){super(message);this.status=status;} };',
    'class Problem extends Error { constructor(status,message){super(message);this.status=status;} }'),
  fixture().replace(/\badmin\b/g, 'admin2').replace(/\bworker\b/g, 'worker3')
    .replaceAll("'/api/vending/admin2'", "'/api/vending/admin'")
    .replaceAll("'/api/vending/worker3'", "'/api/vending/worker'")]) {
    const result = patchWorkerSource(original, namespace);
    assert.equal(result.originalSHA256, sha256(original));
    assert.equal(result.workerSHA256, sha256(result.source));
    const header = `import * as ${namespace} from "./fleet-vending.mjs";\n`;
    assert(result.source.startsWith(header));
    assert.equal(result.source.slice(header.length, header.length + result.bodyStart),
      original.slice(0, result.bodyStart));
    assert(result.source.endsWith(original.slice(result.bodyEnd)));
    assert.equal(result.source.match(/async function vending\(/g).length, 1);
    assert(result.source.includes(`throw new Problem(error.status, error.message)`));
    assert(result.source.includes('async function cleanVending(db,now){db.cleanups.push(now);}'));
  }
});

test('unsupported signatures, routes, guards, errors and binding collisions fail closed', () => {
  const source = fixture();
  const cases = [
    [source.replace('vending(request, env, pathname)', 'vending(request, env, different)'), 'VENDING_SIGNATURE'],
    [source.replace('async function vending', 'function vending'), 'VENDING_SIGNATURE'],
    [source.replace("if (pathname === '/api/vending/admin')", "if (pathname === '/api/other/admin')"), 'VENDING_BODY'],
    [source.replace('return admin(request, env, now)', 'return orders(request, env, now)'), 'VENDING_BODY'],
    [source.replace("env.VENDING_ENABLED==='1'", "env.OTHER_FLAG==='1'"), 'FEATURE_GUARD'],
    [source.replace('throw new Problem(status,message)', 'throw new Error(message)'), 'PROBLEM_BRIDGE'],
    [source.replace('class extends Error', 'class extends TypeError'), 'PROBLEM_CLASS'],
    [source + '\nfunction extra(){async function vending(request,env,pathname){}}', 'VENDING_FUNCTION'],
    [source + '\nfunction extra(){class Problem2 extends Error{}}', 'PROBLEM_CLASS'],
    [source + '\n// ' + namespace, 'NAMESPACE_COLLISION']
  ];
  for (const [input, code] of cases) assert.throws(() => patchWorkerSource(input, namespace), failure(code));
});

test('production CLI rejects an unreviewed hash without output modules or source diagnostics', t => {
  const dir = temporary(t), input = join(dir, 'old-worker.js'), output = join(dir, 'out');
  writeFileSync(input, fixture());
  assert.throws(() => readPinnedWorker(input), failure('LEGACY_HASH'));
  const script = fileURLToPath(new URL('./patch-worker.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, input, output], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.equal(JSON.parse(run.stderr).code, 'LEGACY_HASH');
  assert(!run.stderr.includes('SYNTHETIC_PRIVATE_MARKER'));
  assert(!existsSync(output));
  const override = spawnSync(process.execPath, [script, input, output, '--expected-hash', sha256(fixture())], { encoding: 'utf8' });
  assert.equal(override.status, 1);
  assert.equal(JSON.parse(override.stderr).code, 'USAGE');
  assert.equal(readFileSync(input, 'utf8'), fixture());
});

test('rehearsal retains outer gates, assets, other APIs, scheduled cleanup and error statuses', async t => {
  const dir = temporary(t), original = fixture();
  writeFileSync(join(dir, 'old.mjs'), original);
  writeFileSync(join(dir, 'worker.mjs'), patchWorkerSource(original, namespace).source);
  writeFileSync(join(dir, 'fleet-vending.mjs'), common + '\nexport {vending,Problem};');
  const old = (await import(pathToFileURL(join(dir, 'old.mjs')))).default;
  const patched = (await import(pathToFileURL(join(dir, 'worker.mjs')))).default;
  const environment = extra => ({ VENDING_ENABLED: '1', VENDING_CATALOGUE_ENABLED: '1',
    VENDING_PUBLIC_PLAY: '1', DB: { cleanups: [] },
    ASSETS: { fetch: async request => new Response('synthetic asset:' + new URL(request.url).pathname) }, ...extra });
  async function response(handler, path, { method = 'GET', headers = {}, body, env = {} } = {}) {
    const r = await handler.fetch(new Request('https://pilot.test' + path, {
      method, headers, ...(body && { body: JSON.stringify(body) })
    }), environment(env));
    return { status: r.status, text: await r.text(), headers: Object.fromEntries(r.headers) };
  }
  const cases = [
    ['/', {}], ['/other-api', {}], ['/not-an-api', {}],
    ['/api/vending', { env: { VENDING_PUBLIC_PLAY: '0' } }],
    ['/api/vending', { headers: { Origin: 'https://other.test' } }],
    ['/api/vending', { method: 'DELETE' }],
    ['/api/vending', {}], ['/api/vending', { headers: { 'X-Nanpure-Key': 'fixture-client' } }],
    ['/api/vending/admin', {}],
    ['/api/vending/admin', { headers: { Authorization: 'Bearer fixture-owner' } }],
    ['/api/vending/admin', { method: 'POST', headers: { Authorization: 'Bearer fixture-owner' }, body: {} }],
    ['/api/vending/admin', { method: 'POST', headers: { Origin: 'https://pilot.test', Authorization: 'Bearer fixture-owner' }, body: {} }],
    ['/api/vending/worker', { method: 'POST', body: { action: 'poll' } }],
    ['/api/vending/worker', { method: 'POST', headers: { Authorization: 'Bearer fixture-worker' }, body: { action: 'poll' } }],
    ['/api/vending/worker', { method: 'POST', headers: { Authorization: 'Bearer fixture-worker' }, body: { action: 'crash' } }],
    ['/api/vending/worker', { method: 'POST', body: {}, env: { VENDING_ENABLED: '0' } }]
  ];
  for (const [path, options] of cases)
    assert.deepEqual(await response(patched, path, options), await response(old, path, options), path);
  const one = environment(), two = environment();
  await old.scheduled({ scheduledTime: 123 }, one);
  await patched.scheduled({ scheduledTime: 123 }, two);
  assert.deepEqual(two.DB.cleanups, one.DB.cleanups);
  assert.deepEqual(two.DB.cleanups, [123]);
});

test('real bundled fleet handler crosses the legacy Problem boundary with correct 403, 400 and success responses', async t => {
  const dir = temporary(t), bytes = await buildFleetModule();
  writeFileSync(join(dir, 'fleet-vending.mjs'), bytes);
  writeFileSync(join(dir, 'worker.mjs'), patchWorkerSource(fixture(), namespace).source);
  const patched = (await import(pathToFileURL(join(dir, 'worker.mjs')))).default;
  const { database } = await import('../../nanpure-api/test/db.mjs');
  const { hash } = await import('../../nanpure-api/src/http.js');
  const DB = database(); t.after(() => DB.raw.close());
  const owner = 'a'.repeat(64), enrollmentKey = 'b'.repeat(64), token = 'c'.repeat(64);
  const env = { DB, OWNER_KEY_HASH: await hash(owner), VENDING_ENABLED: '1',
    VENDING_CATALOGUE_ENABLED: '1', VENDING_PUBLIC_PLAY: '0' };
  async function call(path, data, authorized = false) {
    const response = await patched.fetch(new Request('https://pilot.test' + path, {
      method: data ? 'POST' : 'GET',
      headers: { Origin: 'https://pilot.test', 'Content-Type': 'application/json',
        ...(authorized && { Authorization: 'Bearer ' + owner }) },
      ...(data && { body: JSON.stringify(data) })
    }), env);
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await call('/api/vending/admin')).status, 403, 'foreign module Problem retains owner denial');
  assert.equal((await call('/api/vending/admin', { action: 'invalid' }, true)).status, 400);
  const grant = await call('/api/vending/admin', { action: 'enrollment_create', enrollmentKey,
    name: 'Synthetic fleet', maxDevices: 30 }, true);
  assert.equal(grant.status, 200);
  const enrolled = await call('/api/vending/worker', { action: 'enroll', enrollmentKey, token, name: 'Xperia' });
  assert.equal(enrolled.status, 200);
  assert.equal(enrolled.data.ok, true);
  assert.equal((await call('/api/vending')).status, 404, 'legacy private-play gate remains in force');
  assert.equal((await call('/api/vending/admin', null, true)).data.enrollments[0].activeDevices, 1);
});
