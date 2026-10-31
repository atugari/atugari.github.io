/* Mixed-size multi Sudoku. The original v1 engine remains available for old saves. */
(function (root) {
  'use strict';
  const multi = root.NanpureMulti, np = root.NP;
  const sizes = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25];
  const counts = {pair: 2, relay: 3, samurai: 5, custom: 0};
  multi.names.custom = "自由配置";
  const original = Object.fromEntries(['layout', 'localUnits', 'setup', 'solve', 'exact', 'completed', 'needsShared', 'validate', 'art'].map(k => [k, multi[k]]));
  const mask = n => (1 << n) - 1;
  const pop = x => { let n = 0; for (; x; x &= x - 1) n++; return n; };
  const single = x => x && !(x & (x - 1));
  const digit = x => 32 - Math.clz32(x);
  const shuffle = (a, rng) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const spec = n => { let rows = Math.floor(Math.sqrt(n)); while (n % rows) rows--; return {n, blockRows: rows, blockCols: n / rows}; };
  function validSizes(shape, values) {
    if (!Object.hasOwn(counts, shape) || !Array.isArray(values) || (shape==='custom' ? values.length<2||values.length>8 : values.length !== counts[shape]) || values.some(n => !sizes.includes(n))) throw Error('各盤面の大きさを選び直してください。');
    return values;
  }
  function layout(shape, values, links) {
    validSizes(shape, values);
    const boards = values.map(spec);
    if (shape === 'custom') {
      if (!Array.isArray(links)) links=values.slice(1).map((_,i)=>({parent:i,corner:'se'}));
      if(links.length!==values.length-1||links.some((l,i)=>!Number.isInteger(l.parent)||l.parent<0||l.parent>i||!['nw','ne','sw','se'].includes(l.corner)))throw Error('つなぐ盤面と角を選び直してください。');
    }
    const overlap = (a, b) => shape==='custom'||values.length>2&&new Set(values).size>1 ? [1,1] : [Math.min(a.blockCols, b.blockCols), Math.min(a.blockRows, b.blockRows)];
    boards[0].x = 0; boards[0].y = 0;
    for (let i = 1; i < boards.length; i++) {
      const b = boards[i], a = boards[shape === 'custom' ? links[i-1].parent : shape === 'samurai' ? 0 : i - 1], [w, h] = overlap(a, b);
      if (shape === 'custom') {
        const c=links[i-1].corner;b.x=c.endsWith('w')?a.x-b.n+w:a.x+a.n-w;b.y=c.startsWith('n')?a.y-b.n+h:a.y+a.n-h;
      } else if (shape === 'samurai') {
        b.x = i === 1 || i === 3 ? a.x - b.n + w : a.x + a.n - w;
        b.y = i <= 2 ? a.y - b.n + h : a.y + a.n - h;
      } else { b.x = a.x + a.n - w; b.y = a.y + a.n - h; }
    }
    if(shape==='custom')for(let i=0;i<boards.length;i++)for(let j=0;j<i;j++) {
      const a=boards[i],b=boards[j],w=Math.min(a.x+a.n,b.x+b.n)-Math.max(a.x,b.x),h=Math.min(a.y+a.n,b.y+b.n)-Math.max(a.y,b.y);
      if(w>0&&h>0&&(j!==links[i-1].parent||w!==1||h!==1))throw Error('盤面が重なりすぎています。つなぐ盤面や角を変えてください。');
    }
    const minX = Math.min(...boards.map(b => b.x)), minY = Math.min(...boards.map(b => b.y));
    const cells = [], indices = new Map();
    for (const b of boards) {
      b.x -= minX; b.y -= minY; b.map = [];
      for (let r = 0; r < b.n; r++) for (let c = 0; c < b.n; c++) {
        const x = b.x + c, y = b.y + r, key = x + ',' + y;
        if (!indices.has(key)) { indices.set(key, cells.length); cells.push({x, y}); }
        b.map.push(indices.get(key));
      }
    }
    return {shape, ...(shape==='custom'?{links:links.map(l=>({parent:l.parent,corner:l.corner}))}:{}), boards, cells, width: Math.max(...boards.map(b => b.x + b.n)), height: Math.max(...boards.map(b => b.y + b.n))};
  }
  function localUnits(b) {
    const units = [], {n, blockRows: h, blockCols: w} = b;
    for (let r = 0; r < n; r++) units.push(b.map.slice(r * n, (r + 1) * n));
    for (let c = 0; c < n; c++) units.push(Array.from({length: n}, (_, r) => b.map[r * n + c]));
    for (let r = 0; r < n; r += h) for (let c = 0; c < n; c += w) units.push(Array.from({length: n}, (_, i) => b.map[(r + Math.floor(i / w)) * n + c + i % w]));
    return units;
  }
  const cached = new WeakMap();
  function setup(linked) {
    if (cached.has(linked)) return cached.get(linked);
    const units = [], seen = new Set(), domains = linked.cells.map(() => mask(25));
    for (const b of linked.boards) {
      for (const i of b.map) domains[i] &= mask(b.n);
      for (const u of localUnits(b)) { const k = u.slice().sort((a, b) => a - b).join(','); if (!seen.has(k)) { seen.add(k); units.push(u); } }
    }
    const members = linked.cells.map(() => []);
    units.forEach((u, j) => u.forEach(i => members[i].push(j)));
    const peers = members.map((m, i) => [...new Set(m.flatMap(j => units[j]))].filter(j => j !== i));
    const result = {units, members, peers, domains, boards: linked.boards}; cached.set(linked, result); return result;
  }
  function solve(p, cap = 4, model = setup(p.linked)) {
    const c = p.puzzle.map((v, i) => v ? (1 << (v - 1)) & model.domains[i] : model.domains[i]);
    let hardest = 1, moves = 0;
    const cut = (i, m) => { const v = c[i] & m; if (v === c[i]) return false; c[i] = v; moves++; return true; };
    for (;;) {
      if (c.some(v => !v)) return {solved: false, bad: true};
      let changed = false;
      for (let i = 0; i < c.length; i++) if (single(c[i])) for (const j of model.peers[i]) changed = cut(j, ~c[i]) || changed;
      if (changed) continue;
      if (c.every(single)) return {solved: true, grid: c.map(digit), hardest, moves};
      if (cap >= 2) {
        for (const u of model.units) for (let d = 0; d < u.length; d++) {
          const bit = 1 << d, places = u.filter(i => c[i] & bit);
          if (!places.length) return {solved: false, bad: true};
          if (places.length === 1) changed = cut(places[0], bit) || changed;
        }
        if (changed) { hardest = Math.max(hardest, 2); continue; }
      }
      if (cap >= 3) {
        for (const u of model.units) {
          const pairs = u.filter(i => pop(c[i]) === 2);
          for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) if (c[pairs[a]] === c[pairs[b]]) for (const i of u) if (i !== pairs[a] && i !== pairs[b]) changed = cut(i, ~c[pairs[a]]) || changed;
          // A digit in one unit must be in the common cells of another unit.
          for (let d = 0; d < u.length; d++) {
            const bit = 1 << d, places = u.filter(i => c[i] & bit);
            if (places.length < 2) continue;
            for (const j of model.members[places[0]]) if (places.every(i => model.members[i].includes(j))) for (const i of model.units[j]) if (!u.includes(i)) changed = cut(i, ~bit) || changed;
          }
        }
        if (changed) { hardest = Math.max(hardest, 3); continue; }
      }
      if (cap >= 4) {
        for (const u of model.units) {
          const small = u.filter(i => pop(c[i]) >= 2 && pop(c[i]) <= 3);
          for (let a = 0; a < small.length; a++) for (let b = a + 1; b < small.length; b++) for (let d = b + 1; d < small.length; d++) {
            const union = c[small[a]] | c[small[b]] | c[small[d]];
            if (pop(union) === 3) for (const i of u) if (i !== small[a] && i !== small[b] && i !== small[d]) changed = cut(i, ~union) || changed;
          }
        }
        for (const board of model.boards) {
          const n = board.n;
          for (let axis = 0; axis < 2; axis++) for (let d = 0; d < n; d++) {
            const bit = 1 << d;
            const lines = Array.from({length: n}, (_, a) => Array.from({length: n}, (_, b) => axis ? board.map[b * n + a] : board.map[a * n + b]).map((i, b) => c[i] & bit ? b : -1).filter(b => b >= 0));
            for (let a = 0; a < n; a++) if (lines[a].length === 2) for (let b = a + 1; b < n; b++) if (lines[b].length === 2 && lines[a].every((v, i) => v === lines[b][i])) for (const q of lines[a]) for (let z = 0; z < n; z++) if (z !== a && z !== b) changed = cut(axis ? board.map[q * n + z] : board.map[z * n + q], ~bit) || changed;
          }
        }
        if (changed) { hardest = 4; continue; }
      }
      return {solved: false, candidates: c, hardest, moves};
    }
  }
  function exact(p, budget = 10000) {
    const model = setup(p.linked), grid = p.puzzle.slice(), used = model.units.map(() => 0), end = Date.now() + budget;
    let count = 0, nodes = 0, timeout = false, solution;
    for (let i = 0; i < grid.length; i++) if (grid[i]) {
      const bit = 1 << (grid[i] - 1);
      if (!(model.domains[i] & bit)) return {count: 0, timeout: false};
      for (const u of model.members[i]) { if (used[u] & bit) return {count: 0, timeout: false}; used[u] |= bit; }
    }
    function visit() {
      if (count >= 2 || timeout) return;
      if (++nodes % 128 === 0 && Date.now() >= end) { timeout = true; return; }
      let at = -1, options = 0, best = 26;
      for (let i = 0; i < grid.length; i++) if (!grid[i]) {
        let m = model.domains[i]; for (const u of model.members[i]) m &= ~used[u];
        const k = pop(m); if (!k) return; if (k < best) { at = i; options = m; best = k; if (k === 1) break; }
      }
      if (at < 0) { count++; if (!solution) solution = grid.slice(); return; }
      for (let m = options; m && count < 2 && !timeout; m &= m - 1) {
        const bit = m & -m; grid[at] = digit(bit);
        for (const u of model.members[at]) used[u] |= bit;
        visit();
        for (const u of model.members[at]) used[u] ^= bit;
        grid[at] = 0;
      }
    }
    visit(); return {count, nodes, timeout, solution};
  }
  function completed(linked, rng) {
    const result = linked.cells.map(() => 0), domains = setup(linked).domains;
    // Restrict shared symbols before filling adjacent boards, including smaller ones.
    for (const b of linked.boards) {
      const {n, blockRows: h, blockCols: w} = b;
      let done = false;
      for (let attempt = 0; attempt < 200 && !done; attempt++) {
        const rows = shuffle(Array.from({length: n / h}, (_, i) => i), rng).flatMap(g => shuffle(Array.from({length: h}, (_, i) => g * h + i), rng));
        const cols = shuffle(Array.from({length: n / w}, (_, i) => i), rng).flatMap(g => shuffle(Array.from({length: w}, (_, i) => g * w + i), rng));
        const base = rows.flatMap(r => cols.map(c => (r * w + Math.floor(r / h) + c) % n + 1)), mapping = new Map(), taken = new Set();
        let ok = true;
        for (let i = 0; i < b.map.length; i++) if (result[b.map[i]]) {
          const v = result[b.map[i]], key = base[i];
          if (v > n || mapping.has(key) && mapping.get(key) !== v || !mapping.has(key) && taken.has(v)) { ok = false; break; }
          mapping.set(key, v); taken.add(v);
        }
        if (!ok) continue;
        const limits = new Map(Array.from({length:n},(_,i)=>[i+1,n]));
        b.map.forEach((i,j)=>limits.set(base[j], Math.min(limits.get(base[j]),digit(domains[i]))));
        if ([...mapping].some(([d,v])=>v>limits.get(d))) continue;
        const owners = new Map([...mapping].map(([d,v])=>[v,d])), fixed = new Set(mapping.keys());
        function match(d, seen) {
          for (const v of shuffle(Array.from({length:limits.get(d)},(_,i)=>i+1),rng)) {
            if (seen.has(v)) continue; seen.add(v);
            const other=owners.get(v);
            if (!other || !fixed.has(other) && match(other,seen)) { owners.set(v,d);mapping.set(d,v);return true; }
          }
          return false;
        }
        const pending=shuffle(Array.from({length:n},(_,i)=>i+1).filter(d=>!fixed.has(d)),rng).sort((a,b)=>limits.get(a)-limits.get(b));
        if (!pending.every(d=>match(d,new Set()))) continue;
        b.map.forEach((i, j) => { result[i] = mapping.get(base[j]); }); done = true;
      }
      if (!done) return null;
    }
    return result;
  }
  function needsShared(p) {
    return p.linked.boards.some(b => {
      const local = {...b, x: 0, y: 0, map: Array.from({length: b.n * b.n}, (_, i) => i)};
      return !solve({puzzle: b.map.map(i => p.puzzle[i]), linked: {cells: local.map, boards: [local]}}, 4).solved;
    });
  }
  function validate(p) {
    if (!p || p.kind !== 'multi' || p.multiVersion !== 2 || !p.linked || !Array.isArray(p.linked.boards)) throw Error('マルチの形式が正しくありません。');
    const ns = p.linked.boards.map(b => b.n), canonical = layout(p.linked.shape, ns, p.linked.links);
    if (p.n !== Math.max(...ns) || JSON.stringify(canonical) !== JSON.stringify(p.linked)) throw Error('マルチの配置が正しくありません。');
    if (!Array.isArray(p.puzzle) || !Array.isArray(p.solution) || p.puzzle.length !== canonical.cells.length || p.solution.length !== canonical.cells.length) throw Error('マルチのマス数が正しくありません。');
    for (const b of canonical.boards) for (const u of localUnits(b)) {
      const values = u.map(i => p.solution[i]);
      if (new Set(values).size !== b.n || values.some(v => !Number.isInteger(v) || v < 1 || v > b.n)) throw Error('各盤面の行・列・枠を確認してください。');
    }
    p.puzzle.forEach((v, i) => { if (!Number.isInteger(v) || v < 0 || v && v !== p.solution[i]) throw Error('問題と答えが一致しません。'); });
    return true;
  }
  function generate(shape, values, level, id, progress, budget = 120000, links) {
    const linked = layout(shape, values, links), model = setup(linked), cap = multi.caps[level - 1];
    if (!Number.isInteger(level) || level < 1 || level > (Math.max(...values)===4?2:5)) throw Error('難易度を選び直してください。');
    const rng = root.NanpureVariants.rngFor('mixed-multi:' + shape + ':' + values.join(',') + ':' + level + ':' + id), end = Date.now() + budget;
    let tries = 0;
    while (Date.now() < end) {
      progress?.('各盤面の大きさ・共有マス・難易度を確認中（' + ++tries + '回目）');
      const solution = completed(linked, rng); if (!solution) continue;
      const p = {kind: 'multi', n: Math.max(...values), level, id, linked, multiVersion: 2, solution, puzzle: solution.slice()};
      const shared = linked.cells.map((_, i) => linked.boards.filter(b => b.map.includes(i)).length > 1);
      let seeded = false;
      for (const b of shuffle(linked.boards, rng)) {
        const sharedDigits=[...new Set(b.map.filter(i => shared[i]).map(i => solution[i]))];
        const ds = shuffle(Array.from({length:b.n},(_,i)=>i+1),rng);
        for (let a = 0; a < ds.length && !seeded; a++) for (let z = a + 1; z < ds.length && !seeded; z++) {
          if(!sharedDigits.includes(ds[a])&&!sharedDigits.includes(ds[z]))continue;
          p.puzzle = solution.slice(); b.map.forEach(i => { if (solution[i] === ds[a] || solution[i] === ds[z]) p.puzzle[i] = 0; });
          seeded = solve(p, cap, model).solved && needsShared(p);
        }
        if (seeded) break;
      }
      if (!seeded) continue;
      let clues = p.puzzle.filter(Boolean).length;
      const target = Math.round(solution.length * (level === 1 ? .65 : level === 2 ? .42 : .23));
      for (const i of shuffle(solution.map((_, i) => i), rng)) {
        if (Date.now() >= end || clues <= target) break;
        if (!p.puzzle[i]) continue;
        p.puzzle[i] = 0;
        if (solve(p, cap, model).solved) clues--; else p.puzzle[i] = solution[i];
      }
      const proof = solve(p, cap, model);
      if (!proof.solved || level <= 2 && clues !== target || level >= 3 && solve(p, cap - 1, model).solved || !needsShared(p)) continue;
      const check = exact(p, Math.max(1, Math.min(10000, end - Date.now())));
      if (check.timeout || check.count !== 1 || check.solution.some((v, i) => v !== solution[i])) continue;
      validate(p);
      p.rating = {level, hardest: proof.hardest, noGuess: true, unique: true, needsShared: true, clues};
      p.verification = {method: 'mixed-multi-independent-exact', nodes: check.nodes}; return p;
    }
    throw Object.assign(Error('指定した組み合わせと難易度を引き続き探しています。'), {code: 'NP_SEARCH_EXHAUSTED'});
  }
  function art(p, grid, notes = {}, selected = -1, errors = [], focus = -1) {
    const l = p.linked, model = setup(l); let out = '';
    l.cells.forEach(({x, y}, i) => { const fill = i === selected ? '#d5e7ce' : errors.includes(i) ? '#fce2dc' : focus >= 0 && l.boards[focus].map.includes(i) ? '#edf4e8' : model.domains[i] && l.boards.filter(b => b.map.includes(i)).length > 1 ? '#fff2ca' : 'white'; out += `<rect x="${x * 40}" y="${y * 40}" width="40" height="40" fill="${fill}" stroke="#aeb7b0" stroke-width=".7"/>`; });
    const paths = new Set();
    l.boards.forEach((b, i) => {
      for (let r = 0; r <= b.n; r += b.blockRows) paths.add(`M${b.x * 40} ${(b.y + r) * 40}H${(b.x + b.n) * 40}`);
      for (let c = 0; c <= b.n; c += b.blockCols) paths.add(`M${(b.x + c) * 40} ${b.y * 40}V${(b.y + b.n) * 40}`);
      out += `<text x="${b.x * 40 + 3}" y="${b.y * 40 + 9}" font-size="8" fill="#285849">${String.fromCharCode(65 + i)} ${b.n}×${b.n}</text>`;
      if (focus === i) out += `<rect x="${b.x * 40}" y="${b.y * 40}" width="${b.n * 40}" height="${b.n * 40}" fill="none" stroke="#224b8a" stroke-width="4"/>`;
    });
    out += `<path data-multi-blocks="1" d="${[...paths].join(' ')}" fill="none" stroke="#263e35" stroke-width="2"/>`;
    if (grid) l.cells.forEach(({x, y}, i) => {
      if (grid[i]) out += `<text data-multi-digit="${i}" x="${x * 40 + 20}" y="${y * 40 + 28}" font-family="sans-serif" font-size="${grid[i] > 9 ? 20 : 23}" text-anchor="middle" fill="${errors.includes(i) ? '#b13228' : p.puzzle[i] ? '#202823' : '#2a6b92'}">${Number(grid[i])}</text>`;
      else if (notes[i]) { const n = digit(model.domains[i]), cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols); for (const d of notes[i]) if (Number.isInteger(d) && d >= 1 && d <= n) out += `<text data-memo-cell="${i}" data-memo-digit="${d}" x="${x * 40 + (d - 1) % cols * 40 / cols + 20 / cols}" y="${y * 40 + Math.floor((d - 1) / cols) * 36 / rows + 36 / rows}" font-family="sans-serif" font-size="${Math.min(9, 32 / cols)}" text-anchor="middle" fill="#526e59">${d}</text>`; }
    });
    return out;
  }
  multi.mixedSizes = sizes;
  multi.mixedLayout = layout;
  multi.generateMixed = generate;
  multi.describeSizes = p => (p.linked?.boards.map(b => b.n || 9) || p.multiSizes || Array(counts[p.multiShape || 'pair']||2).fill(9)).map((n, i) => String.fromCharCode(65 + i) + '：' + n + '×' + n).join(' ／ ');
  multi.cellMax = (p, i) => p.multiVersion === 2 && i >= 0 ? digit(setup(p.linked).domains[i]) : p.n;
  multi.layout = (shape, values, links) => values ? layout(shape, values, links) : shape==='custom'?layout('custom',[9,9]):original.layout(shape);
  multi.localUnits = b => b.n ? localUnits(b) : original.localUnits(b);
  multi.setup = l => l.boards[0].n ? setup(l) : original.setup(l);
  multi.solve = (p, ...args) => p.linked.boards[0].n ? solve(p, ...args) : original.solve(p, ...args);
  multi.exact = (p, ...args) => p.linked.boards[0].n ? exact(p, ...args) : original.exact(p, ...args);
  multi.needsShared = p => p.multiVersion === 2 ? needsShared(p) : original.needsShared(p);
  multi.validate = p => p.multiVersion === 2 ? validate(p) : original.validate(p);
  multi.art = (p, ...args) => p.linked.boards[0].n ? art(p, ...args) : original.art(p, ...args);
  const oldLabel = np.sizeLabel, oldSanitize = np.sanitizeProgress;
  np.sizeLabel = p => p.kind === 'multi' && (p.multiVersion === 2 || p.multiSizes) ? multi.describeSizes(p) + ' · ' + multi.names[p.linked?.shape || p.multiShape || 'pair'] : oldLabel(p);
  np.sanitizeProgress = p => { oldSanitize(p); if (p.multiVersion === 2) { p.grid.forEach((v, i) => { if (v > multi.cellMax(p, i)) p.grid[i] = p.puzzle[i]; }); for (const i of Object.keys(p.notes)) p.notes[i] = p.notes[i].filter(v => v <= multi.cellMax(p, +i)); p.completed = p.grid.every((v, i) => v === p.solution[i]); } return p; };
  np.KIND.multi.desc = '大きさを選んだ盤面をつなぎます。各盤面の行・列・太い枠で、1〜その盤面の大きさの数字を1回ずつ使います。黄色のマスは共有です。';
  const oldGenerate = root.NPGenerate, oldMatches = root.NPGenerationMatches;
  root.NPGenerationMatches = (p, cfg) => cfg.kind === 'multi' && cfg.multiSizes ? p.multiVersion === 2 && p.kind === cfg.kind && p.n === cfg.n && p.level === cfg.level && p.rating?.level === cfg.level && p.linked.shape === cfg.multiShape && JSON.stringify(p.linked.boards.map(b => b.n)) === JSON.stringify(cfg.multiSizes) && (cfg.multiShape!=='custom'||JSON.stringify(p.linked.links)===JSON.stringify(cfg.multiLinks)) : oldMatches(p, cfg);
  root.NPGenerate = (cfg, progress) => {
    if (cfg.kind !== 'multi' || !cfg.multiSizes) return oldGenerate(cfg, progress);
    validSizes(cfg.multiShape, cfg.multiSizes);
    if (cfg.n !== Math.max(...cfg.multiSizes) || !Number.isInteger(cfg.level) || cfg.level < 1 || cfg.level > (cfg.n===4?2:5)) throw Error('マルチの生成条件を確認してください。');
    for (;;) {
      try {
        const p = generate(cfg.multiShape, cfg.multiSizes, cfg.level, root.Nanpure.randomId(null, true), progress, 120000, cfg.multiLinks);
        Object.assign(p, {created: Date.now(), uid: 'multi-' + p.id + '-' + Date.now().toString(36), elapsed: 0, completed: false, grid: p.puzzle.slice(), notes: {}});
        if (!root.NPGenerationMatches(p, cfg)) throw Error('盤面の組み合わせが一致しません。');
        return p;
      } catch (e) { if (e.code !== 'NP_SEARCH_EXHAUSTED') throw e; progress?.(e.message); }
    }
  };
})(typeof window !== 'undefined' ? window : self);
