// npm ci --prefix nanpure-api, then node scripts/prepare-ranking-auto-release.mjs
// Rebuild the maintained ranking component; retain all immutable game releases.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const esbuild=require('../nanpure-api/node_modules/esbuild'),{parse}=require('../nanpure-api/node_modules/acorn');
const previous='2026.11.02.83',version='2026.11.02.84',oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`,out=path.join(root,base);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const filesBelow=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesBelow(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const prior=JSON.parse(read('nanpure/release-manifest.json')),notes=JSON.parse(read('scripts/release-notes.json'));
if(prior.version!==previous||notes[0]?.version!==version||fs.existsSync(out))throw Error('Unexpected release state; never overwrite a published release');
const shellPath=oldBase.slice(1)+'shell/main.js',shell=read(shellPath);
if(hash(shell)!==prior.files[shellPath])throw Error('The verified shell changed');
const ast=parse(shell,{ecmaVersion:'latest',sourceType:'module'}),rank=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='rp');
const walk=(node,visit)=>{if(!node||typeof node!=='object')return;if(typeof node.type==='string')visit(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>walk(child,visit));else if(value&&typeof value==='object')walk(value,visit);};
const literals=new Set();walk(ast,node=>{if(node.type==='Literal'&&typeof node.value==='string')literals.add(node.value);});
if(!rank||!shell.slice(rank.start,rank.end).includes('world-ranking-title'))throw Error('Ranking component anchor changed');
const source=read('scripts/client-overrides/app/ranking-panel.tsx'),hook=' const {locale,t}=useLocale();';
if(source.split(hook).length!==2)throw Error('Ranking source anchor changed');
let component=source.replace(/^'use client';\s*/,'').replace(/^import.*$/gm,'').replace('export default function RankingPanel(','function rp(');
component=component.replace(hook,' const React=gl,useEffect=gl.useEffect,useState=gl.useState,useLocale=Y,Trophy=Dt,ChartNoAxesColumn=_a,RefreshCw=Uu,dailyTitle=$l,levelLabel=Gt,formatTime=yt,fetch=Oe;\n'+hook);
const compiled=await esbuild.transform(component,{loader:'tsx',jsxFactory:'React.createElement',jsxFragment:'React.Fragment',target:'es2022',minify:true,charset:'utf8',legalComments:'none'});
if(!compiled.code.startsWith('function rp('))throw Error('Unexpected ranking compilation');
const catalog=require('./i18n/catalog.cjs'),added=require('./i18n/catalog-ranking-auto-84.json');
const automatic=Object.keys(added).find(key=>key.startsWith('日替わり問題をクリアすると、'));
const oldPrivacy=Object.keys(catalog).find(key=>literals.has(key)&&key.startsWith('日本時間の午前0時に問題が切り替わります。')&&key.includes('公開はクリア後に自分で選べます'));
const newPrivacy=Object.keys(added).find(key=>key.startsWith('日本時間の午前0時に問題が切り替わります。'));
const oldFaq='日替わり問題帳の「今日のランキング」で記録を見られます。初めての問題をクリアしたあと、表示名を入力して登録できます。';
const newFaq=Object.keys(added).find(key=>key.startsWith('日替わり問題帳の「今日のランキング」で'));
const copies=new Map([
 ['ルールを確認してからでも、すぐにでも遊べます。ランキングへの登録はクリア後に選べます。',automatic],
 ['表示名を入力してランキングに記録できます。送信せずに閉じても完成は保存されています。',automatic],
 ['クリアタイムを確定しました。名前の入力中はタイムが増えません。',automatic],
 [oldFaq,newFaq],[oldPrivacy,newPrivacy],
]);
if([...copies].some(([a,b])=>!a||!b))throw Error('Missing reviewed ranking copy');
const patches=[{start:rank.start,end:rank.end,text:`/* ranking-source:${hash(source)} */`+compiled.code}],seen=new Set(),effects=[];
walk(ast,node=>{
 if(node.type==='Literal'&&copies.has(node.value)){patches.push({start:node.start,end:node.end,text:JSON.stringify(copies.get(node.value))});seen.add(node.value);}
 if(node.type==='CallExpression'&&node.arguments?.[0]?.type==='ArrowFunctionExpression'){
  const callback=node.arguments[0],text=shell.slice(callback.start,callback.end);
  if(text.length<300&&text.includes('localStorage.getItem("np-display-name")'))effects.push({callback,text});
 }
 if(node.type==='VariableDeclarator'&&node.id?.name==='ka'&&node.init?.value===previous)patches.push({start:node.init.start,end:node.init.end,text:JSON.stringify(version)});
 if(node.type==='VariableDeclarator'&&node.id?.name==='wS'&&node.init?.type==='ArrayExpression')patches.push({start:node.init.start,end:node.init.end,text:JSON.stringify(publicReleases(notes))});
});
if(seen.size!==copies.size||effects.length!==1)throw Error('Verified nickname or help anchors changed');
const {callback,text}=effects[0],setter=text.match(/([\w$]+)\(localStorage\.getItem\("np-display-name"\)\|\|""\)/)?.[1];
if(!setter)throw Error('Nickname state setter changed');
patches.push({start:callback.start,end:callback.end,text:`()=>{const sync=()=>{try{${setter}(localStorage.getItem("np-display-name")||"")}catch{}};sync();window.addEventListener("np-ranking-name-change",sync);return()=>window.removeEventListener("np-ranking-name-change",sync)}`});
patches.sort((a,b)=>b.start-a.start);let rebuilt=shell;
for(let i=0;i<patches.length;i++){if(i&&patches[i].end>patches[i-1].start)throw Error('Overlapping source patches');rebuilt=rebuilt.slice(0,patches[i].start)+patches[i].text+rebuilt.slice(patches[i].end);}
const notification=/function BS\(\)\{let p="([^"]+)"/;
if(!notification.test(rebuilt))throw Error('Release notification anchor changed');
rebuilt=rebuilt.replace(notification,'function BS(){let p="'+announcementVersion(notes)+'"');
parse(rebuilt,{ecmaVersion:'latest',sourceType:'module'});
const oldStyle=read(oldBase.slice(1)+'ranking.css'),shellStyle=read(oldBase.slice(1)+'shell.css'),style=read('scripts/client-overrides/public/ranking.css');
if(!shellStyle.includes(oldStyle))throw Error('Verified ranking style anchor changed');

fs.cpSync(path.join(root,oldBase),out,{recursive:true});
fs.writeFileSync(path.join(out,'shell/main.js'),rebuilt);
fs.writeFileSync(path.join(out,'ranking.css'),style);
fs.writeFileSync(path.join(out,'shell.css'),shellStyle.replace(oldStyle,style));
for(const file of filesBelow(out).filter(file=>/\.(html|js|css)$/.test(file))){const text=fs.readFileSync(file,'utf8');if(text.includes(oldBase))fs.writeFileSync(file,text.replaceAll(oldBase,base));}
const {buildTranslationAssets}=await import('./i18n/build-assets.mjs');
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,oldBase,'notebook')});
for(const file of ['nanpure/index.html','nanpure/collection/player.html'])fs.writeFileSync(path.join(root,file),read(file).replaceAll(oldBase,base).replaceAll(previous,version));
const overrideRoot=path.join(root,'scripts/client-overrides'),digest=hash(filesBelow(overrideRoot).sort().map(file=>path.relative(overrideRoot,file)+'\0'+fs.readFileSync(file)).join('\0'));
const info={...JSON.parse(read('nanpure/version.json')),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous,rankingSourceSha256:hash(source)};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));
fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});
const audioIndex=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));audioIndex.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(audioIndex,null,2)+'\n');
const pins={...prior.files};
// Audio is materialized by the publication workflow; its bytes are unchanged.
for(const [file,digest] of Object.entries(prior.files))if(file.startsWith(oldBase.slice(1)))pins[file.replace(oldBase.slice(1),base.slice(1))]=digest;
for(const file of [...filesBelow(out),...['nanpure/index.html','nanpure/collection/player.html','nanpure/version.json','nanpure/releases.json'].map(file=>path.join(root,file))])pins[path.relative(root,file)]=hash(fs.readFileSync(file));
const sourceFiles=['scripts/client-overrides/app/ranking-panel.tsx','scripts/client-overrides/app/game.tsx','scripts/client-overrides/app/site-menu.tsx','scripts/client-overrides/app/privacy/page.tsx','scripts/client-overrides/public/ranking.css','scripts/i18n/catalog-ranking-auto-84.json','scripts/i18n/catalog.cjs','scripts/check-nanpure-ranking.cjs','scripts/check-nanpure-ranking-browser.cjs','scripts/prepare-ranking-auto-release.mjs'];
const manifest={...prior,...info,base,rankingAutomatic:{sources:Object.fromEntries(sourceFiles.map(file=>[file,hash(read(file))]))},files:pins};
for(const record of Object.values(manifest))if(record?.sources)for(const file of Object.keys(record.sources))if(fs.existsSync(path.join(root,file)))record.sources[file]=hash(fs.readFileSync(path.join(root,file)));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared automatic daily ranking and shared nicknames:',version);
