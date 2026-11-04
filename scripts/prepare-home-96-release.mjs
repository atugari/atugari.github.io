// Publish real home previews, two additional palettes and the centered home chevrons.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),{parse}=require(process.env.NANPURE_ACORN||'../nanpure-api/node_modules/acorn'),{transformSync}=require(process.env.NANPURE_ESBUILD||'../nanpure-api/node_modules/esbuild');
const previous='2026.11.04.95',version='2026.11.04.96',oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`,out=path.join(root,base);
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const prior=JSON.parse(read('nanpure/release-manifest.json')),notes=JSON.parse(read('scripts/release-notes.json'));
if(prior.version!==previous||notes[0]?.version!==version||fs.existsSync(out))throw Error('Unexpected release state');
for(const f of walk(path.join(root,oldBase)))if(hash(fs.readFileSync(f))!==prior.files[path.relative(root,f)])throw Error('Published asset changed: '+f);
fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const name of ['home-layout.css','achievements.js','achievements-hooks.js','themes/accessible.css'])fs.copyFileSync(path.join(root,'scripts/client-overrides/public',name),path.join(out,name));
const themeRuntime=path.join(out,'site-theme.js');
const oldThemeRuntime=fs.readFileSync(themeRuntime,'utf8');
const layoutBootstrap=oldThemeRuntime.slice(oldThemeRuntime.indexOf('\n\n(()=>{const base='));
if(!layoutBootstrap.includes('site-layout.js'))throw Error('Missing layout bootstrap');
fs.writeFileSync(themeRuntime,read('scripts/client-overrides/public/site-theme.js')+layoutBootstrap);
for(const f of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const s=fs.readFileSync(f,'utf8');if(s.includes(oldBase))fs.writeFileSync(f,s.replaceAll(oldBase,base));}
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,oldBase,'notebook')});

function replaceOnce(source,from,to){
 if(source.split(from).length!==2)throw Error('Unexpected release anchor: '+from.slice(0,120));
 return source.replace(from,()=>to);
}
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
const ast=parse(shell,{ecmaVersion:'latest',sourceType:'module'});
const declarations=new Map(ast.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,shell.slice(n.start,n.end)]));
const themeSettings=declarations.get('lp'),themeEntry=declarations.get('hS'),menu=declarations.get('mp'),grouped=declarations.get('NPGroupedHome');
if(!themeSettings||!themeEntry||!menu||!grouped)throw Error('Missing theme or home renderer');
const compile=text=>transformSync(text,{loader:'tsx',jsx:'transform',jsxFactory:'NPHomeJSX',jsxFragment:'m.Fragment',target:'es2022'}).code;
const themeSource=read('scripts/client-overrides/app/theme-settings.tsx').split('const themes=')[1]
 .replace('export function ThemeEntry','function NPThemeEntry')
 .replace('export default function ThemeSettings','function NPThemeSettings');
shell=replaceOnce(shell,themeSettings,'function lp(){return NPThemeSettings()}');
shell=replaceOnce(shell,themeEntry,'function hS(props){return NPThemeEntry(props)}');
const literal=text=>JSON.stringify(text).replace(/[^\x20-\x7e]/g,char=>'\\u'+char.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));
shell=replaceOnce(shell,menu,replaceOnce(menu,[literal('デザイン'),literal('3つの雰囲気を切り替える')].join(', '),[literal('背景とボタンを変更'),literal('画面を見ながら配色を選ぶ')].join(', ')));
const compiledHome=compile(read('scripts/client-overrides/app/grouped-home.tsx').replace("'use client';",'').replace('export default function GroupedHome','function NPGroupedHome'));
shell=replaceOnce(shell,grouped,compiledHome);
shell=replaceOnce(shell,`var ka="${previous}",wS=`,`var ka="${version}",wS=`);
shell+='\n'+compile('const themes='+themeSource)
 .replace(/\b(useState|useEffect|useLocale|Palette)\b/g,id=>({useState:'Mr.useState',useEffect:'Mr.useEffect',useLocale:'Y',Palette:'au'}[id]));
parse(shell,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(shellFile,shell);

// Use the same SVG geometry at first paint and after React mounts.
const homeFile=path.join(root,'nanpure/index.html');
let home=fs.readFileSync(homeFile,'utf8');
const theme=home.match(/<button[^>]*class="theme-entry[^]*?<\/button>/)?.[0];
if(!theme)throw Error('Missing prerendered theme button');
home=replaceOnce(home,theme,theme.replace('デザイン','背景とボタンを変更').replace('<small>A</small>','<small aria-hidden="true">A</small>').replace('<span aria-hidden="true">›</span>',''));
const arrow='<span class="choice-arrow" aria-hidden="true">›</span>';
if(home.split(arrow).length!==6)throw Error('Unexpected home arrow count');
home=home.replaceAll(arrow,'<span class="choice-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"></path></svg></span>');
fs.writeFileSync(homeFile,home);
const changed=[];
for(const f of walk(path.join(root,'nanpure')).filter(f=>f.endsWith('.html')&&!f.includes('/releases/'))){const s=fs.readFileSync(f,'utf8'),v=s.replaceAll(oldBase,base);if(v!==s){fs.writeFileSync(f,v);changed.push(path.relative(root,f));}}

const overrides=path.join(root,'scripts/client-overrides'),digest=hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'));
const info={...JSON.parse(read('nanpure/version.json')),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const ai=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));ai.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(ai,null,2)+'\n');
const sources=['scripts/prepare-home-96-release.mjs','scripts/i18n/catalog-home-96.json','scripts/client-overrides/app/theme-settings.tsx','scripts/client-overrides/public/site-theme.js','scripts/client-overrides/public/themes/accessible.css',...Object.keys(prior.steppedHome.sources)];
const manifest={...prior,...info,base,steppedHome:{sources:Object.fromEntries(sources.map(f=>[f,hash(read(f))]))},files:{...prior.files}};
for(const record of Object.values(manifest))if(record?.sources)for(const f of Object.keys(record.sources))if(fs.existsSync(path.join(root,f)))record.sources[f]=hash(read(f));
if(manifest.community?.sources){info.communitySourceSha256=hash(JSON.stringify(manifest.community.sources));Object.assign(manifest,info);fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));}
const previews=path.join(root,'nanpure/assets/theme-previews');
for(const f of [...walk(out),...(fs.existsSync(previews)?walk(previews):[]),...new Set([...changed,'nanpure/index.html','nanpure/version.json','nanpure/releases.json','nanpure/collection/entry.js','puzzles/navigation.js'])].map(f=>path.isAbsolute(f)?f:path.join(root,f)))manifest.files[path.relative(root,f)]=hash(fs.readFileSync(f));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared the theme previews release',version);
