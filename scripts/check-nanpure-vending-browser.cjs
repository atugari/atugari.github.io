// Exercises the actual Worker routes and notebook IndexedDB without contacting a remote service.
// First generate the checked Worker proof bundle via npm --prefix nanpure-api run build.
// Run from the repository with Node 22+: node scripts/check-nanpure-vending-browser.cjs
// To use an isolated Wrangler dev server, set NANPURE_VENDING_TEST_LOCAL_URL
// and NANPURE_VENDING_TEST_OWNER_KEY to its loopback URL and test owner key.
// NANPURE_VENDING_TEST_GENERATED can point to one newly generated Lv18 JSON puzzle.
// NANPURE_VENDING_TEST_EXPANDED=1 additionally checks a 16×16 v2 shelf.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const {randomBytes} = require('node:crypto');
const {gunzipSync, inflateSync} = require('node:zlib');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const site = 'https://atugari.github.io';
const api = 'https://puzzle-api.puzzle-hub-4826.workers.dev';
const vending = '/api/vending';
const workerPath = vending + '/worker';
const ownerPath = vending + '/admin';
const testOwner = process.env.NANPURE_VENDING_TEST_OWNER_KEY || randomBytes(32).toString('hex');
const localApi = process.env.NANPURE_VENDING_TEST_LOCAL_URL
  ? new URL(process.env.NANPURE_VENDING_TEST_LOCAL_URL) : null;
if (localApi) {
  assert.equal(localApi.protocol, 'http:');
  assert.equal(localApi.hostname, '127.0.0.1');
  assert(/^[a-f0-9]{64}$/.test(process.env.NANPURE_VENDING_TEST_OWNER_KEY || ''), 'Supply a local test owner key');
}
const workerToken = randomBytes(32).toString('hex');
const expanded = process.env.NANPURE_VENDING_TEST_EXPANDED === '1';
const importRepo = relative => import(pathToFileURL(path.join(root, relative)).href);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.b64': 'text/plain'
};

function stockFixtures() {
  const pack = process.env.NANPURE_VENDING_TEST_PACK ||
    path.join(root, 'nanpure/collection/data/C149/0000.gz.b64');
  const rows = JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(pack, 'utf8'), 'base64')));
  const puzzles = rows.slice(0, 3).map(row => row.puzzle);
  const generated = process.env.NANPURE_VENDING_TEST_GENERATED;
  if (generated) puzzles[2] = JSON.parse(fs.readFileSync(generated, 'utf8'));
  assert.equal(puzzles.length, 3);
  assert(puzzles.every(p => p.kind === 'normal' && p.n === 9 && p.level === 18 && p.logicProof?.length));
  return puzzles;
}

function largeFixture(version) {
  const engine = fs.readFileSync(path.join(root, 'nanpure/releases', version, 'notebook/index.html'), 'utf8');
  const ctx = vm.createContext({console, atob, btoa, crypto: globalThis.crypto, performance, setTimeout, clearTimeout});
  ctx.window = ctx;
  ctx.self = ctx;
  for (const [, id, code] of engine.matchAll(/<script[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (id.startsWith('core-') || id === 'common-source' || id === 'generator-source') vm.runInContext(code, ctx);
  }
  return {...ctx.NPGenerate({kind: 'normal', n: 16, level: 1, count: 1}, () => {}),
    uid: 'vending-profile-test-' + randomBytes(8).toString('hex')};
}

async function bodyOf(response) {
  const data = await response.json();
  return {status: response.status, data};
}

async function notebookRows(page) {
  const rows = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('nanpure-chou-data');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('puzzles')) {
        db.close();
        resolve([]);
        return;
      }
      const read = db.transaction('puzzles', 'readonly').objectStore('puzzles').getAll();
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        db.close();
        resolve(read.result.map(row => row.compactVersion ? {...row, data: Array.from(row.data)} : row));
      };
    };
  }));
  return rows.map(row => row.compactVersion ? JSON.parse(inflateSync(Buffer.from(row.data))) : row);
}

async function waitForCount(page, count) {
  await page.waitForFunction(expected => {
    const text = document.querySelector('#available')?.textContent?.trim();
    return Boolean(text && text.replace(/,/g, '').match(new RegExp('^' + expected + '(?:\\s*問)?$')));
  }, count);
}

async function main() {
  const [{default: app}, {database}, {hash}] = await Promise.all([
    importRepo('nanpure-api/src/index.js'),
    importRepo('nanpure-api/test/db.mjs'),
    importRepo('nanpure-api/src/http.js')
  ]);
  const DB = localApi ? null : database();
  const env = {DB, OWNER_KEY_HASH: await hash(testOwner), VENDING_ENABLED: '1'};
  function fetchApi(request) {
    if (!localApi) return app.fetch(request, env);
    const source = new URL(request.url);
    return fetch(new Request(new URL(source.pathname + source.search, localApi), request));
  }
  const trace = [];
  let loseNextReceipt = false;
  const puzzles = stockFixtures();
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_BIN || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  async function call(pathname, body, {token, visitor} = {}) {
    const headers = {
      Origin: site, ...(body ? {'Content-Type': 'application/json'} : {}),
      ...(token ? {Authorization: 'Bearer ' + token} : {}),
      ...(visitor ? {'X-Nanpure-Key': visitor} : {})
    };
    return bodyOf(await fetchApi(new Request(api + pathname, {
      method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body)
    })));
  }
  async function succeed(pathname, body, auth) {
    const {status, data} = await call(pathname, body, auth);
    assert.equal(status, 200, JSON.stringify(data));
    return data;
  }
  async function deliver(p) {
    const {job} = await succeed(workerPath, {action: 'poll'}, {token: workerToken});
    assert(job, 'An eligible device can receive a refill assignment');
    assert.equal(job.kind, 'normal');
    assert.equal(job.n, 9);
    assert.equal(job.level, 18);
    const reply = await succeed(workerPath, {action: 'result', id: job.id, lease: job.lease, p}, {token: workerToken});
    assert.equal(reply.ok, true);
  }
  try {
    const context = await browser.newContext({viewport: {width: 393, height: 852}, serviceWorkers: 'block'});
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin === api && url.pathname.startsWith(vending)) {
        const headers = await req.allHeaders();
        const data = req.postData() || undefined;
        const response = await fetchApi(new Request(url, {
          method: req.method(), headers, body: data
        }));
        const body = await response.text();
        if (req.method() !== 'OPTIONS') {
          trace.push({
            path: url.pathname, method: req.method(), headers, status: response.status,
            request: data ? JSON.parse(data) : null, response: body ? JSON.parse(body) : null
          });
        }
        if (loseNextReceipt && url.pathname === vending && response.ok &&
            data && JSON.parse(data).action === 'collect') {
          loseNextReceipt = false;
          return route.abort('connectionreset');
        }
        return route.fulfill({status: response.status, headers: Object.fromEntries(response.headers), body});
      }
      if (url.origin !== site) return route.abort();
      const requestPath = decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : '');
      const file = path.resolve(root, '.' + requestPath);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({status: 404, body: 'Missing browser test asset: ' + requestPath});
      }
      return route.fulfill({
        contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)
      });
    });

    const customer = await context.newPage();
    await customer.goto(site + '/nanpure/vending/');
    await waitForCount(customer, 0);
    await customer.locator('#reserve').waitFor();
    assert(await customer.locator('#take-now').isDisabled());
    assert(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    await customer.locator('#quantity').fill('2');
    await customer.locator('#reserve').click();
    const orderCard = customer.locator('#orders [data-order-id]').first();
    await orderCard.waitFor();
    const orderId = await orderCard.getAttribute('data-order-id');
    const placed = trace.find(entry => entry.path === vending && entry.request?.action === 'order');
    assert.equal(placed.request.id, orderId);
    assert.equal(placed.request.count, 2);
    assert.equal(placed.request.reserve, true);
    const visitor = placed.headers['x-nanpure-key'];
    assert(visitor);
    const getOrder = async () => (await succeed(vending, null, {visitor})).orders.find(item => item.id === orderId);
    assert.equal((await getOrder()).waiting, 2);

    await customer.reload();
    await orderCard.waitFor();
    assert.equal(await orderCard.getAttribute('data-order-id'), orderId);
    const stranger = await succeed(vending, null, {visitor: randomBytes(32).toString('hex')});
    assert.deepEqual(stranger.orders, []);

    const owner = await context.newPage();
    await owner.goto(site + '/nanpure/vending/owner.html');
    await owner.locator('#owner-key').fill(testOwner);
    await owner.locator('#owner-connect').click();
    await owner.locator('#device-name').fill('試験用Xperia');
    await owner.locator('#make-pair').click();
    await owner.locator('#pair-code').waitFor({state: 'attached'});
    await owner.waitForFunction(() => document.querySelector('#pair-code')?.value?.trim());
    const pairing = trace.find(entry => entry.path === ownerPath && entry.request?.action === 'pair');
    assert(pairing?.response?.code, 'The owner UI generated a one-time pairing code');
    const deepLink = 'nanpure-refill://pair?code=' + pairing.response.code;
    assert.equal(await owner.locator('#open-pair').getAttribute('href'), deepLink);
    const pairPage = await context.newPage();
    await pairPage.goto(site + '/nanpure/vending/pair.html#code=' + pairing.response.code);
    await pairPage.locator('#open').waitFor();
    assert.equal(await pairPage.locator('#open').getAttribute('href'), deepLink);
    await pairPage.close();
    await succeed(workerPath, {action: 'register', code: pairing.response.code, token: workerToken});
    const reuse = await call(workerPath, {
      action: 'register', code: pairing.response.code, token: randomBytes(32).toString('hex')
    });
    assert(reuse.status >= 400, 'Pairing codes are single-use');

    await deliver(puzzles[0]);
    assert.equal((await getOrder()).ready, 1);
    await customer.reload();
    await waitForCount(customer, 0);
    // Drop one response after the service recorded the pickup, as a phone can
    // lose connectivity during the handoff to the user's local problem book.
    loseNextReceipt = true;
    await orderCard.locator('[data-action="collect"]').click();
    const recoverReceipt = orderCard.locator('[data-action="collect"]').filter({hasText: '問題帳への保存を再試行'});
    await recoverReceipt.waitFor();
    assert.equal((await getOrder()).received, 1);
    assert.equal((await notebookRows(customer)).length, 0);
    await recoverReceipt.click();
    await customer.locator('#open-notebook').waitFor();
    const firstRows = await notebookRows(customer);
    assert.equal(firstRows.length, 1);
    assert.deepEqual(firstRows[0].puzzle, puzzles[0].puzzle);
    assert.deepEqual(firstRows[0].solution, puzzles[0].solution);
    assert(firstRows[0].logicProof?.length > 0, 'The actual notebook stored the difficulty proof');

    await deliver(puzzles[1]);
    await customer.reload();
    await orderCard.locator('[data-action="collect"]').click();
    await customer.locator('#open-notebook').waitFor();
    const complete = await getOrder();
    assert.equal(complete.received, 2);
    assert.equal(complete.waiting, 0);
    assert.equal((await notebookRows(customer)).length, 2);

    await deliver(puzzles[2]);
    await customer.reload();
    await waitForCount(customer, 1);
    await customer.locator('#quantity').fill('1');
    await customer.locator('#take-now').click();
    await customer.locator('#open-notebook').waitFor();
    await waitForCount(customer, 0);
    const rows = await notebookRows(customer);
    assert.equal(rows.length, 3);
    const seen = new Set(rows.map(row => row.puzzle.join('')));
    for (const p of puzzles) assert(seen.has(p.puzzle.join('')));
    assert(rows.every(row => row.n === 9 && row.level === 18 && row.rating.level === 18));

    const {version} = JSON.parse(fs.readFileSync(path.join(root, 'nanpure/version.json'), 'utf8'));
    const notebook = await context.newPage();
    await notebook.goto(site + '/nanpure/releases/' + version + '/notebook/index.html#numbers');
    await notebook.locator('[data-action="start"][data-flow="play"]').click();
    const playable = notebook.locator('[data-action="pick-play"]').first();
    await playable.waitFor();
    assert.equal(await notebook.locator('[data-action="pick-play"]').count(), 3);
    await playable.click();
    await notebook.locator('[data-action="begin-play"]').click();
    await notebook.locator('#board [data-cell]').first().waitFor();

    if (expanded) {
      const profile = 'normal:16:1:0::::';
      const large = largeFixture(version);
      await customer.locator('#profile-size').selectOption('16');
      await waitForCount(customer, 0);
      await customer.locator('#reserve').click();
      const largeCard = customer.locator('#orders [data-order-id]').filter({hasText: '16×16'});
      await largeCard.waitFor();
      const largeId = await largeCard.getAttribute('data-order-id');
      const placedLarge = trace.find(entry => entry.request?.action === 'order' && entry.request.id === largeId);
      assert.equal(placedLarge.request.profile, profile);
      const {job} = await succeed(workerPath, {
        action: 'poll', version: 2, ready: [profile], stock: {count: 42, bytes: 120_000}
      }, {token: workerToken});
      assert.equal(job.profile, profile);
      await succeed(workerPath, {action: 'result', id: job.id, lease: job.lease, p: large}, {token: workerToken});
      await customer.reload();
      await customer.evaluate(() => {
        const original = IDBObjectStore.prototype.getAll;
        window.restoreReceiptRead = () => { IDBObjectStore.prototype.getAll = original; };
        IDBObjectStore.prototype.getAll = function (...args) {
          if (['puzzles', 'seen', 'summaries'].includes(this.name)) throw Error('Receipt loaded the full problem book');
          return original.apply(this, args);
        };
      });
      await largeCard.locator('[data-action="collect"]').click();
      await customer.locator('#open-notebook').waitFor();
      await customer.evaluate(() => window.restoreReceiptRead());
      const largeSaved = (await notebookRows(customer)).find(row => row.uid === large.uid);
      assert.equal(largeSaved.n, 16);
      assert.equal(largeSaved.level, 1);
      assert.deepEqual(largeSaved.puzzle, Array.from(large.puzzle));
      assert.deepEqual(largeSaved.solution, Array.from(large.solution));
      assert.equal(largeSaved.verification.unique, true);
      await owner.locator('#owner-refresh').click();
      await owner.getByText(/端末の在庫 42問/).waitFor();
    }

    await owner.reload();
    await owner.locator('#owner-key').fill(testOwner);
    await owner.locator('#owner-connect').click();
    const device = owner.locator('#devices [data-device-id]').filter({hasText: '試験用Xperia'});
    await device.waitFor();
    owner.once('dialog', dialog => dialog.accept());
    await device.locator('[data-action="revoke"]').click();
    await owner.waitForFunction(() =>
      ![...document.querySelectorAll('#devices [data-device-id]')].some(node =>
        node.textContent.includes('試験用Xperia') && node.querySelector('[data-action="revoke"]')));
    const revoked = await call(workerPath, {action: 'poll'}, {token: workerToken});
    assert(revoked.status >= 400, 'A revoked device cannot claim more work');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS vending browser: stock, reservation, pairing/revocation, lost-receipt recovery, partial/instant pickup, notebook storage and play' +
      (expanded ? ', v2 16×16 reservation, indexed receipt and device stock' : ''));
  } finally {
    await browser.close();
    DB?.raw.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
