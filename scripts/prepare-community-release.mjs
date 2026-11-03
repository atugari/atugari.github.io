// Copy unchanged assets verbatim; never edit an already published release.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),{parse}=require('../nanpure-api/node_modules/acorn');
const previous='2026.11.02.84',version='2026.11.03.85',oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`,out=path.join(root,base);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const prior=JSON.parse(read('nanpure/release-manifest.json')),notes=JSON.parse(read('scripts/release-notes.json'));
if(prior.version!==previous||notes[0]?.version!==version||fs.existsSync(out))throw Error('Unexpected release state; published releases must not be overwritten');
const shellFile=oldBase.slice(1)+'shell/main.js',source=read(shellFile);if(hash(source)!==prior.files[shellFile])throw Error('The verified shell changed');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),patches=[];let found=0;
function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name==='ka'&&n.init?.value===previous){patches.push({start:n.init.start,end:n.init.end,text:JSON.stringify(version)});found++;}if(n.type==='VariableDeclarator'&&n.id?.name==='wS'&&n.init?.type==='ArrayExpression'){patches.push({start:n.init.start,end:n.init.end,text:JSON.stringify(publicReleases(notes))});found++;}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
visit(ast);if(found!==2)throw Error('Version or news anchors changed');let shell=source;for(const p of patches.sort((a,b)=>b.start-a.start))shell=shell.slice(0,p.start)+p.text+shell.slice(p.end);
const notification=/function BS\(\)\{let p="([^"]+)"/;if(!notification.test(shell))throw Error('News anchor changed');shell=shell.replace(notification,'function BS(){let p="'+announcementVersion(notes)+'"');parse(shell,{ecmaVersion:'latest',sourceType:'module'});
fs.cpSync(path.join(root,oldBase),out,{recursive:true});fs.writeFileSync(path.join(out,'shell/main.js'),shell);
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const text=fs.readFileSync(file,'utf8');if(text.includes(oldBase))fs.writeFileSync(file,text.replaceAll(oldBase,base));}
for(const file of ['nanpure/index.html','nanpure/collection/player.html'])fs.writeFileSync(path.join(root,file),read(file).replaceAll(oldBase,base).replaceAll(previous,version));
const overrides=path.join(root,'scripts/client-overrides'),digest=hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'));
const communitySources=[...walk(path.join(root,'nanpure/exhibitions')),...walk(path.join(root,'nanpure/gallery')),...['scripts/prepare-community-release.mjs','scripts/install-nanpure-gallery.mjs','scripts/check-community-recorder.cjs','scripts/check-nanpure-exhibitions-browser.cjs'].map(f=>path.join(root,f))].filter(f=>fs.existsSync(f));
const sources=Object.fromEntries(communitySources.map(f=>[path.relative(root,f),hash(fs.readFileSync(f))]));
const info={...JSON.parse(read('nanpure/version.json')),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous,communitySourceSha256:hash(JSON.stringify(sources))};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const audioIndex=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));audioIndex.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(audioIndex,null,2)+'\n');
const pins={...prior.files};for(const [file,digest]of Object.entries(prior.files))if(file.startsWith(oldBase.slice(1)))pins[file.replace(oldBase.slice(1),base.slice(1))]=digest;
for(const file of [...walk(out),...['nanpure/index.html','nanpure/collection/player.html','nanpure/version.json','nanpure/releases.json'].map(f=>path.join(root,f))])pins[path.relative(root,file)]=hash(fs.readFileSync(file));
const manifest={...prior,...info,base,community:{version:1,path:'/nanpure/exhibitions/',sources},files:pins};for(const record of Object.values(manifest))if(record?.sources)for(const file of Object.keys(record.sources))if(fs.existsSync(path.join(root,file)))record.sources[file]=hash(read(file));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Prepared exhibition, replay and home release',version);
