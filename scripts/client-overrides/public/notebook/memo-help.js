!function(n){"use strict";function o(o){if(o.multiVersion===2)return n.NanpureMulti.setup(o.linked).units;const t=o.n,r=[];function e(n,o){for(let o=0;o<t;o++)r.push(n.filter((n,r)=>Math.floor(r/t)===o)),r.push(n.filter((n,r)=>r%t===o));if(o){const t=new Map;n.forEach((n,r)=>{const e=o[r];t.has(e)||t.set(e,[]),t.get(e).push(n)}),r.push(...t.values())}}if(o.linked)for(const r of o.linked.boards)e(r.map,"multi"===o.kind?n.NP.regularRegions(t):null);else e(o.grid.map((n,o)=>o),["neighbor","step","cross"].includes(o.kind)?null:n.NP.regions(o));return r}function mixedCandidates(puzzle) {
  const {peers} = n.NanpureMulti.setup(puzzle.linked);
  const candidates = {};
  puzzle.grid.forEach((value, cell) => {
    if (value) return;
    const used = new Set(peers[cell].map(peer => puzzle.grid[peer]));
    candidates[cell] = Array.from({length: n.NanpureMulti.cellMax(puzzle, cell)}, (_, index) => index + 1)
      .filter(digit => !used.has(digit));
  });
  return candidates;
}
n.NPMemo={groups:o,candidates:function(n){if(n.multiVersion===2)return mixedCandidates(n);const t=n.grid.map(()=>new Set);for(const r of o(n)){const o=r.map(o=>n.grid[o]).filter(Boolean);for(const e of r)if(!n.grid[e])for(const n of o)t[e].add(n)}const r={};for(let o=0;o<n.grid.length;o++)n.grid[o]||(r[o]=Array.from({length:n.n},(n,o)=>o+1).filter(n=>!t[o].has(n)));return r},prune:function(n,t,r){const e={};if(!r)return e;const peers = n.multiVersion === 2 ? NanpureMulti.setup(n.linked).peers[t] :
  new Set(o(n).filter(group => group.includes(t)).flat());
for(const o of peers)o!==t&&n.notes[o]&&n.notes[o].includes(r)&&(e[o]=n.notes[o].slice(),n.notes[o]=n.notes[o].filter(n=>n!==r),n.notes[o].length||delete n.notes[o]);return e},nextDigit:function(n,t){const r=Array(n.n+1).fill(!0);for(const t of o(n)){const o=new Uint16Array(n.n+1);for(const r of t)n.grid[r]&&o[n.grid[r]]++;for(let t=1;t<=n.n;t++)1!==o[t]&&(r[t]=!1)}if(!r[t])return t;for(let o=1;o<n.n;o++){const e=(t+o-1)%n.n+1;if(!r[e])return e}return null}}}(window);