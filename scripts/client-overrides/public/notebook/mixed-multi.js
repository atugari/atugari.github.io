/* Mixed-size multi Sudoku. The original v1 engine remains available for old saves. */
(function (root) {
  'use strict';
  const multi = root.NanpureMulti, np = root.NP;
  const sizes = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25];
  const maxBoards = 20;
  const ruleNames = {
    normal: '通常', diagonal: '対角線', hyper: 'ハイパー',
    antiknight: 'アンチナイト', antiking: 'アンチキング', disjoint: '同じ位置'
  };
  const rulesForSize = n => n === 9 ? Object.keys(ruleNames) : ['normal'];
  // A completed grid for each added 9×9 rule. Rotations, reflections and
  // digit permutations preserve each rule, including the extra constraints.
  const templates = {
    diagonal: '123456789456789123789123456935241867617538294842697531298314675371865942564972318',
    hyper: '123456789456789123789123456534297861261834597897561234912378645348615972675942318',
    antiknight: '123456789987312456465798213251983674734621598896574132512849367378265941649137825',
    antiking: '123456789785293146469187235812534697374962518596718324641825973937641852258379461',
    disjoint: '123456789456789123789123456231674895875912364694538271912367548548291637367845912'
  };
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
    if (!Object.hasOwn(counts, shape) || !Array.isArray(values) || (shape==='custom' ? values.length<2||values.length>maxBoards : values.length !== counts[shape]) || values.some(n => !sizes.includes(n))) throw Error('各盤面の大きさを選び直してください。');
    return values;
  }
  function validRules(values, rules) {
    if (rules === undefined) return values.map(() => 'normal');
    if (!Array.isArray(rules) || rules.length !== values.length ||
        values.some((n, i) => !rulesForSize(n).includes(rules[i]))) throw Error('各盤面の大きさに合うルールを選び直してください。');
    return rules;
  }
  function layout(shape, values, links, rules, preview = false) {
    validSizes(shape, values);
    rules = validRules(values, rules);
    const boards = values.map(spec);
    boards.forEach((b, i) => { if (rules[i] !== 'normal') b.rule = rules[i]; });
    if (shape === 'custom') {
      if (!Array.isArray(links)) links=values.slice(1).map((_,i)=>({parent:i,corner:'se'}));
      if(links.length!==values.length-1||links.some((l,i)=>!l||!Number.isInteger(l.parent)||l.parent<0||l.parent>i||(('dx' in l||'dy' in l)?![l.dx,l.dy].every(v=>Number.isInteger(v)&&Math.abs(v)<=200):!['nw','ne','sw','se'].includes(l.corner))))throw Error('接続先と、整数の配置位置を選び直してください。');
    }
    const overlap = (a, b) => shape==='custom'||values.length>2&&new Set(values).size>1 ? [1,1] : [Math.min(a.blockCols, b.blockCols), Math.min(a.blockRows, b.blockRows)];
    boards[0].x = 0; boards[0].y = 0;
    for (let i = 1; i < boards.length; i++) {
      const b = boards[i], a = boards[shape === 'custom' ? links[i-1].parent : shape === 'samurai' ? 0 : i - 1], [w, h] = overlap(a, b);
      if (shape === 'custom') {
        const l=links[i-1],c=l.corner;if('dx' in l){b.x=a.x+l.dx;b.y=a.y+l.dy;}else{b.x=c.endsWith('w')?a.x-b.n+w:a.x+a.n-w;b.y=c.startsWith('n')?a.y-b.n+h:a.y+a.n-h;}
      } else if (shape === 'samurai') {
        b.x = i === 1 || i === 3 ? a.x - b.n + w : a.x + a.n - w;
        b.y = i <= 2 ? a.y - b.n + h : a.y + a.n - h;
      } else { b.x = a.x + a.n - w; b.y = a.y + a.n - h; }
    }
    if(shape==='custom'&&!preview) {
      // A link stores a coordinate reference, not a required physical overlap.
      // Dragging may connect through another board, including a later board.
      const sharesCell=(a,b)=>a.x<b.x+b.n&&b.x<a.x+a.n&&a.y<b.y+b.n&&b.y<a.y+a.n;
      const connected=new Set([0]),pending=[0];
      while(pending.length){
        const a=boards[pending.pop()];
        boards.forEach((b,i)=>{if(!connected.has(i)&&sharesCell(a,b)){connected.add(i);pending.push(i);}});
      }
      if(connected.size!==boards.length)throw Error('盤面同士を1マス以上重ね、すべての盤面をつないでください。');
      for(let i=1;i<boards.length;i++){
        const a=boards[i];
        if(boards.slice(0,i).some(b=>a.x===b.x&&a.y===b.y&&a.n===b.n))throw Error('同じ大きさの盤面が完全に一致しています。位置をずらしてください。');
      }
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
    const linked={shape, ...(shape==='custom'?{links:links.map(l=>'dx' in l?{parent:l.parent,dx:l.dx,dy:l.dy}:{parent:l.parent,corner:l.corner})}:{}), boards, cells, width: Math.max(...boards.map(b => b.x + b.n)), height: Math.max(...boards.map(b => b.y + b.n))};
    if(!preview){
      const model=setup(linked);
      for(const u of model.units){const limits=u.map(i=>digit(model.domains[i])).sort((a,b)=>a-b);if(limits.some((n,i)=>n<=i))throw Error('この重なりでは行・列・枠の数字が足りません。小さい盤面の重なりを減らしてください。');}
    }
    return linked;
  }
  function localUnits(b) {
    const units = [], {n, blockRows: h, blockCols: w} = b;
    for (let r = 0; r < n; r++) units.push(b.map.slice(r * n, (r + 1) * n));
    for (let c = 0; c < n; c++) units.push(Array.from({length: n}, (_, r) => b.map[r * n + c]));
    for (let r = 0; r < n; r += h) for (let c = 0; c < n; c += w) units.push(Array.from({length: n}, (_, i) => b.map[(r + Math.floor(i / w)) * n + c + i % w]));
    if (b.rule === 'diagonal') {
      units.push(Array.from({length:n},(_,i)=>b.map[i*n+i]), Array.from({length:n},(_,i)=>b.map[i*n+n-1-i]));
    }
    if (b.rule === 'hyper') {
      for (const r of [1, 5]) for (const c of [1, 5]) units.push(Array.from({length:9},(_,i)=>b.map[(r+Math.floor(i/3))*9+c+i%3]));
    }
    if (b.rule === 'disjoint') {
      const blocks = units.slice(2*n, 3*n);
      for (let i = 0; i < n; i++) units.push(blocks.map(block => block[i]));
    }
    return units;
  }
  function localEdges(b) {
    const moves = b.rule === 'antiknight' ? [[1,2],[2,1],[-1,2],[-2,1]] :
      b.rule === 'antiking' ? [[1,1],[-1,1]] : [];
    const edges = [];
    for (const [dx,dy] of moves) for (let r=0;r<b.n-dy;r++) {
      for (let c=Math.max(0,-dx);c<Math.min(b.n,b.n-dx);c++) edges.push([b.map[r*b.n+c],b.map[(r+dy)*b.n+c+dx]]);
    }
    return edges;
  }
  const cached = new WeakMap();
  function setup(linked) {
    if (cached.has(linked)) return cached.get(linked);
    const units = [], seen = new Set(), domains = linked.cells.map(() => mask(25));
    const cellBoards = linked.cells.map(() => []), extra = linked.cells.map(() => new Set());
    linked.boards.forEach((b,j) => {
      for (const i of b.map) { domains[i] &= mask(b.n); cellBoards[i].push(j); }
      for (const u of localUnits(b)) { const k = u.slice().sort((a, b) => a - b).join(','); if (!seen.has(k)) { seen.add(k); units.push(u); } }
      for (const [a,c] of localEdges(b)) { extra[a].add(c); extra[c].add(a); }
    });
    const members = linked.cells.map(() => []);
    units.forEach((u, j) => u.forEach(i => members[i].push(j)));
    const edgePeers = extra.map(e => [...e]);
    const peers = members.map((m, i) => [...new Set([...m.flatMap(j => units[j]), ...edgePeers[i]])].filter(j => j !== i));
    const result = {units, members, peers, edgePeers, domains, boards: linked.boards, cellBoards}; cached.set(linked, result); return result;
  }
  function solve(p, cap = 4, model = setup(p.linked), deadline = Infinity) {
    const c = p.puzzle.map((v, i) => v ? (1 << (v - 1)) & model.domains[i] : model.domains[i]);
    const fixed = [];
    for (let i=0;i<c.length;i++) if (single(c[i])) fixed.push(i);
    let hardest = 1, moves = 0, read = 0;
    const cut = (i, m) => {
      const previous = c[i], v = previous & m;
      if (v === previous) return false;
      c[i] = v; moves++;
      if (single(v) && !single(previous)) fixed.push(i);
      return true;
    };
    for (;;) {
      if (Date.now() >= deadline) return {solved: false, timeout: true};
      while (read < fixed.length) {
        const i = fixed[read++];
        if (!c[i]) return {solved:false,bad:true};
        for (const j of model.peers[i]) cut(j,~c[i]);
      }
      if (c.some(v => !v)) return {solved: false, bad: true};
      let changed = false;
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
  function search(p, end, limit, rng, maxNodes = Infinity) {
    const model = setup(p.linked), grid = p.puzzle.slice(), used = model.units.map(() => 0);
    let count = 0, nodes = 0, solution;
    for (let i = 0; i < grid.length; i++) if (grid[i]) {
      if (!Number.isInteger(grid[i]) || grid[i] < 1 || grid[i] > 25) return {count: 0, timeout: false};
      const bit = 1 << (grid[i] - 1);
      if (!(model.domains[i] & bit) || model.edgePeers[i].some(j => j < i && grid[j] === grid[i])) return {count: 0, timeout: false};
      for (const u of model.members[i]) { if (used[u] & bit) return {count: 0, timeout: false}; used[u] |= bit; }
    }
    function choose() {
      let at = -1, options = 0, best = 26;
      for (let i = 0; i < grid.length; i++) if (!grid[i]) {
        let m = model.domains[i]; for (const u of model.members[i]) m &= ~used[u];
        for (const j of model.edgePeers[i]) if (grid[j]) m &= ~(1 << (grid[j] - 1));
        const k = pop(m);
        if (!k) return {at:i,options:0};
        if (k < best) { at = i; options = m; best = k; if (k === 1) break; }
      }
      return {at, options};
    }
    // A 20-board layout can have thousands of undecided cells. Keep the
    // search stack on the heap so browser call-stack limits cannot affect it.
    const stack = [];
    let descend = true;
    for (;;) {
      if (descend) {
        if (++nodes > maxNodes || (nodes % 32 === 1 && Date.now() >= end)) return {count,nodes,timeout:true,solution};
        const next = choose();
        if (next.at < 0) {
          if (!solution) solution = grid.slice();
          if (++count >= limit) break;
        } else if (next.options) stack.push(next);
      }
      if (!stack.length) break;
      const current = stack[stack.length - 1], {at} = current;
      if (grid[at]) {
        const bit = 1 << (grid[at] - 1);
        for (const u of model.members[at]) used[u] ^= bit;
        grid[at] = 0;
      }
      if (!current.options) {
        stack.pop();
        descend = false;
      } else {
        let bit = current.options & -current.options;
        if (rng && !single(current.options)) {
          let pick = Math.floor(rng() * pop(current.options));
          for (let rest = current.options; pick >= 0; rest &= rest - 1, pick--) bit = rest & -rest;
        }
        current.options ^= bit;
        grid[at] = digit(bit);
        for (const u of model.members[at]) used[u] |= bit;
        descend = true;
      }
    }
    return {count,nodes,timeout:Date.now() >= end,solution};
  }
  function exact(p, budget = 10000) {
    return search(p, Date.now() + budget, 2);
  }
  function template(b, rng) {
    const {n, blockRows:h, blockCols:w} = b;
    if (b.rule) {
      const source = templates[b.rule], symmetry = Math.floor(rng()*8);
      return b.map.map((_, i) => {
        let r = Math.floor(i/n), c = i%n;
        if (symmetry & 1) r = n-1-r;
        if (symmetry & 2) c = n-1-c;
        if (symmetry & 4) [r,c] = [c,r];
        return Number(source[r*n+c]);
      });
    }
    const rows = shuffle(Array.from({length:n/h},(_,i)=>i),rng).flatMap(g=>shuffle(Array.from({length:h},(_,i)=>g*h+i),rng));
    const cols = shuffle(Array.from({length:n/w},(_,i)=>i),rng).flatMap(g=>shuffle(Array.from({length:w},(_,i)=>g*w+i),rng));
    return rows.flatMap(r=>cols.map(c=>(r*w+Math.floor(r/h)+c)%n+1));
  }
  function completed(linked, rng, deadline = Infinity) {
    const result = linked.cells.map(() => 0), domains = setup(linked).domains;
    // Restrict shared symbols before filling adjacent boards, including smaller ones.
    for (const b of linked.boards) {
      const {n} = b;
      let done = false;
      for (let attempt = 0; attempt < 200 && !done; attempt++) {
        if (Date.now() >= deadline) return null;
        const base = template(b,rng), mapping = new Map(), taken = new Set();
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
      if (!done) return completeSearch(linked, rng, deadline);
    }
    return result;
  }
  function completeSearch(linked, rng, deadline) {
    const result = search({linked,puzzle:linked.cells.map(()=>0)},Math.min(deadline,Date.now()+2500),1,rng,80000);
    if (result.solution) return result.solution;
    if (!result.timeout) throw Object.assign(Error('この配置では各盤面のルールを同時に満たせません。重なり方を変えてください。'),{code:'NP_LAYOUT_UNSAT'});
    return null;
  }
  function boardValid(b, value) {
    return localUnits(b).every(u => {
      const digits = u.map(value);
      return new Set(digits).size === b.n && digits.every(v => Number.isInteger(v) && v >= 1 && v <= b.n);
    }) && localEdges(b).every(([a,c]) => value(a) !== value(c));
  }
  function connectionOrder(model) {
    const {boards,cellBoards} = model, connected = new Set([0]), queue = [0], order = [];
    // Editor coordinate references can point to non-overlapping boards.
    while (queue.length) {
      const at = queue.shift();
      for (const i of boards[at].map) for (const next of cellBoards[i]) if (!connected.has(next)) {
        connected.add(next); queue.push(next); order.push({next,parent:at});
      }
    }
    return order;
  }
  function sharedWitnesses(p, model = setup(p.linked), parents) {
    const witnesses = [];
    for (const [board,b] of p.linked.boards.entries()) {
      const clues = new Set(b.map.map(i => p.puzzle[i]));
      const parent = parents?.get(board);
      const cell = b.map.find(i => (parent === undefined ? model.cellBoards[i].length > 1 : model.cellBoards[i].includes(parent)) && !clues.has(p.solution[i]));
      if (cell === undefined) continue;
      const a = p.solution[cell];
      const other = Array.from({length:b.n},(_,i)=>i+1).find(v=>v!==a&&!clues.has(v));
      if (other === undefined) continue;
      // This is an actual isolated-board alternate solution, not just a
      // human solver stalling. The swap changes a blank physical overlap.
      const alternate = i => p.solution[i] === a ? other : p.solution[i] === other ? a : p.solution[i];
      if (!p.puzzle[cell] && b.map.every(i => !p.puzzle[i] || p.puzzle[i] === alternate(i)) && boardValid(b,alternate)) {
        witnesses.push({board, cell, digits:[a,other]});
      }
    }
    return witnesses;
  }
  function needsShared(p) {
    return sharedWitnesses(p).length > 0;
  }
  function validate(p) {
    if (!p || p.kind !== 'multi' || p.multiVersion !== 2 || !p.linked || !Array.isArray(p.linked.boards)) throw Error('マルチの形式が正しくありません。');
    const ns = p.linked.boards.map(b => b.n), rules = p.linked.boards.map(b => b.rule || 'normal');
    const canonical = layout(p.linked.shape, ns, p.linked.links, rules);
    if (p.n !== Math.max(...ns) || JSON.stringify(canonical) !== JSON.stringify(p.linked)) throw Error('マルチの配置が正しくありません。');
    if (!Array.isArray(p.puzzle) || !Array.isArray(p.solution) || p.puzzle.length !== canonical.cells.length || p.solution.length !== canonical.cells.length) throw Error('マルチのマス数が正しくありません。');
    for (const b of canonical.boards) if (!boardValid(b,i=>p.solution[i])) throw Error('各盤面の行・列・枠と追加ルールを確認してください。');
    p.puzzle.forEach((v, i) => { if (!Number.isInteger(v) || v < 0 || v && v !== p.solution[i]) throw Error('問題と答えが一致しません。'); });
    return true;
  }
  function seedShared(p,model,order,cap,rng,end) {
    const {boards,cellBoards} = model;
    function seed(next,parent) {
      const board = boards[next], related = parent===undefined ? i=>cellBoards[i].length>1 : i=>cellBoards[i].includes(parent);
      const shared = new Set(board.map.filter(related).map(i=>p.solution[i]));
      const ds = shuffle(Array.from({length:board.n},(_,i)=>i+1),rng);
      for (let a=0;a<ds.length;a++) for (let b=a+1;b<ds.length;b++) {
        if (Date.now() >= end) return false;
        if (!shared.has(ds[a])&&!shared.has(ds[b])) continue;
        const changed = board.map.filter(i=>p.puzzle[i]&&(p.solution[i]===ds[a]||p.solution[i]===ds[b]));
        for (const i of changed) p.puzzle[i] = 0;
        if (solve(p,cap,model,end).solved) return true;
        for (const i of changed) p.puzzle[i] = p.solution[i];
      }
      return false;
    }
    let seeded = 0;
    for (const {next,parent} of order) if (seed(next,parent)) seeded++;
    if (seeded) return true;
    return shuffle(boards.map((_,i)=>i),rng).some(i=>seed(i));
  }
  function reduceClues(p,model,cap,rng,end,target) {
    let clues = p.puzzle.filter(Boolean).length;
    const order = shuffle(p.puzzle.map((_,i)=>i).filter(i=>p.puzzle[i]),rng);
    function remove(start, count) {
      if (!count || clues <= target || Date.now() >= end) return;
      count = Math.min(count,clues-target);
      for (let i=start;i<start+count;i++) p.puzzle[order[i]]=0;
      if (solve(p,cap,model,end).solved) { clues -= count; return; }
      for (let i=start;i<start+count;i++) p.puzzle[order[i]]=p.solution[order[i]];
      if (count > 1) {
        const first = Math.floor(count/2);
        remove(start,first); remove(start+first,count-first);
      }
    }
    const batch = order.length >= 1000 ? 64 : order.length >= 240 ? 16 : 1;
    for (let i=0;i<order.length&&clues>target&&Date.now()<end;i+=batch) remove(i,Math.min(batch,order.length-i));
    return clues;
  }
  function generate(shape, values, level, id, progress, budget = 120000, links, rules) {
    const linked = layout(shape, values, links, rules), model = setup(linked), cap = multi.caps[level - 1];
    if (!Number.isInteger(level) || level < 1 || level > (Math.max(...values)===4?2:5)) throw Error('難易度を選び直してください。');
    const rng = root.NanpureVariants.rngFor('mixed-multi:' + shape + ':' + values.join(',') + ':' + (rules||[]).join(',') + ':' + level + ':' + id), end = Date.now() + budget;
    const order = connectionOrder(model), overlaps = model.cellBoards.filter(owners => owners.length > 1);
    const tree = overlaps.length === values.length-1 && overlaps.every(owners=>owners.length===2);
    const parents = tree ? new Map(order.map(({next,parent})=>[next,parent])) : undefined;
    let tries = 0;
    while (Date.now() < end) {
      progress?.('各盤面の大きさ・共有マス・難易度を確認中（' + ++tries + '回目）');
      const solution = completed(linked, rng, end); if (!solution) continue;
      const p = {kind: 'multi', n: Math.max(...values), level, id, linked, multiVersion: 2, solution, puzzle: solution.slice()};
      if (!seedShared(p,model,order,cap,rng,end)) continue;
      const target = Math.round(solution.length * (level === 1 ? .65 : level === 2 ? .42 : .23));
      const clues = reduceClues(p,model,cap,rng,end,target);
      const proof = solve(p,cap,model,end);
      if (!proof.solved || level<=2&&clues!==target || level>=3&&solve(p,cap-1,model,end).solved) continue;
      const witnesses = sharedWitnesses(p,model,parents);
      if (!witnesses.length || tree&&order.some(({next})=>!witnesses.some(w=>w.board===next)) || Date.now()>=end) continue;
      const check = exact(p, Math.max(1,Math.min(10000,end-Date.now())));
      if (check.timeout || check.count !== 1 || check.solution.some((v, i) => v !== solution[i])) continue;
      validate(p);
      p.rating = {level, hardest: proof.hardest, noGuess: true, unique: true, needsShared: true, clues};
      p.verification = {method: 'mixed-multi-independent-exact', nodes: check.nodes, sharedWitnesses:witnesses}; return p;
    }
    throw Object.assign(Error('指定した組み合わせと難易度を引き続き探しています。'), {code: 'NP_SEARCH_EXHAUSTED'});
  }
  const palette=[
    {name:'緑',color:'#26734b',tint:'#eef8f0'},{name:'青',color:'#2366b1',tint:'#edf4ff'},
    {name:'橙',color:'#a95413',tint:'#fff3e8'},{name:'紫',color:'#8251ab',tint:'#f6efff'},
    {name:'桃',color:'#b24472',tint:'#fff0f6'},{name:'水色',color:'#087a88',tint:'#e9f8fa'},
    {name:'茶',color:'#806219',tint:'#faf4df'},{name:'藍',color:'#4b54a4',tint:'#f0f1ff'},
    {name:'赤',color:'#ae312e',tint:'#fff0ee'},{name:'黄緑',color:'#557018',tint:'#f2f7e2'},
    {name:'藤',color:'#6943a1',tint:'#f4edff'},{name:'青緑',color:'#126959',tint:'#e7f6f0'},
    {name:'金茶',color:'#8e5600',tint:'#fff3d9'},{name:'紺',color:'#304d78',tint:'#e9eff9'},
    {name:'紅',color:'#a33250',tint:'#fae9ef'},{name:'灰',color:'#55615c',tint:'#edf0ee'},
    {name:'琥珀',color:'#945e30',tint:'#f7ebdf'},{name:'深緑',color:'#245e31',tint:'#e6f2e9'},
    {name:'すみれ',color:'#80427a',tint:'#f8eaf6'},{name:'空',color:'#26728a',tint:'#e5f2fa'}
  ];
  const ruleLabel = b => b.rule ? ' · '+ruleNames[b.rule] : '';
  function boardLabel(p,i){const b=p.linked.boards[i];return String.fromCharCode(65+i)+' · '+palette[i].name+' · '+b.n+'×'+b.n;}
  function miniMap(p,focus){const l=p.linked;return '<svg class="multi-mini-map" viewBox="-1 -1 '+(l.width+2)+' '+(l.height+2)+'" aria-hidden="true">'+l.boards.map((b,i)=>'<rect x="'+b.x+'" y="'+b.y+'" width="'+b.n+'" height="'+b.n+'" fill="'+(i===focus?palette[i].tint:'none')+'" stroke="'+(i===focus?palette[i].color:'#929b96')+'" stroke-width="'+(i===focus?1:.4)+'"/>').join('')+'</svg>';}
  function cellDescription(p,at){
    if(at<0||!p.linked.cells[at])return 'マスを選ぶと、所属する盤面と各盤面内の位置を表示します。';
    const {x,y}=p.linked.cells[at],members=setup(p.linked).cellBoards[at].map(i=>{
      const b=p.linked.boards[i]; return boardLabel(p,i)+ruleLabel(b)+' の '+(y-b.y+1)+'行'+(x-b.x+1)+'列';
    });
    return (members.length>1?'共有マス：':'選択中：')+members.join(' ／ ')+'。使える数字は1〜'+multi.cellMax(p,at)+'。';
  }
  function art(p, grid, notes = {}, selected = -1, errors = [], focus = -1) {
    const l=p.linked,model=setup(l),errorCells=new Set(errors); let out='';
    l.cells.forEach(({x, y}, i) => { const own=model.cellBoards[i],inside=focus<0||own.includes(focus),fill=i===selected?'#d5e7ce':errorCells.has(i)?'#fce2dc':!inside?'#f5f5f5':own.length>1?'#fff2ca':palette[own[0]].tint; out += `<rect x="${x * 40}" y="${y * 40}" width="40" height="40" fill="${fill}" stroke="#aeb7b0" stroke-width=".7"/>`; });
    const paths = new Set();
    l.boards.forEach((b, i) => {
      for (let r = 0; r <= b.n; r += b.blockRows) paths.add(`M${b.x * 40} ${(b.y + r) * 40}H${(b.x + b.n) * 40}`);
      for (let c = 0; c <= b.n; c += b.blockCols) paths.add(`M${(b.x + c) * 40} ${b.y * 40}V${(b.y + b.n) * 40}`);
    });
    out += `<path data-multi-blocks="1" d="${[...paths].join(' ')}" fill="none" stroke="#263e35" stroke-width="2"/>`;
    l.boards.forEach((b,i)=>{
      const {color}=palette[i],inset=1+i*.18,active=focus===i;
      out+=`<rect data-multi-outline="${i}" x="${b.x*40+inset}" y="${b.y*40+inset}" width="${b.n*40-2*inset}" height="${b.n*40-2*inset}" fill="none" stroke="${color}" stroke-width="${active?5:2.5}" opacity="${focus<0||active?1:.25}"/>`;
      if(active){const paths=[];for(let r=b.blockRows;r<b.n;r+=b.blockRows)paths.push(`M${b.x*40} ${(b.y+r)*40}H${(b.x+b.n)*40}`);for(let c=b.blockCols;c<b.n;c+=b.blockCols)paths.push(`M${(b.x+c)*40} ${b.y*40}V${(b.y+b.n)*40}`);out+=`<path data-multi-focus="${i}" d="${paths.join(' ')}" fill="none" stroke="${color}" stroke-width="3"/>`;}
      if(b.rule==='diagonal'){
        const x=b.x*40,y=b.y*40,w=b.n*40;
        out+=`<path data-multi-rule="${i}" d="M${x} ${y}l${w} ${w}m0 -${w}l-${w} ${w}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="5 4" opacity=".7"/>`;
      }
      if(b.rule==='hyper')for(const r of [1,5])for(const c of [1,5]){
        out+=`<rect data-multi-rule="${i}" x="${(b.x+c)*40+3}" y="${(b.y+r)*40+3}" width="114" height="114" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="5 4" opacity=".85"/>`;
      }
      out+=`<text data-multi-label="${i}" x="${b.x*40+3}" y="${b.y*40+9}" font-size="8" font-weight="bold" fill="${color}">${String.fromCharCode(65+i)} ${b.n}×${b.n}${ruleLabel(b)}</text>`;
    });
    if (grid) l.cells.forEach(({x, y}, i) => {
      if (grid[i]) out += `<text data-multi-digit="${i}" x="${x * 40 + 20}" y="${y * 40 + 28}" font-family="sans-serif" font-size="${grid[i] > 9 ? 20 : 23}" text-anchor="middle" fill="${errorCells.has(i) ? '#b13228' : p.puzzle[i] ? '#202823' : '#2a6b92'}">${Number(grid[i])}</text>`;
      else if (notes[i]) { const n = digit(model.domains[i]), cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols); for (const d of notes[i]) if (Number.isInteger(d) && d >= 1 && d <= n) out += `<text data-memo-cell="${i}" data-memo-digit="${d}" x="${x * 40 + (d - 1) % cols * 40 / cols + 20 / cols}" y="${y * 40 + Math.floor((d - 1) / cols) * 36 / rows + 36 / rows}" font-family="sans-serif" font-size="${Math.min(9, 32 / cols)}" text-anchor="middle" fill="#526e59">${d}</text>`; }
    });
    return out;
  }
  multi.palette = palette;
  multi.maxBoards = maxBoards;
  multi.ruleNames = ruleNames;
  multi.rulesForSize = rulesForSize;
  multi.boardLabel = boardLabel;
  multi.miniMap = miniMap;
  multi.cellDescription = cellDescription;
  multi.previewLayout = (shape,values,links,rules) => layout(shape,values,links,rules,true);
  multi.mixedSizes = sizes;
  multi.mixedLayout = layout;
  multi.generateMixed = generate;
  multi.describeSizes = p => (p.linked?.boards.map(b => b.n || 9) || p.multiSizes || Array(counts[p.multiShape || 'pair']||2).fill(9)).map((n, i) => String.fromCharCode(65 + i) + '：' + n + '×' + n).join(' ／ ');
  multi.cellMax = (p, i) => p.multiVersion === 2 && i >= 0 ? digit(setup(p.linked).domains[i]) : p.n;
  multi.layout = (shape, values, links, rules) => values ? layout(shape, values, links, rules) : shape==='custom'?layout('custom',[9,9]):original.layout(shape);
  multi.localUnits = b => b.n ? localUnits(b) : original.localUnits(b);
  multi.setup = l => l.boards[0].n ? setup(l) : original.setup(l);
  multi.solve = (p, ...args) => p.linked.boards[0].n ? solve(p, ...args) : original.solve(p, ...args);
  multi.exact = (p, ...args) => p.linked.boards[0].n ? exact(p, ...args) : original.exact(p, ...args);
  multi.needsShared = p => p.multiVersion === 2 ? needsShared(p) : original.needsShared(p);
  multi.sharedWitnesses = sharedWitnesses;
  multi.validate = p => p.multiVersion === 2 ? validate(p) : original.validate(p);
  multi.art = (p, ...args) => p.linked.boards[0].n ? art(p, ...args) : original.art(p, ...args);
  const oldLabel = np.sizeLabel, oldSanitize = np.sanitizeProgress;
  np.sizeLabel = p => p.kind === 'multi' && (p.multiVersion === 2 || p.multiSizes) ? multi.describeSizes(p) + ' · ' + multi.names[p.linked?.shape || p.multiShape || 'pair'] : oldLabel(p);
  np.sanitizeProgress = p => { oldSanitize(p); if (p.multiVersion === 2) { p.grid.forEach((v, i) => { if (v > multi.cellMax(p, i)) p.grid[i] = p.puzzle[i]; }); for (const i of Object.keys(p.notes)) p.notes[i] = p.notes[i].filter(v => v <= multi.cellMax(p, +i)); p.completed = p.grid.every((v, i) => v === p.solution[i]); } return p; };
  np.KIND.multi.desc = '大きさを選んだ盤面をつなぎます。各盤面の行・列・太い枠で、1〜その盤面の大きさの数字を1回ずつ使います。黄色のマスは共有です。';
  const oldGenerate = root.NPGenerate, oldMatches = root.NPGenerationMatches;
  function presetConfig(cfg) {
    const shape = cfg.multiShape || 'pair';
    const count = Object.hasOwn(counts,shape) && counts[shape];
    return count ? {...cfg,multiShape:shape,multiSizes:Array(count).fill(cfg.n)} : null;
  }
  function matches(p,cfg) {
    return p.multiVersion===2 && p.kind===cfg.kind && p.n===cfg.n && p.level===cfg.level && p.rating?.level===cfg.level &&
      p.linked.shape===cfg.multiShape && JSON.stringify(p.linked.boards.map(b=>b.n))===JSON.stringify(cfg.multiSizes) &&
      JSON.stringify(p.linked.boards.map(b=>b.rule||'normal'))===JSON.stringify(cfg.multiRules??cfg.multiSizes.map(()=> 'normal')) &&
      (cfg.multiShape!=='custom'||JSON.stringify(p.linked.links)===JSON.stringify(cfg.multiLinks));
  }
  root.NPGenerationMatches = (p, cfg) => {
    if (cfg.kind !== 'multi') return oldMatches(p,cfg);
    if (cfg.multiSizes) return matches(p,cfg);
    if (!p.implicitMultiPreset) return oldMatches(p,cfg);
    const preset = presetConfig(cfg);
    return !!preset && matches(p,preset);
  };
  root.NPGenerate = (cfg, progress) => {
    if (cfg.kind !== 'multi') return oldGenerate(cfg, progress);
    const implicit = !cfg.multiSizes;
    if (implicit) cfg = presetConfig(cfg);
    if (!cfg) throw Error('マルチの盤面の大きさを選び直してください。');
    validSizes(cfg.multiShape, cfg.multiSizes);
    validRules(cfg.multiSizes,cfg.multiRules);
    if (cfg.n !== Math.max(...cfg.multiSizes) || !Number.isInteger(cfg.level) || cfg.level < 1 || cfg.level > (cfg.n===4?2:5)) throw Error('マルチの生成条件を確認してください。');
    for (;;) {
      try {
        const p = generate(cfg.multiShape, cfg.multiSizes, cfg.level, root.Nanpure.randomId(null, true), progress, 120000, cfg.multiLinks,cfg.multiRules);
        if (implicit) p.implicitMultiPreset = true;
        Object.assign(p, {created: Date.now(), uid: 'multi-' + p.id + '-' + Date.now().toString(36), elapsed: 0, completed: false, grid: p.puzzle.slice(), notes: {}});
        if (!root.NPGenerationMatches(p, cfg)) throw Error('盤面の組み合わせが一致しません。');
        return p;
      } catch (e) { if (e.code !== 'NP_SEARCH_EXHAUSTED') throw e; if(cfg.multiShape==='custom')throw Error('指定した配置と難易度では問題を見つけられませんでした。重なり方か難易度を変えて、もう一度作ってください。'); progress?.(e.message); }
    }
  };
})(typeof window !== 'undefined' ? window : self);
