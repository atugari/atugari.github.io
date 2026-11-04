// Publish the streamlined home while preserving the existing puzzle engine.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),{parse}=require(process.env.NANPURE_ACORN||'../nanpure-api/node_modules/acorn'),{transformSync}=require(process.env.NANPURE_ESBUILD||'../nanpure-api/node_modules/esbuild');
const previous='2026.11.04.93',version='2026.11.04.94',oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`,out=path.join(root,base);
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const prior=JSON.parse(read('nanpure/release-manifest.json')),notes=JSON.parse(read('scripts/release-notes.json'));
if(prior.version!==previous||notes[0]?.version!==version||fs.existsSync(out))throw Error('Unexpected release state');
for(const f of walk(path.join(root,oldBase)))if(hash(fs.readFileSync(f))!==prior.files[path.relative(root,f)])throw Error('Published asset changed: '+f);
fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const name of ['home-layout.js','home-layout.css'])fs.copyFileSync(path.join(root,'scripts/client-overrides/public',name),path.join(out,name));
for(const f of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const s=fs.readFileSync(f,'utf8');if(s.includes(oldBase))fs.writeFileSync(f,s.replaceAll(oldBase,base));}
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,oldBase,'notebook')});

const compiled=transformSync(read('scripts/client-overrides/app/grouped-home.tsx').replace("'use client';",'').replace('export default function GroupedHome','function NPGroupedHome'),{loader:'tsx',jsx:'transform',jsxFactory:'NPHomeJSX',target:'es2022'}).code;
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
const marker=shell.indexOf('\nfunction NPHomeJSX(');if(marker<0)throw Error('Missing home renderer');
shell=shell.slice(0,marker)+'\nfunction NPHomeJSX(type,props,...children){return m.jsxs(type,{...props,...(children.length?{children:children.length===1?children[0]:children}:{})})}\n'+compiled;
const oldProps='resume:_p?dx:null,markRead:vt.markRead,unread:vt.unread||vt.latest!==ka,version:ka,Theme:hS,Intro:hp,showRanking:ee.showRanking';
if(shell.split(oldProps).length!==2)throw Error('Missing shell home props');
shell=shell.replace(oldProps,'resume:_p?dx:null,Theme:hS,Intro:hp');
const patches=[];
function visit(n){if(!n||typeof n!=='object')return;
 if(n.type==='VariableDeclarator'&&n.id?.name==='ka'&&n.init?.value===previous){patches.push({start:n.init.start,end:n.init.end,text:JSON.stringify(version)});}
 for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);
}
visit(parse(shell,{ecmaVersion:'latest',sourceType:'module'}));if(patches.length!==1)throw Error('Shell anchors changed');
for(const p of patches.sort((a,b)=>b.start-a.start))shell=shell.slice(0,p.start)+p.text+shell.slice(p.end);
parse(shell,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(shellFile,shell);

// First paint and the interactive renderer use the same component.
const homeFile=path.join(root,'nanpure/index.html');let home=fs.readFileSync(homeFile,'utf8');
const oldHome=home.match(/<main class="start-screen designed-home[^]*?<\/main>/)?.[0];
const themeHTML=oldHome?.match(/<button[^>]*class="theme-entry[^]*?<\/button>/)?.[0],introHTML=oldHome?.match(/<section class="site-intro"[^]*?<\/section>/)?.[0];
if(!oldHome||!themeHTML||!introHTML)throw Error('Missing first-paint home helpers');
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsx=(type,props,...children)=>{if(typeof type==='function')return type({...props,children});const attrs=Object.entries(props||{}).filter(([k,v])=>!k.startsWith('on')&&k!=='children'&&v!==false&&v!=null).map(([k,v])=>' '+(k==='className'?'class':k)+(v===true?'':'="'+escape(v)+'"')).join('');const content=children.flat(Infinity).filter(v=>v!==false&&v!=null).map(v=>typeof v==='object'?v.html:escape(v)).join('');return{html:'<'+type+attrs+'>'+content+'</'+type+'>'}};
const ctx={NPHomeJSX:jsx,window:{}};vm.createContext(ctx);vm.runInContext(compiled,ctx);
ctx.props={t:s=>s,onPractice(){},onDaily(){},onPanel(){},resume:null,Theme:()=>({html:themeHTML}),Intro:()=>({html:introHTML})};
home=home.replace('/nanpure/collection/entry.js?v=20261104-home-cards','/nanpure/collection/entry.js?v=20261104-home-cleanup').replace(oldHome,vm.runInContext('NPGroupedHome(props)',ctx).html);fs.writeFileSync(homeFile,home);
const changed=[];
for(const f of walk(path.join(root,'nanpure')).filter(f=>f.endsWith('.html')&&!f.includes('/releases/'))){const s=fs.readFileSync(f,'utf8'),v=s.replaceAll(oldBase,base);if(v!==s){fs.writeFileSync(f,v);changed.push(path.relative(root,f));}}

const overrides=path.join(root,'scripts/client-overrides'),digest=hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'));
const info={...JSON.parse(read('nanpure/version.json')),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const ai=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));ai.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(ai,null,2)+'\n');
const sources=['scripts/prepare-home-94-release.mjs','scripts/i18n/catalog-home-94.json',...Object.keys(prior.steppedHome.sources)];
const manifest={...prior,...info,base,steppedHome:{sources:Object.fromEntries(sources.map(f=>[f,hash(read(f))]))},files:{...prior.files}};
for(const record of Object.values(manifest))if(record?.sources)for(const f of Object.keys(record.sources))if(fs.existsSync(path.join(root,f)))record.sources[f]=hash(read(f));
if(manifest.community?.sources){info.communitySourceSha256=hash(JSON.stringify(manifest.community.sources));Object.assign(manifest,info);fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));}
for(const f of [...walk(out),...new Set([...changed,'nanpure/index.html','nanpure/version.json','nanpure/releases.json','nanpure/collection/entry.js','puzzles/navigation.js'])].map(f=>path.isAbsolute(f)?f:path.join(root,f)))manifest.files[path.relative(root,f)]=hash(fs.readFileSync(f));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared streamlined home',version);
