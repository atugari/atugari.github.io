// Publish the mobile pattern workspace without changing bytes of previous game releases.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchNotebookApp} from './i18n/patch-notebook.mjs';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),previous='2026.11.02.82',version='2026.11.02.83';
const oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`,out=path.join(root,base);
const prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json'))),notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));
if(![previous,version].includes(prior.version)||notes[0].version!==version||(fs.existsSync(out)&&prior.version!==version))throw Error('Unexpected release state');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
for(const [file,expected]of Object.entries(prior.files))if(hash(fs.readFileSync(path.join(root,file)))!==expected)throw Error('Published bytes changed: '+file);
fs.cpSync(path.join(root,'nanpure/releases',previous),out,{recursive:true});
const source=path.join(root,'scripts/client-overrides/public/notebook');
for(const name of ['app.js','pattern-model.js','pattern-ui.js','pattern-share.js','pattern-share-model.js','shared-puzzle.js','pattern-jobs.js','pattern.css'])fs.copyFileSync(path.join(source,name),path.join(out,'notebook',name));
patchNotebookApp(path.join(out,'notebook'));
const notebookIndex=path.join(out,'notebook/index.html');
if(!fs.readFileSync(notebookIndex,'utf8').includes('src="pattern-share-model.js"'))fs.writeFileSync(notebookIndex,fs.readFileSync(notebookIndex,'utf8').replace('<script src="pattern-share.js"></script>','<script src="pattern-share-model.js"></script><script src="pattern-share.js"></script>'));
fs.writeFileSync(path.join(root,'nanpure/share.html'),fs.readFileSync(path.join(root,'scripts/client-overrides/public/shared-puzzle.html'),'utf8').replaceAll('/notebook/',base+'notebook/'));

if(!fs.readFileSync(notebookIndex,'utf8').includes('src="pattern-jobs.js"'))throw Error('Job manager entry missing');
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const text=fs.readFileSync(file,'utf8'),mapped=text.replaceAll(oldBase,base).replace(/(["'(])\/(notebook|audio|themes)\//g,(_,q,kind)=>q+base+kind+'/').replace(/(["'(])\/(site-theme|site-audio|tap-aid|furigana|ui-text)\.(js|css)/g,(_,q,name,ext)=>q+base+name+'.'+ext);if(text!==mapped)fs.writeFileSync(file,mapped);}
if(!fs.readFileSync(path.join(out,'notebook/index.html'),'utf8').includes('pattern-share.js'))throw Error('Missing pattern sharing');
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,'nanpure/releases',previous,'notebook')});
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
const oldMarker=`var ka="${previous}",wS=`,marker=`var ka="${version}",wS=`;if(shell.split(oldMarker).length!==2)throw Error('Shell version anchor changed');
shell=shell.replace(oldMarker,marker);const start=shell.indexOf(marker)+marker.length,end=shell.indexOf(';',start);shell=shell.slice(0,start)+JSON.stringify(publicReleases(notes))+shell.slice(end);
shell=shell.replace(`let p="${previous}"`,`let p="${announcementVersion(notes)}"`);fs.writeFileSync(shellFile,shell);
for(const file of ['nanpure/index.html','nanpure/collection/player.html']){const target=path.join(root,file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replaceAll(oldBase,base).replaceAll(previous,version));}
const overrides=path.join(root,'scripts/client-overrides'),digest=hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'));
const info={...JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const ai=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));ai.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(ai,null,2)+'\n');
const files=[...new Set([...Object.keys(prior.files),'nanpure/share.html',...walk(out).map(f=>path.relative(root,f))])];
const manifest={...prior,...info,base,patternPosting:{sources:Object.fromEntries(['scripts/client-overrides/public/notebook/pattern-share.js','scripts/client-overrides/public/notebook/pattern-ui.js','scripts/client-overrides/public/notebook/pattern.css','scripts/client-overrides/public/notebook/app.js','scripts/client-overrides/public/notebook/pattern-model.js','scripts/check-nanpure-pattern-difficulty.cjs','scripts/i18n/catalog-pattern-wording-82.cjs','scripts/client-overrides/public/notebook/pattern-jobs.js','scripts/check-nanpure-pattern-jobs.cjs','scripts/check-nanpure-pattern-jobs-browser.cjs','scripts/check-nanpure-pattern-mobile-browser.cjs','scripts/check-nanpure-pattern-browser.cjs','scripts/check-nanpure-collection-entry.cjs','scripts/prepare-pattern-posting-release.mjs','scripts/client-overrides/public/notebook/pattern-share-model.js','scripts/client-overrides/public/notebook/shared-puzzle.js','scripts/client-overrides/public/shared-puzzle.html','scripts/check-nanpure-pattern-share-model.cjs','scripts/check-nanpure-pattern-share-actions.cjs','scripts/check-nanpure-pattern-drawing.cjs','scripts/i18n/catalog-pattern-drawing-83.cjs','scripts/check-nanpure-pattern-share-browser.cjs','scripts/i18n/catalog-pattern-posting-83.cjs'].map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]))},files:Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]))};
for(const record of Object.values(manifest))if(record?.sources)for(const file of Object.keys(record.sources))record.sources[file]=hash(fs.readFileSync(path.join(root,file)));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Prepared X/LINE posting and portable puzzle links',version,files.length,'verified files');
