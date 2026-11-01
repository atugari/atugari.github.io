// Add full-screen play while retaining all previously published release bytes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previous='2026.11.01.69',version='2026.11.01.70';
const oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`;
const out=path.join(root,base),prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json')));
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));
if(![previous,version].includes(prior.version)||notes[0].version!==version)throw Error('Unexpected release');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const text=fs.readFileSync(file,'utf8');if(text.includes(oldBase))fs.writeFileSync(file,text.replaceAll(oldBase,base));}
for(const name of ['board-comfort-model.js','wado-play.html','wado-play.js','wado.html','wado-ui.js']){
 let text=fs.readFileSync(path.join(root,'scripts/client-overrides/public/notebook',name),'utf8');
 text=text.replace(/(["'(])\/(site-theme|ui-text)\.(js|css)/g,(_,q,name,ext)=>q+base+name+'.'+ext);
 fs.writeFileSync(path.join(out,'notebook',name),text);
}
fs.copyFileSync(path.join(root,'scripts/i18n/runtime.js'),path.join(out,'notebook/i18n.js'));
fs.copyFileSync(path.join(root,'scripts/furigana.js'),path.join(out,'furigana.js'));
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,oldBase,'notebook')});
for(const file of walk(path.join(out,'notebook')).filter(f=>f.endsWith('.html'))){
 let text=fs.readFileSync(file,'utf8');
 if(!text.includes('src="i18n.js"'))text=text.replace('</head>','<script src="i18n-data.js"></script><script src="i18n.js"></script></head>');
 text=text.replace('</head>','<script>if(parent!==window)document.documentElement.dataset.embedded="true";</script><style>html[data-embedded="true"] #np-language-bar{display:none!important}</style></head>');
 if(!text.includes('furigana.js'))text=text.replace('</body>','<script defer src="'+base+'furigana.js"></script></body>');
 fs.writeFileSync(file,text);
}
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
const oldMarker=`var ka="${previous}",wS=`,marker=`var ka="${version}",wS=`;
if(shell.split(oldMarker).length!==2)throw Error('Shell version anchor changed');
shell=shell.replace(oldMarker,marker);const start=shell.indexOf(marker)+marker.length,end=shell.indexOf(';',start);
shell=shell.slice(0,start)+JSON.stringify(publicReleases(notes))+shell.slice(end);
shell=shell.replace(`let p="${previous}"`,`let p="${announcementVersion(notes)}"`);fs.writeFileSync(shellFile,shell);
const home=path.join(root,'nanpure/index.html');fs.writeFileSync(home,fs.readFileSync(home,'utf8').replaceAll(oldBase,base).replaceAll(previous,version));
const player=path.join(root,'nanpure/collection/player.html');let playerHTML=fs.readFileSync(player,'utf8').replaceAll(oldBase,base);
if(!playerHTML.includes('board-fullscreen.css'))playerHTML=playerHTML.replace('</head>','<link rel="stylesheet" href="'+base+'notebook/board-fullscreen.css"></head>');
if(!playerHTML.includes('board-fullscreen.js'))playerHTML=playerHTML.replace('</body>','<script src="'+base+'notebook/board-fullscreen.js"></script></body>');fs.writeFileSync(player,playerHTML);
for(const name of ['index.html','app.js']){const file=path.join(root,'nanpure/collection',name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('20261101-fullscreen1','20261101-reading1'));}
const overrides=path.join(root,'scripts/client-overrides');
const digest=hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'));
const info={...JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});
const ai=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));ai.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(ai,null,2)+'\n');
const files=[...new Set([...Object.keys(prior.files),...walk(out).map(f=>path.relative(root,f)),'nanpure/assets/reading-tools.js','puzzles/entry.js'])];
// Older manifests also describe audio delivered outside the Git checkout.
const manifest={...prior,...info,base,readingSupport:{sources:Object.fromEntries(['scripts/i18n/catalog-reading-70.cjs','scripts/i18n/reading-aliases.cjs','scripts/i18n/wado-reading-70.cjs','scripts/i18n/runtime.js','scripts/furigana.js','nanpure/assets/reading-tools.js','scripts/prepare-reading-release.mjs'].map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]))},files:Object.fromEntries(files.map(f=>[f,fs.existsSync(path.join(root,f))?hash(fs.readFileSync(path.join(root,f))):prior.files[f]]))};
for(const file of Object.keys(manifest.pareasobiNavigation?.sources||{}))manifest.pareasobiNavigation.sources[file]=hash(fs.readFileSync(path.join(root,file)));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared shared translation and reading release',version,files.length,'verified files');
