// Keep published assets immutable; change only the assistance client and release metadata.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {parse}=createRequire(import.meta.url)('../nanpure-api/node_modules/acorn');
const previous='2026.11.03.88',version='2026.11.04.89';
const oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`,out=path.join(root,base);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const prior=JSON.parse(read('nanpure/release-manifest.json')),notes=JSON.parse(read('scripts/release-notes.json'));
if(prior.version!==previous||notes[0]?.version!==version||fs.existsSync(out))throw Error('Unexpected release state');
for(const file of walk(path.join(root,oldBase)))if(hash(fs.readFileSync(file))!==prior.files[path.relative(root,file)])throw Error('Published asset changed: '+file);
fs.cpSync(path.join(root,oldBase),out,{recursive:true});
fs.copyFileSync(path.join(root,'scripts/client-overrides/public/notebook/generation-assist.js'),path.join(out,'notebook/generation-assist.js'));
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){
 const text=fs.readFileSync(file,'utf8'),mapped=text.replaceAll(oldBase,base);
 if(mapped!==text)fs.writeFileSync(file,mapped);
}
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,oldBase,'notebook')});
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8'),found=0;const patches=[];
function visit(n){
 if(!n||typeof n!=='object')return;
 if(n.type==='VariableDeclarator'&&n.id?.name==='ka'&&n.init?.value===previous){patches.push({start:n.init.start,end:n.init.end,text:JSON.stringify(version)});found++;}
 if(n.type==='VariableDeclarator'&&n.id?.name==='wS'&&n.init?.type==='ArrayExpression'){patches.push({start:n.init.start,end:n.init.end,text:JSON.stringify(publicReleases(notes))});found++;}
 for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);
}
visit(parse(shell,{ecmaVersion:'latest',sourceType:'module'}));if(found!==2)throw Error('Shell anchors changed');
for(const p of patches.sort((a,b)=>b.start-a.start))shell=shell.slice(0,p.start)+p.text+shell.slice(p.end);
const notification=/function BS\(\)\{let p="([^"]+)"/;if(!notification.test(shell))throw Error('News anchor changed');
shell=shell.replace(notification,'function BS(){let p="'+announcementVersion(notes)+'"');parse(shell,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(shellFile,shell);
for(const file of ['nanpure/index.html','nanpure/collection/player.html'])fs.writeFileSync(path.join(root,file),read(file).replaceAll(oldBase,base).replaceAll(previous,version));
const overrides=path.join(root,'scripts/client-overrides'),digest=hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'));
const info={...JSON.parse(read('nanpure/version.json')),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});
const ai=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));ai.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(ai,null,2)+'\n');
const pins={...prior.files},changed=['nanpure/index.html','nanpure/collection/player.html','nanpure/version.json','nanpure/releases.json'];
for(const file of [...walk(out),...changed.map(f=>path.join(root,f))])pins[path.relative(root,file)]=hash(fs.readFileSync(file));
const sources=['scripts/check-generation-assist-browser.cjs','scripts/fixtures/generation-assist-retry.html','scripts/prepare-generation-assist-retry-release.mjs','scripts/check-generation-assist.cjs','scripts/client-overrides/public/notebook/generation-assist.js'];
const manifest={...prior,...info,base,generationAssist:{...prior.generationAssist,version:2,sources:{...prior.generationAssist.sources,...Object.fromEntries(sources.map(f=>[f,hash(read(f))]))}},files:pins};
for(const record of Object.values(manifest))if(record?.sources)for(const file of Object.keys(record.sources))if(fs.existsSync(path.join(root,file)))record.sources[file]=hash(read(file));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared generation assistance retry',version);
