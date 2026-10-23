// Shared keyboard release from the verified .37 client. The shell changes
// only its asset base, version, release entry and saved-settings backup key list.
// ESBUILD_MODULE=/path/to/esbuild node scripts/release-nanpure-keybindings-38.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {patchNotebookApp} from './i18n/patch-notebook.mjs';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {buildSearchPages} from './seo/build-seo.mjs';
const require=createRequire(import.meta.url),{transformSync}=require(process.env.ESBUILD_MODULE||'esbuild');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previous='2026.10.23.37',version='2026.10.23.38';
const base='/nanpure/releases/'+version+'/',oldBase='/nanpure/releases/'+previous+'/';
const output=path.join(root,base),overrides=path.join(root,'scripts/client-overrides');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json'),'utf8'));
if(notes[0].version!==version)throw Error('Release notes version mismatch');
// Audio is transferred as bounded text packages; restore the verified base
// before copying so a clean checkout produces the same complete release.
const restore=spawnSync('python3',[path.join(root,'scripts/enhance-nanpure.py'),root],{stdio:'inherit'});
if(restore.status!==0)throw Error('Base release validation failed');
fs.cpSync(path.join(root,oldBase),output,{recursive:true});
for(const file of walk(output).filter(f=>/\.(html|js|css|json)$/.test(f)))fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll(oldBase,base));
for(const name of ['app.js','compact-play.js']){
 const source=fs.readFileSync(path.join(overrides,'public/notebook',name),'utf8').replace(/\/(notebook|audio|themes)\//g,base+'$1/');
 fs.writeFileSync(path.join(output,'notebook',name),source);
}
patchNotebookApp(path.join(output,'notebook'));
for(const name of ['app.js','compact-play.js']){const file=path.join(output,'notebook',name);fs.writeFileSync(file,transformSync(fs.readFileSync(file,'utf8'),{minify:true,target:'es2022'}).code);}
fs.writeFileSync(path.join(output,'keyboard-access.js'),transformSync(['key-bindings.js','keyboard-access.js'].map(name=>fs.readFileSync(path.join(overrides,'public',name),'utf8')).join('\n'),{minify:true,target:'es2022'}).code);
const shell=path.join(output,'shell/main.js'),old='var ka="'+previous+'",hS=[';
let bundle=fs.readFileSync(shell,'utf8');const backup='"np-selection-design-v1","np-daily-stats-v1"';if(bundle.split(backup).length!==2)throw Error('Backup key list changed');bundle=bundle.replace(backup,'"np-selection-design-v1","np-key-bindings-v1","np-daily-stats-v1"');if(!bundle.includes(old))throw Error('Verified .37 shell marker changed');
fs.writeFileSync(shell,bundle.replace(old,'var ka="'+version+'",hS=['+JSON.stringify(notes[0])+','));
buildTranslationAssets(path.join(output,'notebook'),version);
const home=path.join(root,'nanpure/index.html'),html=fs.readFileSync(home,'utf8');
if(!html.includes(oldBase)&&!html.includes(base))throw Error('Home release base changed');
fs.writeFileSync(home,html.replaceAll(oldBase,base).replace('>'+previous+'</span>','>'+version+'</span>'));
const oldVersion=JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'),'utf8'));
const hash=crypto.createHash('sha256').update(walk(overrides).sort().map(file=>path.relative(overrides,file)+'\0'+fs.readFileSync(file)).join('\0')).digest('hex');
const metadata={version,sourceCommit:oldVersion.sourceCommit,clientOverridesSha256:hash,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(metadata));
fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,releases:notes},null,2)+'\n');
const searchFiles=buildSearchPages(root,version,base);
const audio=spawnSync('python3',[path.join(root,'scripts/pack-nanpure-audio.py'),version],{stdio:'inherit'});
if(audio.status!==0)throw Error('Audio packaging failed');
const files=[home,path.join(root,'nanpure.html'),path.join(root,'nanpure/version.json'),path.join(root,'nanpure/releases.json'),...searchFiles,...walk(output)];
const manifest={...metadata,base,online:'https://puzzle-api.puzzle-hub-4826.workers.dev',files:Object.fromEntries(files.map(file=>[path.relative(root,file),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Exported',version,files.length,'files from verified',previous);
