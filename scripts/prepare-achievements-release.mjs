// Extend the verified client at explicit action boundaries; keep old releases immutable.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{fileURLToPath}from'node:url';
import{publicReleases,announcementVersion}from'./public-release-policy.mjs';
import{patchShirupure,patchNotebookApp}from'./i18n/patch-notebook.mjs';
import{buildTranslationAssets}from'./i18n/build-assets.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),previous='2026.10.24.51',version='2026.10.24.53',oldBase='/nanpure/releases/'+previous+'/',base='/nanpure/releases/'+version+'/',out=path.join(root,base),prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json')));
if(![previous,'2026.10.24.52',version].includes(prior.version))throw Error('Unexpected previous release');
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));if(notes[0].version!==version)throw Error('Missing release note');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f)))fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll(oldBase,base));
const overrides=path.join(root,'scripts/client-overrides'),pub=path.join(overrides,'public');
for(const name of ['achievements-core.js','achievements-catalog.js','achievements.js','achievements-hooks.js','achievements.css'])fs.copyFileSync(path.join(pub,name),path.join(out,name));
// Copy current notebook sources only where title hooks changed. Preserve translated asset paths.
for(const name of ['app.js','shirupure.html','crossword-ui.js','tenbin-ui.js','prototype.js','wado-play.js','wado-ui.js','wado.html']){
 const old=fs.readFileSync(path.join(out,'notebook',name),'utf8'),src=fs.readFileSync(path.join(pub,'notebook',name),'utf8');
 // These sources already contain all reviewed play fixes. Apply the existing URL rewrite.
 let text=src.replace(/\/(notebook|audio|themes)\//g,`${base}$1/`).replace(/\/(site-theme|site-audio|tap-aid|furigana|ui-text)\.(js|css)/g,`${base}$1.$2`);
 if(name.endsWith('.html')){text=text.replace('<head>','<head><meta name="robots" content="noindex, follow">').replace('</head>',`<script defer src="${base}keyboard-access.js"></script></head>`);}
 fs.writeFileSync(path.join(out,'notebook',name),text);
}
patchShirupure(path.join(out,'notebook'));patchNotebookApp(path.join(out,'notebook'));
// Reuse the immutable language packs; ship the new interface/news text as a small delta.
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,'nanpure/releases/2026.10.23.43/notebook')});
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
function patch(a,b){if(shell.split(a).length!==2)throw Error('Shell anchor changed: '+a.slice(0,100));shell=shell.replace(a,b);}
patch('var ka="'+previous+'",wS=', 'var ka="'+version+'",wS=');
patch('Cl.current=B==="daily"&&!!k&&!Qe;',`Cl.current=B==="daily"&&!!k&&!Qe;(0,E.useEffect)(()=>{window.NPAchievementShellAttached=true;window.NPAchievementHooks?.shell({tab:B,blocked:!!$||Me,rankedActive:!!k?.ranked&&!Qe,session:k,grid:le,run:Yu.current,hints:Rt.current,settings:ee});});`);
patch('function Kr(i,b){if(!k)return;', 'function Kr(i,b){if(!k)return;window.NPAchievementHooks?.dailyClear(k,i,b,Rt.current,iu,ee,le);');
patch('(!j&&i&&le[b]!==i&&SS(', '(window.NPAchievementHooks?.dailyInput(k,b,i,le[b],j,ee),!j&&i&&le[b]!==i&&SS(');
patch('let i=ye[ye.length-1];ha(i.grid)', 'let i=ye[ye.length-1];window.NPAchievementHooks?.dailyUndo(k,le.findIndex((x,j)=>x!==i.grid[j]),false);ha(i.grid)');
patch('var '+(shell.match(/var (\w+)=\["np-ui-text-v1"/)||[])[1]+'=["np-ui-text-v1"', 'var '+(shell.match(/var (\w+)=\["np-ui-text-v1"/)||[])[1]+'=["np-achievements-v1","np-achievement-identity-v1","np-ui-text-v1"');
const marker='var ka=\"'+version+'\",wS=',begin=shell.indexOf(marker)+marker.length,end=shell.indexOf(';',begin);if(begin<marker.length||end<begin)throw Error('Missing release array');shell=shell.slice(0,begin)+JSON.stringify(publicReleases(notes))+shell.slice(end);shell=shell.replace('let p=\"'+previous+'\"','let p=\"'+announcementVersion(notes)+'\"');
fs.writeFileSync(shellFile,shell);
const scripts=['achievements-core.js','achievements-catalog.js','achievements.js','achievements-hooks.js'].map(n=>`<script defer src="${base+n}"></script>`).join('');
for(const file of walk(path.join(out,'notebook')).filter(f=>f.endsWith('.html'))){let text=fs.readFileSync(file,'utf8');text=text.replace('</head>',scripts+'</head>');fs.writeFileSync(file,text);}
const stable=Object.keys(prior.files).filter(f=>!f.includes('/releases/'));
for(const name of stable.filter(f=>/\.(html|css|xml|txt)$/.test(f))){const file=path.join(root,name);let text=fs.readFileSync(file,'utf8').replaceAll(oldBase,base).replaceAll(prior.base,base);if(name==='nanpure/index.html'){text=text.replace(/<script defer src="[^"]+\/achievements(?:-core|-catalog|-hooks)?\.js"><\/script>/g,'');text=text.replace('</head>',scripts+'</head>');}fs.writeFileSync(file,text);}
const digest=crypto.createHash('sha256').update(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0')).digest('hex');
const info={version,announcementVersion:announcementVersion(notes),sourceCommit:prior.sourceCommit,clientOverridesSha256:digest};fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.mkdirSync(audio,{recursive:true});fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const audioIndex=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));audioIndex.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(audioIndex,null,2)+'\n');
const files=[...stable,...walk(out).map(f=>path.relative(root,f))];const manifest={...prior,...info,base,files:Object.fromEntries(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]))};fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Prepared title collection release',version,files.length,'files');
