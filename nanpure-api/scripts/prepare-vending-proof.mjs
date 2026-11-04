import {readFileSync, writeFileSync} from 'node:fs';

const notebook = new URL('../../nanpure/releases/2026.11.04.95/notebook/index.html', import.meta.url);
const output = new URL('../src/shared/vending-proof-engine.generated.js', import.meta.url);
const html = readFileSync(notebook, 'utf8');
const scripts = new Map([...html.matchAll(/<script id="([^"]+)">([\s\S]*?)<\/script>/g)]
  .map(([, id, source]) => [id, source]));
const common = scripts.get('common-source');
const resolution = scripts.get('core-resolution-logic');
if (!common || !resolution) throw new Error('The pinned notebook is missing its Lv18 proof engine.');

// Scope the shipped scripts to this module without eval or changes to the Worker global.
writeFileSync(output, `// Generated from the released notebook by prepare-vending-proof.mjs.
const window = {};
const self = window;
${common}
const NP = window.NP;
${resolution}
export const resolutionLogic = window.NanpureResolutionLogic;
`);
