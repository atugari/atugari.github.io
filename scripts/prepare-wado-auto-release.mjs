// Build the print-only hint update on top of the already verified public client.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{fileURLToPath}from'node:url';
import{reuseVerifiedShell}from'./reuse-nanpure-shell-48.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),previous='2026.10.24.47',version='2026.10.24.48',oldBase='/nanpure/releases/'+previous+'/',base='/nanpure/releases/'+version+'/',out=path.join(root,base),prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json')));
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));if(notes[0].version!==version)throw Error('Missing release note');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f)))fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll(oldBase,base));
const source=path.join(root,'scripts/client-overrides/public/notebook');
for(const name of ['wado.html','wado-ui.js','wado-worker.js','wado-engine.js','wado.css','wado-clues.js','wado-hints.json','wado-paper.js','wado-paper.css']){
 let text=fs.readFileSync(path.join(source,name),'utf8');if(name==='wado.html')text=text.replace('<head>','<head><meta name="robots" content="noindex, follow">').replaceAll('/site-theme.js',base+'site-theme.js').replaceAll('/ui-text.js',base+'ui-text.js').replace('</head>','<script defer src="'+base+'keyboard-access.js"></script></head>');
 fs.writeFileSync(path.join(out,'notebook',name),text);
}
reuseVerifiedShell(root,out,notes[0]);
const i18n=path.join(out,'notebook/i18n-data.js');fs.writeFileSync(i18n,fs.readFileSync(i18n,'utf8').replace('"version":"'+previous+'"','"version":"'+version+'"'));
for(const name of Object.keys(prior.files).filter(f=>!f.includes('/releases/')&&!['nanpure/version.json','nanpure/releases.json'].includes(f)))if(/\.(html|css|xml|txt)$/.test(name)){const file=path.join(root,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll(oldBase,base));}
const overrides=path.join(root,'scripts/client-overrides'),digest=crypto.createHash('sha256').update(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0')).digest('hex');
const info={version,sourceCommit:prior.sourceCommit,clientOverridesSha256:digest};fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,releases:notes},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.mkdirSync(audio,{recursive:true});fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const audioIndex=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));audioIndex.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(audioIndex,null,2)+'\n');
const stable=Object.keys(prior.files).filter(f=>!f.includes('/releases/')),files=[...stable,...walk(out).map(f=>path.relative(root,f))];
const manifest={...prior,...info,base,files:Object.fromEntries(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]))};fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared Wado hint release',version,files.length,'files');
