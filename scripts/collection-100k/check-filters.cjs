'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const appPath = process.argv[2] || path.join(root, 'nanpure/collection/app.js');
const source = fs.readFileSync(appPath, 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'nanpure/collection/catalog.json'), 'utf8'));
// Compile the complete module, then exercise its actual handlers without its network/DB startup.
new vm.SourceTextModule(source);
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
class Select {
  constructor() { this.options = []; this._value = ''; }
  set innerHTML(html) {
    this.options = [...html.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([, attrs, text]) => ({
      value: decode(attrs.match(/\bvalue="([^"]*)"/)?.[1] || ''),
      textContent: decode(text), hidden: /\bhidden\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs)
    }));
    this._value = this.options[0]?.value || '';
  }
  get value() { return this._value; }
  set value(value) { this._value = this.options.some(option => option.value === String(value)) ? String(value) : ''; }
  get selectedOptions() { return this.options.filter(option => option.value === this._value); }
}
const fields = ['kind', 'size', 'level', 'state'];
const elements = Object.fromEntries(fields.map(id => [id, new Select()]));
elements.state.innerHTML = '<option value="all">すべて</option>';
for (const id of ['search', 'summary', 'count', 'cards', 'more', 'quick', 'back', 'next', 'background', 'game', 'notice', 'player-status']) {
  elements[id] = { value: '', textContent: '', innerHTML: '', checked: true, scrollIntoView() {} };
}
const timers = [];
const context = vm.createContext({
  document: { getElementById: id => elements[id], addEventListener() {} },
  window: { addEventListener() {} },
  setTimeout: callback => timers.push(callback),
  fetch() { throw Error('Filtering must not download problem data'); }
});
const start = source.indexOf('\n') + 1;
const end = source.lastIndexOf('try{const loaded=await Promise.all');
assert.ok(end > start, 'Locate application startup');
vm.runInContext(source.slice(start, end) + '\nglobalThis.filters = { refreshFilters, matching, render, reset(data, records) { catalog=data;progress=new Map(records);page=0; }, setProgress(records) { progress=new Map(records); }, getPage() { return page; }, setPage(value) { page=value; } };', context);
const app = context.filters;
const sizeKey = config => [config.n, config.multiShape || config.linkedShape || '', config.complexity || ''].join(':');
const key = (config, field) => field === 'kind' ? config.kind : field === 'size' ? sizeKey(config) : String(config.level);
const offered = field => elements[field].options.filter(option => !option.disabled && !option.hidden && option.value && option.value !== 'all').map(option => option.value).sort();
const selected = () => Object.fromEntries(fields.map(field => [field, elements[field].value]));
const permutations = values => values.length ? values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index)).map(tail => [value, ...tail])) : [[]];
const puzzleId = number => 'P-' + String(number).padStart(6, '0');
function reset(data = catalog, records = []) {
  app.reset(data, records);
  elements.search.value = '';
  for (const field of fields) elements[field].value = field === 'state' ? 'all' : '';
  app.refreshFilters();
}
function choose(field, value) {
  assert.ok(offered(field).includes(value), field + ' must offer ' + value);
  elements[field].value = value;
  elements[field].onchange();
}
function configMatches(config, values, except) {
  return ['kind', 'size', 'level'].every(field => field === except || !values[field] || key(config, field) === values[field]);
}
function checkAvailable(data, records = []) {
  const values = selected(), states = new Map(records.map(([id, progress]) => [id, progress.state]));
  const q = elements.search.value.trim().toUpperCase();
  for (const field of fields) {
    const expected = new Set();
    for (const config of data.configs) {
      if (!configMatches(config, values, field)) continue;
      for (let number = config.start; number < config.start + config.count; number++) {
        const id = puzzleId(number), state = states.get(id) || 'new';
        if (q && !id.includes(q)) continue;
        if (field !== 'state' && values.state && values.state !== 'all' && values.state !== state) continue;
        expected.add(field === 'state' ? state : key(config, field));
        if (field !== 'state' && (!q && (values.state === 'all' || !values.state))) break;
      }
    }
    assert.deepEqual(offered(field), [...expected].sort(), 'Exact available choices for ' + field + ': ' + JSON.stringify(values));
  }
}
// Original regression: selecting a rule must never clear a size chosen earlier.
reset();
choose('size', '25::');
assert.ok(!offered('kind').includes('antiknight'), '25×25 must not offer a 9×9-only rule');
choose('kind', 'normal');
assert.equal(elements.size.value, '25::', 'Rule changes must retain the selected size');
assert.ok(app.matching().every(number => {
  const config = catalog.configs.find(c => number >= c.start && number < c.start + c.count);
  return config.kind === 'normal' && sizeKey(config) === '25::';
}));
let scenarios = 0;
// Every real configuration remains reachable in all six rule/size/level orders.
for (const config of catalog.configs) for (const order of permutations(['kind', 'size', 'level'])) {
  reset();
  const chosen = {};
  for (const field of order) {
    const value = key(config, field);
    choose(field, value);
    chosen[field] = value;
    for (const [prior, expected] of Object.entries(chosen)) assert.equal(elements[prior].value, expected, 'Keep earlier ' + prior);
    assert.ok(app.matching().length > 0, 'Every offered choice must produce results');
  }
  checkAvailable(catalog);
  assert.equal(app.matching().length, config.count);
  scenarios++;
}
// A bounded independent oracle covers all progress states, including a fully played group.
const base = (kind, level, size) => catalog.configs.find(c => c.kind === kind && c.level === level && (!size || sizeKey(c) === size));
const fixture = { configs: [
  base('antiknight', 1), base('cross', 1, '6::'), base('normal', 2, '9::'), base('normal', 18, '9::')
].map((config, index) => ({ ...config, start: index * 3 + 1, count: 3 })) };
assert.ok(fixture.configs.every(config => config.kind), 'Fixture rules exist');
const records = [[1, 'playing'], [2, 'done'], [4, 'done'], [5, 'revealed'], [7, 'playing'], [8, 'done'], [9, 'revealed']]
  .map(([number, state]) => [puzzleId(number), { id: puzzleId(number), state }]);
const stateById = new Map(records.map(([id, progress]) => [id, progress.state]));
for (const config of fixture.configs) for (let number = config.start; number < config.start + config.count; number++) {
  for (const order of permutations(fields)) {
    reset(fixture, records);
    for (const field of order) {
      choose(field, field === 'state' ? stateById.get(puzzleId(number)) || 'new' : key(config, field));
      checkAvailable(fixture, records);
      assert.ok(app.matching().includes(number));
    }
    scenarios++;
  }
}
// Search changes update every choice without silently dropping existing conditions.
reset(fixture, records);
choose('size', '9::');
choose('kind', 'antiknight');
const beforeSearch = selected();
elements.search.value = 'p-000004';
elements.search.oninput();
while (timers.length) timers.shift()();
assert.deepEqual(selected(), beforeSearch);
assert.equal(app.matching().length, 0);
checkAvailable(fixture, records);
elements.search.value = '';
elements.search.oninput();
while (timers.length) timers.shift()();
assert.deepEqual(selected(), beforeSearch);
assert.equal(app.matching().length, 3);
reset(fixture, records);
elements.search.value = 'p-000004';
elements.search.oninput();
while (timers.length) timers.shift()();
checkAvailable(fixture, records);
assert.deepEqual(offered('kind'), ['cross']);
assert.deepEqual(offered('size'), ['6::']);
assert.deepEqual(offered('state'), ['done']);
reset(fixture, records);
choose('state', 'playing');
choose('kind', 'antiknight');
const beforeProgress = selected();
app.setProgress(records.map(([id, progress]) => [id, id === 'P-000001' ? { ...progress, state: 'done' } : progress]));
app.render();
assert.deepEqual(selected(), beforeProgress);
assert.equal(app.matching().length, 0);
assert.ok(elements.state.selectedOptions[0].disabled && elements.state.selectedOptions[0].hidden);
elements.state.value = 'all';
elements.state.onchange();
assert.equal(app.matching().length, 3);
reset();
assert.deepEqual(offered('state'), ['new'], 'Empty progress states are not offered');
app.setPage(50);
choose('size', '25::');
assert.equal(app.getPage(), 0);
console.log('Collection filters: ' + scenarios + ' selection-order scenarios passed; exact choices, retained conditions, progress, search, pagination and no puzzle downloads verified.');
