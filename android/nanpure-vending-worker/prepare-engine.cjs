const fs = require('node:fs');
const path = require('node:path');

const output = process.argv[2];
if (!output) throw new Error('An output path for engine.js is required.');

const release = '2026.11.04.95';
const html = fs.readFileSync(path.resolve(__dirname, '../../nanpure/releases', release, 'notebook/index.html'), 'utf8');
const ids = ['core-normal', 'core-big', 'core-killer', 'core-rect', 'core-giant',
  'core-hundred', 'core-expert', 'core-master-logic', 'core-master', 'core-cover-logic',
  'core-cover', 'core-resolution-logic', 'core-resolution', 'core-deduction', 'core-neighbor',
  'core-step', 'core-cross', 'core-linked', 'core-variants', 'core-expansion', 'core-multi',
  'common-source', 'generator-source', 'core-mixed-multi'];
const scripts = ids.map(id => {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
  if (!match) throw new Error('Missing worker source: ' + id);
  return match[1];
});

fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, 'var global = self;\n' + scripts.join('\n') + '\n');
