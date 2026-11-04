import {legacyProfile} from './profiles.js';

const dependencies = ['variants.js', 'expansion.js', 'multi.js', 'linked.js', 'common.js', 'mixed-multi.js',
  'lan-identity.js', 'pako.min.js', 'compact.js', 'transfer.js', 'storage.js'];
let loading;

async function loadNotebook() {
  if (!loading) {
    loading = (async () => {
      const response = await fetch('/nanpure/version.json', {cache: 'no-store'});
      if (!response.ok) throw new Error('問題帳の情報を読み込めませんでした。');
      const {version} = await response.json();
      if (typeof version !== 'string' || !/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version)) {
        throw new Error('問題帳のバージョンを確認できませんでした。');
      }
      const path = '/nanpure/releases/' + version + '/notebook/';
      for (const file of dependencies) {
        const script = document.createElement('script');
        script.src = path + file;
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error('問題帳の保存機能を読み込めませんでした。'));
          document.head.append(script);
        });
      }
    })().catch(error => {
      loading = undefined;
      throw error;
    });
  }
  await loading;
}

function asNotebookPuzzle(puzzle, profile) {
  if (!puzzle || puzzle.kind !== profile.kind || puzzle.n !== profile.n || puzzle.level !== profile.level ||
      (puzzle.complexity || 0) !== (profile.complexity || 0) ||
      (puzzle.linked?.shape || puzzle.multiShape || '') !== (profile.multiShape || profile.linkedShape || '')) {
    throw new Error('申し込んだ問題のルールや難易度を確認できませんでした。');
  }
  if (profile.profile === legacyProfile.profile && (puzzle.rating?.level !== 18 ||
      !puzzle.rating.unique || !puzzle.rating.noGuess || !Array.isArray(puzzle.logicProof) || !puzzle.logicProof.length)) {
    throw new Error('至高の問題の解法の記録を確認できませんでした。');
  }
  const {id, uid, puzzle: givens} = puzzle;
  if (typeof id !== 'string' || typeof uid !== 'string' || id.length < 1 || uid.length < 1 ||
      id.length > 128 || uid.length > 180) {
    throw new Error('問題番号を確認できませんでした。');
  }
  const entry = Object.fromEntries(Object.entries(puzzle).filter(([key]) => !key.startsWith('_np')));
  Object.assign(entry, {created: Date.now(), elapsed: 0, completed: false, grid: givens?.slice(), notes: {}});
  window.NP.validate(entry);
  return entry;
}

function openReceiptDatabase() {
  return new Promise((resolve, reject) => {
    const query = indexedDB.open('nanpure-chou-data');
    query.onerror = () => reject(query.error);
    query.onsuccess = () => resolve(query.result);
  });
}

// Each receipt is at most ten rows. Read only its UID and digest keys, in the
// same transaction that inserts new records, so concurrent replays are safe.
function insertReceipt(db, rows) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['puzzles', 'summaries', 'seen'], 'readwrite');
    const puzzles = tx.objectStore('puzzles');
    const summaries = tx.objectStore('summaries');
    const seen = tx.objectStore('seen');
    let saved = 0;
    let failure;
    tx.oncomplete = () => resolve(saved);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('問題帳への保存を完了できませんでした。'));
    function next(index) {
      if (index >= rows.length) return;
      const {record, summary} = rows[index];
      const digest = summary._npDigest;
      const byUid = summaries.get(summary.uid);
      byUid.onsuccess = () => {
        if (byUid.result) {
          if (byUid.result._npDigest === digest) {
            next(index + 1);
          } else {
            failure = new Error('同じ問題番号が使われています。問題帳の内容を確認してください。');
            tx.abort();
          }
          return;
        }
        const byDigest = seen.getKey(digest);
        byDigest.onsuccess = () => {
          if (byDigest.result === undefined) {
            puzzles.add(record);
            summaries.put(summary);
            seen.add({digest});
            saved++;
          }
          next(index + 1);
        };
      };
    }
    next(0);
  });
}

export async function savePuzzles(puzzles, profile = legacyProfile) {
  if (!Array.isArray(puzzles)) throw new Error('受け取り結果を確認できませんでした。');
  if (puzzles.length > 10) throw new Error('受け取れる問題数を確認できませんでした。');
  if (!puzzles.length) return {saved: 0, total: 0};
  await loadNotebook();
  const {NPStorage: storage, NPTransfer: transfer, NPCompact: compact} = window;
  if (!storage || !transfer || !compact || !window.NP) throw new Error('問題帳の保存機能が起動しませんでした。');
  try {
    await storage.open(false);
    if (storage.meta.getItem('summary-index-v1') !== 'ready') {
      // Existing databases without an index use the notebook's one-time migration.
      storage.close();
      await storage.open();
    }
    const rows = puzzles.map(candidate => {
      const row = asNotebookPuzzle(candidate, profile);
      return {summary: storage.summary(row), record: compact.record(row)};
    });
    const db = await openReceiptDatabase();
    try {
      const saved = await insertReceipt(db, rows);
      return {saved, total: puzzles.length};
    } finally {
      db.close();
    }
  } finally {
    storage.close();
  }
}
