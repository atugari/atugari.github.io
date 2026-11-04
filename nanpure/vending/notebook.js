const dependencies = ['common.js', 'lan-identity.js', 'pako.min.js', 'compact.js', 'transfer.js', 'storage.js'];
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

function asNotebookPuzzle(puzzle) {
  if (!puzzle || puzzle.kind !== 'normal' || puzzle.n !== 9 || puzzle.level !== 18 || puzzle.rating?.level !== 18 ||
      !puzzle.rating.unique || !puzzle.rating.noGuess || !Array.isArray(puzzle.logicProof) || !puzzle.logicProof.length) {
    throw new Error('問題のルール、難易度、解法の記録を確認できませんでした。');
  }
  const {kind, n, level, id, uid, puzzle: givens, solution, rating, verification, logicProof, resolutionVersion} = puzzle;
  if (typeof id !== 'string' || typeof uid !== 'string' || id.length < 1 || uid.length < 1 ||
      id.length > 128 || uid.length > 180) {
    throw new Error('問題番号を確認できませんでした。');
  }
  const entry = {
    kind, n, level, id, uid, puzzle: givens, solution, rating, verification, logicProof, resolutionVersion,
    created: Date.now(), elapsed: 0, completed: false, grid: givens?.slice(), notes: {}
  };
  window.NP.validate(entry);
  return entry;
}

export async function savePuzzles(puzzles) {
  if (!Array.isArray(puzzles)) throw new Error('受け取り結果を確認できませんでした。');
  if (!puzzles.length) return {saved: 0, total: 0};
  await loadNotebook();
  const {NPStorage: storage, NPTransfer: transfer} = window;
  if (!storage || !transfer || !window.NP) throw new Error('問題帳の保存機能が起動しませんでした。');
  try {
    await storage.open();
    const current = new Map(storage.library.map(row => [row.uid, row]));
    const digests = new Set(storage.library.map(row => row._npDigest));
    const pending = [];
    for (const candidate of puzzles) {
      const row = asNotebookPuzzle(candidate);
      const digest = transfer.digest(row);
      const existing = current.get(row.uid);
      if (existing && existing._npDigest !== digest) {
        throw new Error('同じ問題番号が使われています。問題帳の内容を確認してください。');
      }
      // A server receipt may be replayed after a timeout. Keep any play in progress.
      if (existing || digests.has(digest)) continue;
      current.set(row.uid, {_npDigest: digest});
      digests.add(digest);
      pending.push(row);
    }
    if (pending.length) await storage.commit(pending, {});
    return {saved: pending.length, total: puzzles.length};
  } finally {
    storage.close();
  }
}
