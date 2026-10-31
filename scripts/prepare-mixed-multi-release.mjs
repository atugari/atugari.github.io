// Extend the immutable release with per-board sizes and user-configured connections.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {publicReleases, announcementVersion} from './public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previous='2026.10.27.65',version='2026.11.01.66';
const oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`;
const prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json')));
if(prior.version!==previous&&prior.version!==version)throw Error('Unexpected base release');
const out=path.join(root,base),pub=path.join(root,'scripts/client-overrides/public/notebook');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const text=fs.readFileSync(file,'utf8');if(text.includes(oldBase))fs.writeFileSync(file,text.replaceAll(oldBase,base));}
const changed=['app.js','common.js','batch.js','portable.js','memo-help.js','logical-hints.js','video-features.js','mixed-multi.js'];
for(const name of changed)fs.copyFileSync(path.join(pub,name),path.join(out,'notebook',name));
// Keep the previously appended appearance and language CSS while adding only new rules.
const cssFile=path.join(out,'notebook/app.css'),css=fs.readFileSync(path.join(pub,'app.css'),'utf8');
fs.appendFileSync(cssFile,'\n'+css.slice(css.indexOf('.multi-size-fields')));
const index=path.join(out,'notebook/index.html');let html=fs.readFileSync(index,'utf8');
html=html.replace(/(<script id="common-source">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+fs.readFileSync(path.join(pub,'common.js'),'utf8')+b);
html=html.replace(/(<script id="generator-source">[\s\S]*?<\/script>)/,all=>all+'<script id="core-mixed-multi">'+fs.readFileSync(path.join(pub,'mixed-multi.js'),'utf8')+'</script>');
if(!html.includes('id="core-mixed-multi"'))throw Error('Mixed worker source missing');
fs.writeFileSync(index,html);
for(const f of walk(path.join(out,'notebook')).filter(f=>f.endsWith('.html')&&f!==index)) {
 const h=fs.readFileSync(f,'utf8');if(h.includes('src="multi.js"')&&h.includes('src="common.js"'))fs.writeFileSync(f,h.replace('<script src="common.js"></script>','<script src="common.js"></script><script src="mixed-multi.js"></script>'));
}
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));
if(notes[0].version!==version)throw Error('Missing release note');
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
const oldMarker=`var ka="${previous}",wS=`,marker=`var ka="${version}",wS=`;
if(shell.split(oldMarker).length!==2)throw Error('Shell version anchor changed');
shell=shell.replace(oldMarker,marker);const start=shell.indexOf(marker)+marker.length,end=shell.indexOf(';',start);
shell=shell.slice(0,start)+JSON.stringify(publicReleases(notes))+shell.slice(end);
shell=shell.replace(/let p="2026\.10\.26\.58"/,'let p="'+announcementVersion(notes)+'"');fs.writeFileSync(shellFile,shell);
// Source overrides use origin-root asset paths; Pages serves them under this release.
// Match only a path beginning at a quoted value or CSS url(), so existing versioned
// paths are not prefixed a second time.
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){
 const source=fs.readFileSync(file,'utf8');
 const mapped=source.replace(/(["'(])\/(notebook|audio|themes)\//g,(_,q,kind)=>q+base+kind+'/')
  .replace(/(["'(])\/(site-theme|site-audio|tap-aid|furigana|ui-text)\.(js|css)/g,(_,q,name,ext)=>q+base+name+'.'+ext);
 if(mapped!==source)fs.writeFileSync(file,mapped);
}
const home=path.join(root,'nanpure/index.html');fs.writeFileSync(home,fs.readFileSync(home,'utf8').replaceAll(oldBase,base).replaceAll(previous,version));
const overrides=path.join(root,'scripts/client-overrides');
const digest=crypto.createHash('sha256').update(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0')).digest('hex');
const info={...JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});
const ai=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));ai.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(ai,null,2)+'\n');
const files=[...new Set([...Object.keys(prior.files),...walk(out).map(f=>path.relative(root,f))])];
const manifest={...prior,...info,base,files:Object.fromEntries(files.map(name=>[name,hash(path.join(root,name))]))};
if(manifest.pareasobiNavigation?.sources?.['scripts/export-nanpure.mjs'])manifest.pareasobiNavigation.sources['scripts/export-nanpure.mjs']=hash(path.join(root,'scripts/export-nanpure.mjs'));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared mixed-size multi release',version,files.length,'verified files');
