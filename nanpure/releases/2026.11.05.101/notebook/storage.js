(function (g) {
  'use strict';
  const DB = 'nanpure-chou-data', VERSION = 3, INDEX = 'summaries';
  const READY = 'summary-index-v1', LEGACY = 'nanpure-chou-library-v2';
  const PROGRESS = 'nanpure-generation-progress-v2';
  const editable = ['favorite','memo','printedAt','lastOpened'];
  const prepareWorkerURL = typeof document !== 'undefined' && document.currentScript?.src
    ? new URL('storage-prepare-worker.js', document.currentScript.src).href : null;
  let db, queue = Promise.resolve(), last = queue, meta = new Map(), ids = new Set();
  let seen = new Set(), exported = new Set(), signatures = new Map();
  const api = {library: [], onError: null, onProgress: null, lazy: true};
  const copy = value => JSON.parse(JSON.stringify(value));
  const summaryRow = row => row?._npSummary === 1;
  const signature = row => JSON.stringify(editable.map(key => row[key]));
  const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
  function unpack(row) {
    if (row.compactVersion) return g.NPCompact.restore(row);
    const result = {...row};
    for (const key of ['puzzle','solution','grid']) {
      if (ArrayBuffer.isView(result[key])) result[key] = Array.from(result[key]);
    }
    return result;
  }
  function pack(row) {
    if (summaryRow(row)) throw Error('一覧だけでは問題本体を保存できません。');
    return g.NPCompact.record(row);
  }
  function summarize(row, digest) {
    if (summaryRow(row)) return row;
    const result = {_npSummary: 1};
    for (const [key, value] of Object.entries(row)) {
      if (!key.startsWith('_np') && (value === null || ['string','number','boolean'].includes(typeof value))) result[key] = value;
    }
    if (row.rating) result.rating = Object.fromEntries(Object.entries(row.rating).filter(([,v]) => ['string','number','boolean'].includes(typeof v)));
    result._npLabel = g.NP.label(row);
    result._npDigest = digest === undefined ? g.NPTransfer.digest(row) : digest;
    result._npIdentity = result._npDigest;
    if (row.video) result.video = copy(Object.fromEntries(Object.entries(row.video).filter(([key]) => !['credited','groups'].includes(key))));
    if (row.multiSizes) result.multiSizes = [...row.multiSizes];
    if (row.linked) result.linked = {shape: row.linked.shape, width: row.linked.width,
      height: row.linked.height, links: row.linked.links ? copy(row.linked.links) : undefined, boards: row.linked.boards.map(({n,x,y,rule}) => ({n,x,y,...(rule ? {rule} : {})}))};
    // A small thumbnail contains no answer, notes, proof, or in-progress grid.
    if (row.n <= 25 && row.puzzle.length <= 625) {
      const preview = {};
      for (const key of ['kind','n','puzzle','regions','cages','links','steps','crosses',
        'clues','linked','multiVersion','linkedVersion','kropkiMode']) {
        if (row[key] !== undefined) preview[key] = row[key];
      }
      result._npPreview = g.NPCompact.meta(JSON.stringify(preview));
    }
    return result;
  }
  function encodeMeta(key, value) {
    if (value.length > 256) {
      const packed = g.NPCompact.meta(value);
      if (packed.length < value.length) return {key, value: packed, compactVersion: 1};
    }
    return {key, value};
  }
  const decodeMeta = row => row.compactVersion ? g.NPCompact.unmeta(row.value) : row.value;
  function request(store, method, ...args) {
    return new Promise((resolve, reject) => {
      const q = db.transaction(store).objectStore(store)[method](...args);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
  }
  function write(stores, fn) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(stores, 'readwrite');
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || Error('保存を完了できませんでした。'));
        tx.onerror = () => {};
        fn(tx);
      } catch (error) { try { tx?.abort(); } catch {} reject(error); }
    });
  }
  function enqueue(fn) {
    const task = queue.then(fn);
    queue = task.catch(error => api.onError?.(error));
    last = task;
    task.catch(() => {});
    return task;
  }
  async function migrate() {
    if (meta.get(READY) === 'ready') return;
    // Keep original puzzle records untouched. Index in bounded transactions so a
    // failed or interrupted migration can restart without losing a single puzzle.
    await write([INDEX], tx => tx.objectStore(INDEX).clear());
    const total = await request('puzzles', 'count');
    let after, count = 0, finished = false;
    while (!finished) {
      const digests = [];
      await write(['puzzles', INDEX, 'seen'], tx => {
        let batch = 0;
        const q = tx.objectStore('puzzles').openCursor(after === undefined ? null : IDBKeyRange.lowerBound(after, true));
        q.onsuccess = () => {
          const cursor = q.result;
          if (!cursor) { finished = true; return; }
          try {
            const row = summarize(unpack(cursor.value));
            tx.objectStore(INDEX).put(row);
            if (!seen.has(row._npDigest)) tx.objectStore('seen').put({digest: row._npDigest});
            digests.push(row._npDigest);
            after = cursor.key;
            count++; batch++;
            if (batch < 50) cursor.continue();
          } catch (error) { tx.abort(); }
        };
      });
      digests.forEach(digest => seen.add(digest));
      api.onProgress?.({count, total});
      await yieldTask();
    }
    await write(['meta'], tx => tx.objectStore('meta').put({key: READY, value: 'ready'}));
    meta.set(READY, 'ready');
  }
  api.open = async function (withLibrary = true) {
    installCatalogConsumers();
    db = await new Promise((resolve, reject) => {
      let cancelled = false;
      const q = indexedDB.open(DB, VERSION);
      q.onupgradeneeded = () => {
        if (cancelled) { q.transaction.abort(); return; }
        for (const [name, keyPath] of [['puzzles','uid'],['meta','key'],['seen','digest'],[INDEX,'uid']]) {
          if (!q.result.objectStoreNames.contains(name)) q.result.createObjectStore(name, {keyPath});
        }
      };
      q.onsuccess = () => { if (cancelled) q.result.close(); else resolve(q.result); };
      q.onerror = () => reject(q.error);
      q.onblocked = () => { cancelled = true; reject(Error('ほかのナンプレ帳のタブを閉じてから、もう一度開いてください。')); };
    });
    db.onversionchange = () => db.close();
    meta = new Map((await request('meta', 'getAll')).map(row => [row.key, decodeMeta(row)]));
    const history = withLibrary ? await request('seen', 'getAll') : [];
    seen = new Set(history.map(row => row.digest));
    exported = new Set(history.filter(row => row.exported).map(row => row.digest));
    if (!meta.has('migration-v1')) {
      const text = g.localStorage.getItem(LEGACY), rows = text ? JSON.parse(text) : [];
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row.uid !== 'string' || !row.puzzle || !row.solution)) {
        throw Error('以前の保存データを確認できません。元のデータは消していません。');
      }
      const settings = ['nanpure-generation-queue-v1','nanpure-bulk-options-v1','nanpure-print-job-v2']
        .map(key => [key, g.localStorage.getItem(key)]).filter(([,value]) => value !== null);
      await write(['puzzles','meta'], tx => {
        for (const row of rows) tx.objectStore('puzzles').put(pack(row));
        for (const [key, value] of settings) tx.objectStore('meta').put(encodeMeta(key, value));
        tx.objectStore('meta').put({key: 'migration-v1', value: 'done'});
      });
      meta.set('migration-v1', 'done');
      for (const [key, value] of settings) meta.set(key, value);
      for (const key of [LEGACY, ...settings.map(([key]) => key)]) try { g.localStorage.removeItem(key); } catch {}
    }
    if (withLibrary) {
      await migrate();
      api.library = (await request(INDEX, 'getAll')).sort((a,b) => (b.created || 0) - (a.created || 0));
    } else api.library = [];
    ids = new Set(api.library.map(row => row.uid));
    signatures = new Map(api.library.map(row => [row.uid, signature(row)]));
    return api;
  };
  api.meta = {
    getItem: key => meta.has(key) ? meta.get(key) : null,
    setItem(key, value) {
      value = String(value); meta.set(key, value);
      enqueue(() => write(['meta'], tx => tx.objectStore('meta').put(encodeMeta(key, value))));
    },
    removeItem(key) {
      meta.delete(key);
      enqueue(() => write(['meta'], tx => tx.objectStore('meta').delete(key)));
    }
  };
  async function commitRows(rows, settings, retained = null) {
    const committed = [];
    await write(['puzzles', INDEX, 'meta', 'seen'], tx => {
      function put(row) {
        const summary = row._npPrepared ? row.summary : summarize(row);
        tx.objectStore('puzzles').put(row._npPrepared ? row.record : pack(row));
        tx.objectStore(INDEX).put(summary);
        if (!seen.has(summary._npDigest)) {
          const history = tx.objectStore('seen'), q = history.get(summary._npDigest);
          q.onsuccess = () => { if (!q.result) history.put({digest: summary._npDigest}); };
        }
        committed.push(summary);
      }
      for (const row of rows) {
        if (summaryRow(row)) {
          if (signature(row) === signatures.get(row.uid)) continue;
          const q = tx.objectStore('puzzles').get(row.uid);
          q.onsuccess = () => {
            try {
              if (!q.result) throw Error('保存した問題が見つかりません。');
              const full = unpack(q.result);
              for (const key of editable) {
                if (row[key] === undefined) delete full[key]; else full[key] = row[key];
              }
              put(full);
            } catch (error) { tx.abort(); }
          };
        } else put(row);
      }
      if (retained) for (const uid of ids) if (!retained.has(uid)) {
        tx.objectStore('puzzles').delete(uid); tx.objectStore(INDEX).delete(uid);
      }
      for (const [key, value] of Object.entries(settings || {})) {
        if (value === null) tx.objectStore('meta').delete(key);
        else tx.objectStore('meta').put(encodeMeta(key, String(value)));
      }
    });
    if (retained) {
      ids = retained;
      api.library = api.library.filter(row => retained.has(row.uid));
      for (const uid of signatures.keys()) if (!retained.has(uid)) signatures.delete(uid);
    }
    const library = api.library.slice();
    for (const row of committed) {
      ids.add(row.uid); seen.add(row._npDigest); signatures.set(row.uid, signature(row));
      const i = library.findIndex(item => item.uid === row.uid);
      if (i < 0) library.unshift(row); else library[i] = row;
    }
    api.library = library;
    for (const [key, value] of Object.entries(settings || {})) {
      if (value === null) meta.delete(key); else meta.set(key, String(value));
    }
  }
  api.save = function (library, current, progress) {
    const rows = (current ? [current] : library).map(prepare);
    const retained = current ? null : new Set(library.map(row => row.uid));
    const settings = progress ? {[PROGRESS]: JSON.stringify(progress)} : {};
    return enqueue(() => commitRows(rows, settings, retained));
  };
  // Generation owns this snapshot until it is committed. Check its digest only
  // once, in the same queue as the write, so a duplicate never advances the job.
  // Prepared records stay private; callers cannot supply a cached digest/record.
  api.saveGenerated = function (row, progress) {
    if (summaryRow(row)) throw Error('一覧だけでは問題本体を保存できません。');
    const snapshot = prepareGenerated(row);
    snapshot.catch(() => {});
    const settings = progress ? {[PROGRESS]: JSON.stringify(progress)} : {};
    return enqueue(async () => {
      const prepared = await snapshot;
      if (seen.has(prepared.summary._npDigest)) return null;
      await commitRows([prepared], settings);
      return prepared.summary;
    });
  };
  api.commit = function (rows, settings) {
    const snapshot = rows.map(prepare), values = {...settings};
    return enqueue(() => commitRows(snapshot, values));
  };
  function prepare(row) {
    if (summaryRow(row)) return copy(row);
    // Capture the edit immediately, without retaining full board copies in the write queue.
    return {_npPrepared: true, record: pack(row), summary: summarize(row)};
  }
  function prepareGenerated(row) {
    // Avoid starting a worker for ordinary small puzzles. Their compression and
    // fingerprint are cheap, and the one prepared result still serves both uses.
    if (row.puzzle.length <= 4096) return Promise.resolve(prepare(row));
    // Capture immediately, like save(). Later edits must not change an enqueued
    // save, including when a worker fails and the synchronous codec is used.
    const text = JSON.stringify(row), summary = summarize(row, '');
    return new Promise((resolve, reject) => {
      let worker, timer, finished = false;
      const cleanup = () => { clearTimeout(timer); worker?.terminate(); };
      const result = (record, digest) => {
        summary._npDigest = summary._npIdentity = digest;
        resolve({_npPrepared: true, record, summary});
      };
      const fallback = () => {
        if (finished) return;
        finished = true; cleanup();
        Promise.resolve().then(async () => {
          const captured = JSON.parse(text);
          const digest = g.NPTransfer.digestAsync ? await g.NPTransfer.digestAsync(captured) : g.NPTransfer.digest(captured);
          // This is exactly the existing record codec, applied to the captured
          // JSON instead of serializing a possibly edited original a second time.
          result({uid: captured.uid, compactVersion: 1, data: g.NPCompact.zip(text)}, digest);
        }).catch(reject);
      };
      if (!prepareWorkerURL || typeof g.Worker !== 'function') { fallback(); return; }
      try {
        worker = new g.Worker(prepareWorkerURL);
        worker.onmessage = event => {
          if (finished) return;
          const value = event.data;
          if (!value || value.record?.uid !== summary.uid || value.record?.compactVersion !== 1 ||
            !(value.record.data instanceof Uint8Array) || !value.record.data.length ||
            typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)) { fallback(); return; }
          finished = true; cleanup(); result(value.record, value.digest);
        };
        worker.onerror = event => { event.preventDefault?.(); fallback(); };
        worker.onmessageerror = fallback;
        timer = setTimeout(fallback, 60000);
        worker.postMessage(text);
      } catch { fallback(); }
    });
  }
  api.get = async uid => {
    await last;
    const row = await request('puzzles', 'get', uid);
    return row ? unpack(row) : null;
  };
  api.materialize = async rows => {
    await last;
    const result = [];
    for (const row of rows) {
      const full = summaryRow(row) ? await api.get(row.uid) : row;
      if (!full) throw Error('保存した問題が見つかりません。');
      result.push(full);
    }
    return result;
  };
  api.summary = row => summarize(row);
  api.isSummary = summaryRow;
  api.identity = row => summaryRow(row) ? row._npIdentity : g.NPTransfer.sha256(g.NPLanIdentity(row));
  api.historyDigests = () => Array.from(seen);
  api.hasDigest = digest => seen.has(digest);
  api.wasExported = digest => exported.has(digest);
  api.mergeHistory = values => {
    const digests = g.NPTransfer.readHistory(g.NPTransfer.history(values));
    return enqueue(async () => {
      const added = digests.filter(digest => !seen.has(digest));
      if (added.length) await write(['seen'], tx => {
        for (const digest of added) {
          const store = tx.objectStore('seen'), q = store.get(digest);
          q.onsuccess = () => { if (!q.result) store.put({digest}); };
        }
      });
      added.forEach(digest => seen.add(digest)); return added.length;
    });
  };
  api.confirmExport = values => {
    const digests = g.NPTransfer.readHistory(g.NPTransfer.history(values));
    return enqueue(async () => {
      await write(['seen'], tx => { for (const digest of digests) tx.objectStore('seen').put({digest, exported: true}); });
      digests.forEach(digest => { seen.add(digest); exported.add(digest); });
    });
  };
  api.archive = rows => {
    const selection = rows.map(row => ({uid: row.uid, digest: g.NPTransfer.digest(row)}));
    return enqueue(async () => {
      if (selection.some(row => !exported.has(row.digest))) throw Error('保存ファイルの照合が必要です。');
      await write(['puzzles', INDEX, 'seen'], tx => {
        for (const row of selection) {
          const q = tx.objectStore('puzzles').get(row.uid);
          q.onsuccess = () => {
            try {
              if (!q.result) return;
              if (g.NPTransfer.digest(unpack(q.result)) !== row.digest) throw Error('問題が変更されています。');
              tx.objectStore('puzzles').delete(row.uid); tx.objectStore(INDEX).delete(row.uid);
              tx.objectStore('seen').put({digest: row.digest, exported: true});
            } catch (error) { tx.abort(); }
          };
        }
      });
      const removed = new Set(selection.map(row => row.uid));
      removed.forEach(uid => { ids.delete(uid); signatures.delete(uid); });
      api.library = api.library.filter(row => !removed.has(row.uid));
      return selection.length;
    });
  };
  api.flush = () => last;
  api.close = () => db?.close();
  // These two existing synchronous consumers operate on the light catalog too.
  let consumersInstalled = false;
  function installCatalogConsumers() {
    if (consumersInstalled) return;
    const label = g.NP.label, digest = g.NPTransfer.digest;
    g.NP.label = row => summaryRow(row) ? row._npLabel : label(row);
    g.NPTransfer.digest = row => summaryRow(row) ? row._npDigest : digest(row);
    consumersInstalled = true;
  }
  g.NPStorage = api;
})(typeof window !== 'undefined' ? window : globalThis);
