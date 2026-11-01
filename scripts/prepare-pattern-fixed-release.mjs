// Give pattern drawing a full page and a stable readable board; preserve all published bytes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {patchNotebookApp} from './i18n/patch-notebook.mjs';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previous='2026.11.01.75',version='2026.11.01.76';
const oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`;
const out=path.join(root,'nanpure/releases',version),prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json')));
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));
if(![previous,version].includes(prior.version)||notes[0].version!==version)throw Error('Unexpected release');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const relocate=text=>text.replaceAll(oldBase,base)
 .replace(/(["'(])\/(notebook|audio|themes)\//g,(_,q,kind)=>q+base+kind+'/')
 .replace(/(["'(])\/(site-theme|site-audio|tap-aid|furigana|ui-text)\.(js|css)/g,(_,q,name,ext)=>q+base+name+'.'+ext);
fs.cpSync(path.join(root,'nanpure/releases',previous),out,{recursive:true});
const source=path.join(root,'scripts/client-overrides/public/notebook');
for(const name of ['app.js','pattern-model.js','pattern-ui.js','pattern.css'])fs.copyFileSync(path.join(source,name),path.join(out,'notebook',name));
patchNotebookApp(path.join(out,'notebook'));
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const text=fs.readFileSync(file,'utf8'),mapped=relocate(text);if(mapped!==text)fs.writeFileSync(file,mapped);}
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,'nanpure/releases',previous,'notebook')});
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
const oldMarker=`var ka="${previous}",wS=`,marker=`var ka="${version}",wS=`;
if(shell.split(oldMarker).length!==2)throw Error('Shell version anchor changed');
shell=shell.replace(oldMarker,marker);const start=shell.indexOf(marker)+marker.length,end=shell.indexOf(';',start);
shell=shell.slice(0,start)+JSON.stringify(publicReleases(notes))+shell.slice(end);
shell=shell.replace(`let p="${previous}"`,`let p="${announcementVersion(notes)}"`);fs.writeFileSync(shellFile,shell);
for(const file of ['nanpure/index.html','nanpure/collection/player.html']){const target=path.join(root,file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replaceAll(oldBase,base).replaceAll(previous,version));}
const overrides=path.join(root,'scripts/client-overrides');
const digest=hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'));
const info={...JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});
const ai=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));ai.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(ai,null,2)+'\n');
const files=[...new Set([...Object.keys(prior.files),...walk(out).map(f=>path.relative(root,f))])];
const manifest={...prior,...info,base,patternWorkspace:{sources:Object.fromEntries(['scripts/client-overrides/public/notebook/pattern-model.js','scripts/client-overrides/public/notebook/pattern-ui.js','scripts/client-overrides/public/notebook/pattern.css','scripts/check-nanpure-pattern.cjs','scripts/check-nanpure-pattern-math.cjs','scripts/check-nanpure-pattern-browser.cjs','scripts/prepare-pattern-fixed-release.mjs','scripts/client-overrides/public/notebook/app.js'].map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]))},files:Object.fromEntries(files.map(f=>[f,fs.existsSync(path.join(root,f))?hash(fs.readFileSync(path.join(root,f))):prior.files[f]]))};
for(const record of Object.values(manifest))if(record?.sources)for(const file of Object.keys(record.sources))record.sources[file]=hash(fs.readFileSync(path.join(root,file)));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared fixed-workspace release',version,files.length,'verified files');
