import {readFileSync, writeFileSync} from 'node:fs';

const notebook = new URL('../../nanpure/releases/2026.11.04.95/notebook/index.html', import.meta.url);
const output = new URL('../src/shared/vending-proof-engine.generated.js', import.meta.url);
const catalogueOutput = new URL('../src/shared/vending-catalogue-engine.generated.js', import.meta.url);
const html = readFileSync(notebook, 'utf8');
const scripts = new Map([...html.matchAll(/<script id="([^"]+)">([\s\S]*?)<\/script>/g)]
  .map(([, id, source]) => [id, source]));
const common = scripts.get('common-source');
const normal = scripts.get('core-normal');
const resolution = scripts.get('core-resolution-logic');
if (!common || !normal || !resolution) throw new Error('The pinned notebook is missing its vending proof engine.');

// Scope the shipped scripts to this module without eval or changes to the Worker global.
writeFileSync(output, `// Generated from the released notebook by prepare-vending-proof.mjs.
const window = {};
const self = window;
${normal}
${common}
const NP = window.NP;
${resolution}
export const resolutionLogic = window.NanpureResolutionLogic;
export const normalLogic = window.Nanpure;
`);

// Load the rule and layout validators used by the released notebook. The
// generator and its search engines stay out of the admission path.
const catalogueParts = [
  ['core-normal', ['Nanpure']], ['core-big', ['NanpureBig']], ['core-killer', ['Killer2']],
  ['core-deduction', ['NanpureDeduction']], ['core-neighbor', ['NanpureNeighbor']],
  ['core-cross', ['NanpureCross']], ['core-linked', ['NanpureLinked']],
  ['core-variants', ['NanpureVariants', 'NanpureTrio']],
  ['core-expansion', ['NanpureExpansion']], ['core-multi', ['NanpureMulti']],
  ['common-source', ['NP']]
];
const catalogueSource = catalogueParts.map(([id, exports]) => {
  const source = scripts.get(id);
  if (!source) throw new Error('The pinned notebook is missing ' + id);
  return source + '\n' + exports.map(name => 'const ' + name + ' = window.' + name + ';').join('\n');
}).join('\n');
const identitySource = readFileSync(new URL('lan-identity.js', notebook), 'utf8');
writeFileSync(catalogueOutput, `// Generated from the released notebook by prepare-vending-proof.mjs.
const window = {};
const self = window;
const global = window;
const globalThis = window;
${catalogueSource}
${identitySource}
export {NP, NanpureBig, Killer2};
export const canonicalCatalogueIdentity = window.NPLanIdentity;
`);
