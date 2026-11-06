const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const release = '2026.11.04.95';
const notebook = path.resolve(__dirname, '../../nanpure/releases', release, 'notebook');
const uniqueSolver = path.join(__dirname, 'engine-overrides/unique-solver.js');
const ids = ['core-normal', 'core-big', 'core-killer', 'core-rect', 'core-giant',
  'core-hundred', 'core-expert', 'core-master-logic', 'core-master', 'core-cover-logic',
  'core-cover', 'core-resolution-logic', 'core-resolution', 'core-deduction', 'core-neighbor',
  'core-step', 'core-cross', 'core-linked', 'core-variants', 'core-expansion', 'core-multi',
  'common-source', 'generator-source', 'core-mixed-multi'];
function loadReleaseEngine({optimized = true} = {}) {
  const html = fs.readFileSync(path.join(notebook, 'index.html'), 'utf8');
  const scripts = ids.map(id => {
    const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
    if (!match) throw new Error('Missing worker source: ' + id);
    return match[1];
  });
  // Apply the verified 9x9 solver before loading the higher-difficulty generators.
  // Keep the original release and its 427 conditions pinned for compatibility.
  if (optimized) scripts.splice(1, 0, fs.readFileSync(uniqueSolver, 'utf8'));
  return 'var global = self;\n' + scripts.join('\n') + '\n' +
    fs.readFileSync(path.join(notebook, 'batch.js'), 'utf8') + '\n';
}

function listProfiles(engine = loadReleaseEngine()) {
  const context = vm.createContext({performance});
  context.self = context;
  vm.runInContext(engine, context);
  const profiles = vm.runInContext(`NPBatch.jobs({
    kinds: Object.keys(NP.KIND), sizes: 'all', allShapes: true, allComplexities: true, each: 1
  }).map(({count, ...condition}) => ({key: NPBatch.configKey(condition), ...condition}))`, context);
  if (new Set(profiles.map(profile => profile.key)).size !== profiles.length) {
    throw new Error('Duplicate refill profile key.');
  }
  return profiles;
}

if (require.main === module) {
  const output = process.argv[2];
  if (!output) throw new Error('An output path for engine.js is required.');
  const engine = loadReleaseEngine();
  const profiles = JSON.stringify(listProfiles(engine));
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, engine + 'const REFILL_PROFILES = ' + profiles + ';\n');
  fs.writeFileSync(path.join(path.dirname(output), 'profiles.json'), profiles);
}

module.exports = {loadReleaseEngine, listProfiles};
