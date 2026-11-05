// One engine run per process. Pass the mixed-multi.js under test as argument 1.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const [source, scenario, seed] = process.argv.slice(2);
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'nanpure/releases/2026.11.05.100/notebook/index.html'), 'utf8');
const ctx = vm.createContext({console, Date, performance, TextDecoder, TextEncoder, Uint8Array, Uint16Array, ArrayBuffer, DataView, atob, btoa, setTimeout, clearTimeout});
ctx.window = ctx; ctx.self = ctx;
for (const id of ['core-normal','core-rect','core-variants','core-multi','common-source','generator-source']) {
  const code = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'))[1];
  vm.runInContext(code, ctx, {filename: id});
}
vm.runInContext(fs.readFileSync(source, 'utf8'), ctx, {filename: source});
const rules = ['normal','diagonal','hyper','antiknight','antiking','disjoint'];
const cases = {
  pair4: {count: 2, sizes: [4]},
  chain4: {count: 300, sizes: [4]},
  chain4L2: {count: 300, sizes: [4], level: 2},
  large: {count: 300, sizes: [25], budget: 120000},
  mixed: {count: 300, sizes: [4,6,9]},
  rules: {count: 300, sizes: [9], rules},
  high: {count: 300, sizes: [9], level: 5},
  lattice: {count: 300, sizes: [9], links: Array.from({length:299}, (_,i) =>
    ({parent:0, dx:6*((i+1)%20), dy:6*Math.floor((i+1)/20)}))},
  cycle: {count: 3, sizes: [9], links: [{parent:0,dx:6,dy:0},{parent:0,dx:3,dy:6}]}
};
const cfg = cases[scenario];
if (!cfg || !seed || !global.gc) throw Error('node --expose-gc ' + __filename + ' <mixed-multi.js> <' + Object.keys(cases).join('|') + '> <seed>');
const sizes = Array.from({length: cfg.count}, (_,i) => cfg.sizes[i%cfg.sizes.length]);
const links = cfg.links || sizes.slice(1).map((_,i) => ({parent:i,corner:'se'}));
const id = 'SHARED-' + scenario + '-' + seed;
global.gc();
const start = performance.now();
let attempts = 0, result, error;
try {
  result = ctx.NanpureMulti.generateMixed('custom', sizes, cfg.level || 1, id, () => attempts++, cfg.budget || 15000, links,
    cfg.rules && sizes.map((_,i) => cfg.rules[i%cfg.rules.length]));
} catch (e) { error = {code: e.code, message: e.message}; }
const ms = performance.now() - start;
const peakMiB = process.resourceUsage().maxRSS / 1024; // Linux reports KiB; before independent checks
if (result) {
  const engine = ctx.NanpureMulti;
  const check = engine.exact(result, 3000);
  if (result.id !== id || result.level !== (cfg.level || 1) || !engine.validate(result) || check.timeout ||
      check.count !== 1 || !engine.solve(result, engine.caps[result.level-1]).solved) throw Error('validation failed: ' + id);
}
console.log(JSON.stringify({scenario, seed, ms, peakMiB, attempts, error, clues: result?.rating.clues,
  witnessedBoards: result && new Set(result.verification.sharedWitnesses.map(w => w.board)).size}));
