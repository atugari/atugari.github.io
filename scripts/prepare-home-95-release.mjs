// Publish the five settings categories and keep the shipped puzzle engine.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),{parse}=require(process.env.NANPURE_ACORN||'../nanpure-api/node_modules/acorn'),{transformSync}=require(process.env.NANPURE_ESBUILD||'../nanpure-api/node_modules/esbuild');
const previous='2026.11.04.94',version='2026.11.04.95',oldBase=`/nanpure/releases/${previous}/`,base=`/nanpure/releases/${version}/`,out=path.join(root,base);
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const prior=JSON.parse(read('nanpure/release-manifest.json')),notes=JSON.parse(read('scripts/release-notes.json'));
if(prior.version!==previous||notes[0]?.version!==version||fs.existsSync(out))throw Error('Unexpected release state');
for(const f of walk(path.join(root,oldBase)))if(hash(fs.readFileSync(f))!==prior.files[path.relative(root,f)])throw Error('Published asset changed: '+f);
fs.cpSync(path.join(root,oldBase),out,{recursive:true});
for(const name of ['home-layout.css','site-layout.js','achievements-hooks.js'])fs.copyFileSync(path.join(root,'scripts/client-overrides/public',name),path.join(out,name));
for(const f of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const s=fs.readFileSync(f,'utf8');if(s.includes(oldBase))fs.writeFileSync(f,s.replaceAll(oldBase,base));}
buildTranslationAssets(path.join(out,'notebook'),version,{previousDirectory:path.join(root,oldBase,'notebook')});

function replaceOnce(source,from,to){
 if(source.split(from).length!==2)throw Error('Unexpected release anchor: '+from.slice(0,180));
 return source.replace(from,()=>to);
}
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8');
const ast=parse(shell,{ecmaVersion:'latest',sourceType:'module'});
const declarations=new Map(ast.body.filter(node=>node.type==='FunctionDeclaration').map(node=>[node.id.name,shell.slice(node.start,node.end)]));
const oldMenu=declarations.get('mp'),oldSettings=declarations.get('Rp'),oldGame=declarations.get('Up');
if(!oldMenu?.includes('className:"site-menu"')||!oldSettings?.includes('className:"play-settings ps-organized"')||!oldGame?.includes('className:"menu-button"'))throw Error('Missing menu renderers');

const menuSource=read('scripts/client-overrides/app/site-menu.tsx').split('export default function SiteMenu')[1].split('export function Faq')[0];
const aliases={useLocale:'Y',currentVersion:'ka',Palette:'au',Music:'xr',CalendarDays:'Mt',SlidersHorizontal:'vr',BookOpen:'ht',ChartNoAxesColumn:'_a',Download:'hr',Heart:'Ou',Mail:'zu',HelpCircle:'Lt',ChevronRight:'gt',Sparkles:'Va',Shield:'br',ExternalLink:'Lr',Keyboard:'yr'};
const menu=transformSync('function mp'+menuSource,{loader:'tsx',jsx:'transform',jsxFactory:'NPHomeJSX',jsxFragment:'m.Fragment',target:'es2022'}).code
 .replace(/\b(?:useLocale|currentVersion|Palette|Music|CalendarDays|SlidersHorizontal|BookOpen|ChartNoAxesColumn|Download|Heart|Mail|HelpCircle|ChevronRight|Sparkles|Shield|ExternalLink|Keyboard)\b/g,key=>aliases[key])
 .replace('href: "/privacy"','href: "/nanpure/?view=privacy"');
shell=replaceOnce(shell,oldMenu,menu);

let settings=replaceOnce(oldSettings,'onAudio:d,onClose:p})','onAudio:d,onClose:p,menuPreferences:npMenuPreferences})');
settings=replaceOnce(settings,'className:"ps-menu",hidden:I!==null,children:[','className:"ps-menu",hidden:I!==null,children:[npMenuPreferences,');
shell=replaceOnce(shell,oldSettings,settings);

let game=replaceOnce(oldGame,'function x(){n.current||o.current||V(null)}','function x(){if(!n.current&&!o.current)V(npSettingsReturn.current&&$!=="menu"?"menu":null)}');
game=replaceOnce(game,'Xu=(0,E.useRef)(null);','Xu=(0,E.useRef)(null),npSettingsReturn=(0,E.useRef)(null);');
game=replaceOnce(game,'()=>{$?(Xu.current?.open||Xu.current?.showModal(),Xu.current&&(Xu.current.scrollTop=0)):Xu.current?.close()},[$]',`()=>{
 const surface=Xu.current;
 if(!$){npSettingsReturn.current=null;surface?.close();return}
 if(!surface)return;
 if(!surface.open)surface.showModal();
 surface.scrollTop=0;
 if($==="menu"&&npSettingsReturn.current){npSettingsReturn.current.focus();npSettingsReturn.current=null}
 else if(npSettingsReturn.current)surface.querySelector(".dialog-close")?.focus({preventScroll:true});
},[$]`);
game=replaceOnce(game,'className:"menu-button",onClick:()=>V("menu"),"aria-label":t(vt.latest!==ka?', 'type:"button",className:B==="home"?"menu-button home-settings-button":"menu-button",onClick:()=>V("menu"),"aria-label":t(B==="home"?"設定":vt.latest!==ka?');
game=replaceOnce(game,'children:["\\u2630",(vt.unread', 'children:[B==="home"?t("設定"):"\\u2630",(vt.unread');
game=replaceOnce(game,':$==="menu"?(0,m.jsx)(mp,{daily:B==="daily",showRanking:ee.showRanking,unread:vt.unread,newVersion:vt.latest!==ka,onOpen:i=>{i==="updates"&&vt.markRead(),V(i)}})','');
game=replaceOnce(game,'}),$==="rule-choice"&&$r?', '}),($==="menu"||$&&npSettingsReturn.current)&&(0,m.jsx)("div",{hidden:$!=="menu",children:(0,m.jsx)(mp,{daily:B==="daily",unread:vt.unread,newVersion:vt.latest!==ka,onOpen:(next,trigger)=>{npSettingsReturn.current=trigger;if(next==="updates")vt.markRead();V(next)}})}),$==="rule-choice"&&$r?');
game=replaceOnce(game,'onAudio:()=>V("audio"),onClose:x,boardControls:', 'onAudio:()=>V("audio"),onClose:x,menuPreferences:npSettingsReturn.current?(0,m.jsxs)("div",{className:"menu-language",children:[(0,m.jsx)(Vo,{}),(0,m.jsx)(Yi,{})]}):void 0,boardControls:');
game=replaceOnce(game,'onDone:()=>{$i(!0),V(null)},','onDone:()=>{$i(!0),x()},');
shell=replaceOnce(shell,oldGame,game);
shell=replaceOnce(shell,`var ka="${previous}",wS=`,`var ka="${version}",wS=`);
parse(shell,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(shellFile,shell);

const homeFile=path.join(root,'nanpure/index.html');
const home=replaceOnce(fs.readFileSync(homeFile,'utf8'),'<button class="menu-button" aria-label="メニュー">☰</button>','<button type="button" class="menu-button home-settings-button" aria-label="設定">設定</button>');
fs.writeFileSync(homeFile,replaceOnce(home,'/nanpure/collection/entry.js?v=20261104-home-cleanup','/nanpure/collection/entry.js?v=20261104-home-settings'));
const changed=[];
for(const f of walk(path.join(root,'nanpure')).filter(f=>f.endsWith('.html')&&!f.includes('/releases/'))){const s=fs.readFileSync(f,'utf8'),v=s.replaceAll(oldBase,base);if(v!==s){fs.writeFileSync(f,v);changed.push(path.relative(root,f));}}

const overrides=path.join(root,'scripts/client-overrides'),digest=hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'));
const info={...JSON.parse(read('nanpure/version.json')),version,announcementVersion:announcementVersion(notes),clientOverridesSha256:digest,baseRelease:previous};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));
fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const ai=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));ai.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(ai,null,2)+'\n');
const sources=['scripts/prepare-home-95-release.mjs','scripts/i18n/catalog-home-95.json','scripts/client-overrides/app/site-menu.tsx','scripts/client-overrides/app/play-settings.tsx','scripts/client-overrides/public/site-layout.js','scripts/client-overrides/public/achievements-hooks.js',...Object.keys(prior.steppedHome.sources)];
const manifest={...prior,...info,base,steppedHome:{sources:Object.fromEntries(sources.map(f=>[f,hash(read(f))]))},files:{...prior.files}};
for(const record of Object.values(manifest))if(record?.sources)for(const f of Object.keys(record.sources))if(fs.existsSync(path.join(root,f)))record.sources[f]=hash(read(f));
if(manifest.community?.sources){info.communitySourceSha256=hash(JSON.stringify(manifest.community.sources));Object.assign(manifest,info);fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));}
for(const f of [...walk(out),...new Set([...changed,'nanpure/index.html','nanpure/version.json','nanpure/releases.json','nanpure/collection/entry.js','puzzles/navigation.js'])].map(f=>path.isAbsolute(f)?f:path.join(root,f)))manifest.files[path.relative(root,f)]=hash(fs.readFileSync(f));
fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared five settings categories',version);
