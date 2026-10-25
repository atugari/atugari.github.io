// Rebuild the maintained cloud component while preserving the verified game.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';
import {buildSearchPages} from './seo/build-seo.mjs';
import {cloudRetiresAt} from '../nanpure-api/src/shared/cloud-retirement.js';
import {buildTranslationAssets} from './i18n/build-assets.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previous=process.argv[2]||'2026.10.26.57',version=process.argv[3]||'2026.10.26.58';
const esbuild=createRequire(import.meta.url)(process.argv[4]||path.join(root,'nanpure-api/node_modules/esbuild'));
const prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json')));
if(![previous,version].includes(prior.version))throw Error('Unexpected prior release');
const oldBase='/nanpure/releases/'+previous+'/',base='/nanpure/releases/'+version+'/',out=path.join(root,base);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const text=fs.readFileSync(file,'utf8');if(text.includes(oldBase))fs.writeFileSync(file,text.replaceAll(oldBase,base));}

const source=fs.readFileSync(path.join(root,'nanpure-api/client/cloud-save.tsx'),'utf8');
const sourceHash=crypto.createHash('sha256').update(source).digest('hex');
// These bindings refer only to the already bundled React, icons, locale and
// authenticated API helpers. The component itself is compiled from its TSX.
let component=source.replace(/^'use client';\s*/,'').replace(/^import.*$/gm,'').replace('export default function CloudSave(','function xp(');
const hook=' const{t,locale}=useLocale()';
if(component.split(hook).length!==2)throw Error('Cloud source anchor changed');
component=component.replace(hook,' const cloudRetiresAt='+cloudRetiresAt+',React=Ct,useEffect=Ct.useEffect,useState=Ct.useState,Cloud=mr,RefreshCw=Uu,useLocale=Y,validateBackup=Or,apiFetch=Oe,apiJSON=Wl,digest=Wc,storedKey=Ni,syncStorage=Ri,useSyncCode=eS;\n'+hook);
const compiled=await esbuild.transform(component,{loader:'tsx',jsxFactory:'React.createElement',jsxFragment:'React.Fragment',target:'es2022',minify:true,charset:'utf8'});
const file=path.join(out,'shell/main.js');let shell=fs.readFileSync(file,'utf8');
const start=shell.indexOf('/* cloud-save-source:'),end=shell.indexOf('var Ll=R(Ce());',start);
if(start<0||end<start||!shell.slice(start,end).includes('5*1024*1024')||!compiled.code.startsWith('function xp('))throw Error('Verified cloud component bindings changed');
shell=shell.slice(0,start)+'/* cloud-save-source:'+sourceHash+' */'+compiled.code+shell.slice(end);
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));
if(notes[0].version!==version)throw Error('Missing release note');
const marker='var ka="'+previous+'",wS=';
if(shell.split(marker).length!==2)throw Error('Version anchor changed');
const a=shell.indexOf(marker)+marker.length;let b=a,depth=0,quoted=false,escaped=false;
for(;b<shell.length;b++){const c=shell[b];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='[')depth++;else if(c===']'&&!--depth){b++;break;}}
shell=shell.slice(0,a)+JSON.stringify(publicReleases(notes))+shell.slice(b);
shell=shell.replace(marker,'var ka="'+version+'",wS=');
const notification=shell.match(/function BS\(\)\{let p="([^"]+)"/);
if(!notification)throw Error('Notification anchor changed');
shell=shell.replace(notification[0],'function BS(){let p="'+announcementVersion(notes)+'"');
fs.writeFileSync(file,shell);
buildSearchPages(root,version,base);
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,'nanpure/releases/2026.10.23.43/notebook')});

const home=path.join(root,'nanpure/index.html');let html=fs.readFileSync(home,'utf8').replaceAll(oldBase,base);
html=html.replace(/(class="home-version"[^]*?data-i18n-skip="true">)\d{4}\.\d{2}\.\d{2}\.\d+/,'$1'+version);fs.writeFileSync(home,html);
const overrides=path.join(root,'scripts/client-overrides');
const digest=crypto.createHash('sha256').update(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0')).digest('hex');
const info={version,announcementVersion:announcementVersion(notes),sourceCommit:prior.sourceCommit,clientOverridesSha256:digest,cloudSaveSourceSha256:sourceHash,cloudRetiresAt,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));
fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.mkdirSync(audio,{recursive:true});fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});
const audioIndex=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));audioIndex.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(audioIndex,null,2)+'\n');
const files=[...Object.keys(prior.files).filter(name=>!name.includes('/releases/')),...walk(out).map(f=>path.relative(root,f))];
const manifest={...prior,...info,base,files:Object.fromEntries(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]))};
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared cloud retirement release',version,files.length,'verified files');
