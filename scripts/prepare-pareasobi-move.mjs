// Refresh only the stable navigation assets in the verified release manifest.
// Existing versioned engines, puzzle packs and release history remain immutable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {refreshMetadata} from './collection-100k/refresh-metadata.cjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
refreshMetadata(root);
// The collection uses the common gesture source, including alignment-aware zoom.
fs.copyFileSync(path.join(root,'scripts/client-overrides/public/notebook/board-input.js'),path.join(root,'nanpure/collection/board-input.js'));
const playerFile=path.join(root,'nanpure/collection/player.html');
const player=fs.readFileSync(playerFile,'utf8');
if(!/src="\/nanpure\/collection\/board-input\.js(?:\?[^"]*)?"/.test(player))throw Error('Collection gesture loader was not found');
fs.writeFileSync(playerFile,player.replace(/src="\/nanpure\/collection\/board-input\.js(?:\?[^"]*)?"/,'src="/nanpure/collection/board-input.js?v=20261031-type1"'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const manifestFile=path.join(root,'nanpure/release-manifest.json');
const manifest=JSON.parse(fs.readFileSync(manifestFile));
const allowed=file=>file==='nanpure/index.html'||['nanpure/collection/entry.js','nanpure/collection/app.js','nanpure/collection/index.html','nanpure/collection/style.css','nanpure/collection/workspace.css'].includes(file)||/^puzzles\/(?:entry\.js|navigation\.js|(?:[a-z-]+\/)?index\.html|cross\/stock\/index\.html)$/.test(file);
let changed=0;
for(const [file,expected]of Object.entries(manifest.files)){
 const actual=hash(file);if(actual===expected)continue;
 if(!allowed(file))throw Error('Unexpected release change: '+file);
 manifest.files[file]=actual;changed++;
}
const sources=['puzzles/entry.js','puzzles/navigation.js','nanpure/collection/app.js','nanpure/collection/progress-model.mjs','nanpure/collection/style.css','nanpure/collection/catalog-model.mjs','nanpure/collection/pack-reader.mjs','scripts/seo/build-seo.mjs','nanpure/collection/workspace.css','nanpure/collection/workspace.js','nanpure/collection/board-input.js','nanpure/collection/player.html','scripts/prepare-pareasobi-move.mjs','scripts/export-nanpure.mjs','scripts/client-overrides/public/notebook/board-input.js','scripts/client-overrides/app/game.tsx','scripts/client-overrides/app/site-intro.tsx'];
sources.push('scripts/collection-100k/refresh-metadata.cjs');
manifest.pareasobiNavigation={revision:'20261031-stock1',sources:Object.fromEntries(sources.map(file=>[file,hash(file)]))};
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared stable Pareasobi navigation:',changed,'manifest entries; immutable engines and puzzle data unchanged.');
