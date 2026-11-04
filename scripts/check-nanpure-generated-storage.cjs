// The worker must keep the old codec/digest, and every fallback must save the
// snapshot captured at invocation rather than a later edit of the caller's row.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), {webcrypto} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'nanpure/version.json'))).version;
const base = path.join(root, 'nanpure/releases', version, 'notebook');
const sourceBase = path.join(root, 'scripts/client-overrides/public/notebook');
const read = name => fs.readFileSync(path.join(
  ['storage.js', 'storage-prepare-worker.js', 'transfer.js'].includes(name) ? sourceBase : base, name), 'utf8');
const globals = {TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, URL,
  btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary')};
function codec(crypto = webcrypto) {
  const g = {...globals, crypto}; g.self = g;
  const context = vm.createContext(g);
  for (const file of ['pako.min.js', 'compact.js', 'lan-identity.js', 'transfer.js']) vm.runInContext(read(file), context);
  return {g, context};
}
const plain = value => JSON.parse(JSON.stringify(value));
const original = {uid: 'save-fixture', id: 'STORAGE', kind: 'normal', n: 100, level: 2,
  created: 1793808000000, puzzle: Array.from({length: 10000}, (_, i) => i % 101),
  solution: Array.from({length: 10000}, (_, i) => i % 100 + 1),
  grid: Array.from({length: 10000}, (_, i) => i % 101), notes: {0: [1, 2]}, memo: '手順・🧩',
  rating: {level: 2, proof: [{cell: 0, values: [1, 2]}]}, elapsed: 12, completed: false};
async function runWorker(text, crypto = webcrypto, failCodec = false) {
  const {g, context} = codec(crypto);
  g.importScripts = (...files) => files.forEach(file => vm.runInContext(read(file), context));
  g.postMessage = value => { g.result = value; };
  vm.runInContext(read('storage-prepare-worker.js'), context);
  if (failCodec) g.NPCompact.zip = () => { throw Error('injected codec failure'); };
  await g.onmessage({data: text});
  return g.result;
}
async function checkGeneratedSaveRetry(project) {
  const source = fs.readFileSync(path.join(project, 'scripts/client-overrides/public/notebook/app.js'), 'utf8');
  function section(start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert(a >= 0 && b > a, 'application save helper source is present');
    return source.slice(a, b);
  }
  const helpers = section('async function saveGeneratedRow(', 'function pruneSavedCatalogRow(');
  const save = section('function De(', 'function qe(');
  const results = [];
  for (const preDirty of [false, true]) {
    const context = vm.createContext({preDirty, window: {}});
    const rows = await vm.runInContext(`
      let J = preDirty, n, catalogWrites = 0;
      let x = preDirty ? [{uid: 'earlier-edit'}] : [];
      const S = {flow: 'create'};
      const catalogDirty = new Set(preDirty ? ['earlier-edit'] : []);
      const writes = [];
      let attempts = 0;
      const e = {
        saveGenerated: async p => {
          if (!attempts++) throw Error('injected quota failure');
          writes.push(p.uid);
          return {_npSummary: 1, uid: p.uid};
        },
        save: async rows => {
          if (!attempts++) throw Error('injected quota failure');
          writes.push(...rows.map(p => p.uid));
        },
        hasDigest: () => false
      };
      const NPTransfer = {digest: () => ''};
      function Te(flag) { J = flag; }
      function pruneSavedCatalogRow() {}
      ${save}
      ${helpers}
      (async () => {
        const results = [];
        for (const uid of ['failed-first', 'successful-retry']) {
          let ok, error;
          try { ok = await saveGeneratedRow({uid}, null); }
          catch (e) { error = e.message; }
          results.push({uid, ok, error, J, dirty: [...catalogDirty], visible: x.map(p => p.uid), writes: [...writes], pending: catalogWrites});
        }
        return results;
      })()
    `, context);
    const [failed, retried] = JSON.parse(JSON.stringify(rows));
    assert(failed.error && /保存できなかった/.test(failed.error), 'initial save failure is reported');
    assert.equal(failed.J, preDirty, 'previous unsaved state remains unchanged');
    assert.deepEqual(failed.dirty, preDirty ? ['earlier-edit'] : [], 'discarded generated UID must not poison later saves');
    assert.deepEqual(failed.visible, preDirty ? ['earlier-edit'] : [], 'failed generated row is not presented as saved');
    assert.deepEqual(failed.writes, []);
    assert.equal(failed.pending, 0);
    assert.equal(retried.ok, true, 'a successful retry must remain successful in the UI');
    assert.equal(retried.error, undefined);
    assert.equal(retried.J, false);
    assert.deepEqual(retried.dirty, []);
    assert.deepEqual(retried.visible, preDirty ? ['successful-retry', 'earlier-edit'] : ['successful-retry']);
    assert.deepEqual(retried.writes, retried.visible, 'visible saved rows match committed rows');
    assert.equal(retried.pending, 0);
    results.push({preDirty, failed, retried});
  }
  return results;
}
(async () => {
  const legacy = codec().g, text = JSON.stringify(original), expected = legacy.NPCompact.record(original);
  const expectedDigest = legacy.NPTransfer.digest(original);
  for (const [mode, crypto] of [['native', webcrypto], ['unavailable', null],
    ['rejected', {subtle: {digest: async () => { throw Error('blocked'); }}}]]) {
    const result = await runWorker(text, crypto);
    assert.equal(result.digest, expectedDigest, mode + ' digest unchanged');
    assert.deepEqual(Buffer.from(result.record.data), Buffer.from(expected.data), mode + ' byte-identical codec');
    assert.deepEqual(plain(legacy.NPCompact.restore(result.record)), original, mode + ' full record roundtrip');
  }
  assert.equal((await runWorker('{bad')).error.includes('JSON'), true);
  assert.equal((await runWorker(text, webcrypto, true)).error, 'injected codec failure');
  for (const value of [original,
    {kind: 'jigsaw', n: 4, puzzle: [0, 1, 2], regions: ['b', 'a', 'b'], clues: [{text: 'é🧩', cell: 0}]},
    {kind: 'killer', n: 9, puzzle: [0, 1], cages: [{sum: 3, cells: [2, 1]}, {sum: 1, cells: [0]}]},
    {kind: 'multi', n: 9, puzzle: [1, 0], linked: {shape: 'custom', boards: [{n: 9, y: 0, x: 0, map: [0, 1]}]}}]) {
    assert.equal(await legacy.NPTransfer.digestAsync(value), legacy.NPTransfer.digest(value), 'native digest canonical equality');
  }
  const storageSource = read('storage.js').replace('g.NPStorage = api;', 'g.NPStorage = api; g.__prepareGenerated = prepareGenerated;');
  for (const mode of ['success', 'unavailable', 'constructor', 'clone', 'error', 'messageerror', 'message',
    'wronguid', 'wrongdigest', 'wrongrecord', 'timeout']) {
    const {g, context} = codec(); let terminated = 0, timer, instance, fallback = 0;
    const zip = g.NPCompact.zip;
    g.NPCompact.zip = value => { fallback++; return zip(value); };
    g.document = {currentScript: {src: 'https://example.test/notebook/storage.js'}};
    g.NP = {label: row => `${row.n}×${row.n} / ${row.level}`};
    g.setTimeout = fn => { timer = fn; return 1; }; g.clearTimeout = () => {};
    class TestWorker {
      constructor(url) {
        assert.equal(url, 'https://example.test/notebook/storage-prepare-worker.js');
        if (mode === 'constructor') throw Error('blocked'); instance = this;
      }
      terminate() { terminated++; }
      postMessage(value) {
        if (mode === 'clone') throw Error('clone failure');
        if (mode === 'timeout') return;
        queueMicrotask(async () => {
          if (mode === 'error') return this.onerror({preventDefault() {}});
          if (mode === 'messageerror') return this.onmessageerror();
          if (mode === 'message') return this.onmessage({data: {error: 'worker failed'}});
          const result = await runWorker(value);
          if (mode === 'wronguid') result.record.uid = 'wrong';
          if (mode === 'wrongdigest') result.digest = 'wrong';
          if (mode === 'wrongrecord') result.record.data = 'wrong';
          this.onmessage({data: result});
        });
      }
    }
    g.Worker = mode === 'unavailable' ? undefined : TestWorker;
    vm.runInContext(storageSource, context);
    const row = plain(original), pending = g.__prepareGenerated(row);
    row.uid = 'edited'; row.puzzle[0] = 100; row.memo = 'changed after invocation'; row.notes[0].push(9);
    if (mode === 'timeout') timer();
    const prepared = await pending;
    assert.equal(prepared.summary.uid, original.uid, mode + ' captured summary');
    assert.equal(prepared.summary.memo, original.memo, mode + ' captured metadata');
    assert.equal(prepared.summary._npDigest, expectedDigest, mode + ' captured digest');
    assert.deepEqual(plain(g.NPCompact.restore(prepared.record)), original, mode + ' captured full record');
    assert.equal(fallback, mode === 'success' ? 0 : 1, mode + ' fallback count');
    assert.equal(terminated, ['unavailable', 'constructor'].includes(mode) ? 0 : 1, mode + ' worker cleanup');
    if (instance) { instance.onmessage({data: {error: 'late'}}); instance.onerror({preventDefault() {}}); }
    assert.equal(fallback, mode === 'success' ? 0 : 1, mode + ' late events ignored');
    assert.equal(g.NPStorage.summary(original, 123)._npDigest, expectedDigest, 'public summary ignores map index');
  }
  await checkGeneratedSaveRetry(root);
  console.log('PASS generated storage: byte-identical legacy records, native/fallback canonical digests, immutable capture, 11 worker/fallback paths, late events, cleanup, summary callback compatibility, and failed-save retry with/without existing unsaved edits.');
})().catch(error => { console.error(error); process.exitCode = 1; });
