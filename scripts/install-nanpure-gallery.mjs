// Stable entry points only; never rewrite an immutable game release.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimeEntries=new Set(['nanpure/index.html','nanpure.html','nanpure/collection/index.html']);
const entries=[...runtimeEntries,...fs.readdirSync(path.join(root,'nanpure'),{withFileTypes:true}).filter(d=>d.isDirectory()&&/^[a-z]{2}(?:-[a-z]+)?$/.test(d.name)).map(d=>'nanpure/'+d.name+'/index.html')];
const tag='<script defer data-gallery-runtime src="/nanpure/gallery/entry.js?v=1"></script>';
for(const file of entries){const p=path.join(root,file);if(!fs.existsSync(p))continue;let s=fs.readFileSync(p,'utf8');s=s.replace(/<script\b[^>]*data-gallery-runtime[^>]*><\/script>/g,'');if(runtimeEntries.has(file))s=s.replace('</body>',tag+'</body>');fs.writeFileSync(p,s);}
const manifestPath=path.join(root,'nanpure/release-manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
for(const file of entries)if(Object.hasOwn(manifest.files,file))manifest.files[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
for(const record of Object.values(manifest))if(record?.sources&&Object.hasOwn(record.sources,'scripts/export-nanpure.mjs'))record.sources['scripts/export-nanpure.mjs']=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'scripts/export-nanpure.mjs'))).digest('hex');
manifest.gallery={version:1,path:'/nanpure/gallery/',backend:'workers-d1',migrationTarget:'oracle-always-free'};
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log('Gallery entry points installed. Existing game releases were preserved.');
