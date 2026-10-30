// Refresh only the stable navigation assets in the verified release manifest.
// Existing versioned engines, puzzle packs and release history remain immutable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const manifestFile=path.join(root,'nanpure/release-manifest.json');
const manifest=JSON.parse(fs.readFileSync(manifestFile));
const allowed=file=>file==='nanpure/index.html'||['nanpure/collection/entry.js','nanpure/collection/app.js','nanpure/collection/index.html','nanpure/collection/workspace.css'].includes(file)||/^puzzles\/(?:entry\.js|navigation\.js|(?:[a-z-]+\/)?index\.html|cross\/stock\/index\.html)$/.test(file);
let changed=0;
for(const [file,expected]of Object.entries(manifest.files)){
 const actual=hash(file);if(actual===expected)continue;
 if(!allowed(file))throw Error('Unexpected release change: '+file);
 manifest.files[file]=actual;changed++;
}
const sources=['puzzles/entry.js','puzzles/navigation.js','nanpure/collection/app.js','nanpure/collection/workspace.css','scripts/export-nanpure.mjs','scripts/client-overrides/app/game.tsx','scripts/client-overrides/app/site-intro.tsx'];
manifest.pareasobiNavigation={revision:'20261031-move4',sources:Object.fromEntries(sources.map(file=>[file,hash(file)]))};
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared stable Pareasobi navigation:',changed,'manifest entries; immutable engines and puzzle data unchanged.');
