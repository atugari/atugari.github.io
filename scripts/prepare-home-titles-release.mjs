// Keep unchanged assets byte-identical so Git can reuse the existing blobs.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{fileURLToPath}from'node:url';
import{publicReleases,announcementVersion}from'./public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),previous='2026.10.24.53',version='2026.10.25.54';
const prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json')));
if(prior.version!==previous)throw Error('Unexpected previous release');
const oldBase='/nanpure/releases/'+previous+'/',base='/nanpure/releases/'+version+'/',out=path.join(root,base),pub=path.join(root,'scripts/client-overrides/public');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const text=fs.readFileSync(file,'utf8');if(text.includes(oldBase))fs.writeFileSync(file,text.replaceAll(oldBase,base));}
for(const name of ['achievements.js','achievements-hooks.js','achievements.css','home-layout.js','home-layout.css'])fs.copyFileSync(path.join(pub,name),path.join(out,name));
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));if(notes[0].version!==version)throw Error('Missing release note');
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
const anchor='var ka="'+previous+'",wS=';if(shell.split(anchor).length!==2)throw Error('Shell version anchor changed');shell=shell.replace(anchor,'var ka="'+version+'",wS=');
const marker='var ka="'+version+'",wS=',begin=shell.indexOf(marker)+marker.length,end=shell.indexOf(';',begin);shell=shell.slice(0,begin)+JSON.stringify(publicReleases(notes))+shell.slice(end);
shell=shell.replace(/let p="2026\.10\.24\.52"/,'let p="'+announcementVersion(notes)+'"');fs.writeFileSync(shellFile,shell);
const homeFile=path.join(root,'nanpure/index.html');let home=fs.readFileSync(homeFile,'utf8');
home=home.replaceAll(oldBase,base);
for(const name of ['achievements-core.js','achievements-catalog.js','achievements.js','achievements-hooks.js'])home=home.replace(oldBase+name,base+name);
home=home.replace('</head>','<link rel="stylesheet" data-home-layout href="'+base+'home-layout.css"><script defer src="'+base+'home-layout.js"></script></head>');
home=home.replace(/(class="home-version"[^]*?data-i18n-skip="true">)\d{4}\.\d{2}\.\d{2}\.\d+/,'$1'+version);fs.writeFileSync(homeFile,home);
const overrides=path.join(root,'scripts/client-overrides'),digest=crypto.createHash('sha256').update(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0')).digest('hex');
const info={version,announcementVersion:announcementVersion(notes),sourceCommit:prior.sourceCommit,clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.mkdirSync(audio,{recursive:true});fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const audioIndex=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));audioIndex.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(audioIndex,null,2)+'\n');
const files=[...new Set([...Object.keys(prior.files),...walk(out).map(f=>path.relative(root,f))])];
const manifest={...prior,...info,base,files:Object.fromEntries(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]))};
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Prepared home and collection release',version,files.length,'verified files');
