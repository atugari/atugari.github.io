// Verify the real IndexedDB/Worker boundary using isolated browser storage.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.argv[2] || '_site');
const version = JSON.parse(fs.readFileSync(path.join(root, 'nanpure/version.json'))).version;
const base = `/nanpure/releases/${version}/notebook/`;
const notebook = fs.readFileSync(path.join(root, base, 'index.html'), 'utf8');
const engine = ['core-normal', 'core-unique-solver', 'core-rect', 'core-variants', 'core-multi',
  'common-source', 'generator-source', 'core-mixed-multi'].map(id => {
  const match = notebook.match(new RegExp('<script id="' + id + '">[\\s\\S]*?</script>'));
  assert(match, id); return match[0];
}).join('\n');
const fixture = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + engine +
  ['lan-identity.js', 'pako.min.js', 'compact.js', 'transfer.js', 'storage.js']
    .map(file => `<script src="${base}${file}"></script>`).join('') + '</body></html>';
const types = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json'};
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/storage-test.html') return res.writeHead(200, {'Content-Type': 'text/html'}).end(fixture);
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  try {
    if (!file.startsWith(root + path.sep)) throw Error('outside root');
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'}).end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_BIN || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const context = await browser.newContext({serviceWorkers: 'block'}), page = await context.newPage(), errors = [], workers = [];
    await context.route('**/*', route => route.request().url().startsWith(origin + '/')
      ? route.continue() : route.fulfill({status: 204, body: ''}));
    page.on('pageerror', error => errors.push(error.message)); page.on('worker', worker => workers.push(worker.url()));
    await page.goto(origin + '/storage-test.html');
    const result = await page.evaluate(async () => {
      const check = (value, message) => { if (!value) throw Error(message); };
      const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message);
      const clone = value => JSON.parse(JSON.stringify(value));
      const request = q => new Promise((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
      const raw = async (store, key) => { const db = await request(indexedDB.open('nanpure-chou-data'));
        try { return await request(db.transaction(store).objectStore(store).get(key)); } finally { db.close(); } };
      const large = seed => {
        const sizes = Array(60).fill(9), links = sizes.slice(1).map((_, i) => ({parent: i, corner: 'se'}));
        const p = NanpureMulti.generateMixed('custom', sizes, 1, seed, null, 20000, links);
        p.uid = seed; p.created = 1793808000000; p.memo = '生成前のメモ'; NP.sanitizeProgress(p); NP.validate(p); return p;
      };
      await NPStorage.open(); let failures = 0; NPStorage.onError = () => failures++;
      const p = large('storage-worker'), expected = clone(p), digest = NPTransfer.digest(p), packed = NPCompact.record(p);
      const pending = NPStorage.saveGenerated(p, {token: 'storage', cursor: 1});
      p.uid = 'mutated-after-save'; p.memo = '後の変更'; p.puzzle[0] = p.puzzle[0] ? 0 : p.solution[0]; p.notes[0] = [9];
      const summary = await pending;
      check(summary.uid === expected.uid && summary._npDigest === digest, 'snapshot identity');
      same(await NPStorage.get(expected.uid), expected, 'save captures the entire original row');
      same(summary, NPStorage.summary(expected), 'worker summary equals legacy summary');
      const stored = await raw('puzzles', expected.uid);
      check(stored.data.length === packed.data.length && stored.data.every((v, i) => v === packed.data[i]), 'byte-identical record');
      check(await NPStorage.saveGenerated({...expected, uid: 'duplicate'}, {token: 'storage', cursor: 99}) === null, 'duplicate is rejected');
      check(NPStorage.meta.getItem('nanpure-generation-progress-v2') === JSON.stringify({token: 'storage', cursor: 1}), 'duplicate does not advance progress');
      const second = large('storage-queued');
      const queued = await Promise.all([NPStorage.saveGenerated(second, {token: 'storage', cursor: 2}),
        NPStorage.saveGenerated({...second, uid: 'queued-duplicate'}, {token: 'storage', cursor: 3})]);
      check(queued[0]?.uid === second.uid && queued[1] === null, 'queued duplicate is checked after the previous commit');
      check(NPStorage.library.length === 2, 'only unique rows become visible');
      check(NPStorage.meta.getItem('nanpure-generation-progress-v2') === JSON.stringify({token: 'storage', cursor: 2}), 'queued duplicate preserves progress');
      const third = large('storage-failed'), thirdDigest = NPTransfer.digest(third);
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'summaries' && args[0].uid === third.uid) throw Error('injected quota failure');
        return put.apply(this, args);
      };
      let rejected = false;
      try { await NPStorage.saveGenerated(third, {token: 'storage', cursor: 3}); } catch { rejected = true; }
      finally { IDBObjectStore.prototype.put = put; }
      check(rejected && failures === 1, 'failed transaction is reported once');
      check(await raw('puzzles', third.uid) === undefined && await raw('summaries', third.uid) === undefined, 'record and summary roll back together');
      check(await raw('seen', thirdDigest) === undefined && !NPStorage.hasDigest(thirdDigest), 'failure does not add duplicate history');
      check(NPStorage.meta.getItem('nanpure-generation-progress-v2') === JSON.stringify({token: 'storage', cursor: 2}), 'failure does not advance progress');
      check((await NPStorage.saveGenerated(third, {token: 'storage', cursor: 3}))?.uid === third.uid, 'retry succeeds after transaction failure');
      const fourth = large('storage-fallback'), originalFourth = clone(fourth), NativeWorker = window.Worker;
      window.Worker = undefined;
      let fallback;
      try { fallback = NPStorage.saveGenerated(fourth, {token: 'storage', cursor: 4}); fourth.memo = '後の変更'; }
      finally { window.Worker = NativeWorker; }
      check((await fallback)?.uid === originalFourth.uid, 'unsupported worker fallback saves');
      same(await NPStorage.get(originalFourth.uid), originalFourth, 'fallback retains the captured row');
      const result = {rows: NPStorage.library.map(row => ({uid: row.uid, digest: row._npDigest})),
        progress: NPStorage.meta.getItem('nanpure-generation-progress-v2'), failures, cells: expected.puzzle.length};
      await NPStorage.flush(); NPStorage.close(); return result;
    });
    assert.equal(result.rows.length, 4); assert(result.cells > 4096);
    assert(workers.length >= 6 && workers.every(url => url.endsWith('/storage-prepare-worker.js')));
    await page.reload();
    const persisted = await page.evaluate(async () => {
      await NPStorage.open(); const rows = [];
      for (const summary of NPStorage.library) {
        const row = await NPStorage.get(summary.uid); NP.validate(row);
        rows.push({uid: row.uid, digest: NPTransfer.digest(row), summaryDigest: summary._npDigest});
      }
      const progress = NPStorage.meta.getItem('nanpure-generation-progress-v2'); NPStorage.close(); return {rows, progress};
    });
    // Fixtures deliberately share one creation timestamp; IndexedDB key order
    // can break that tie differently from insertion order without losing data.
    const byUid = (a, b) => a.uid.localeCompare(b.uid);
    assert.deepEqual(persisted.rows.map(({uid, digest}) => ({uid, digest})).sort(byUid), result.rows.slice().sort(byUid));
    assert(persisted.rows.every(row => row.digest === row.summaryDigest));
    assert.equal(persisted.progress, result.progress); assert.deepEqual(errors, []);
    console.log('PASS generated storage in Chromium: real Worker and legacy bytes, capture isolation, queued duplicates, atomic record/summary/history/progress rollback, retry, Worker fallback, reload, validation and digest equality.');
    await context.close();
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
