// Preserve the current public client and replace only the Wado interaction UI.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {publicReleases,announcementVersion} from './public-release-policy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),previous=process.argv[2]||'2026.10.26.61',version=process.argv[3]||'2026.10.27.62';
const oldBase='/nanpure/releases/'+previous+'/',base='/nanpure/releases/'+version+'/',out=path.join(root,base),prior=JSON.parse(fs.readFileSync(path.join(root,'nanpure/release-manifest.json')));
const notes=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json')));
if(notes[0].version!==version||![previous,version].includes(prior.version)||previous===version)throw Error('Unexpected release');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
if(!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version))throw Error('Invalid release');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});fs.cpSync(path.join(root,oldBase),out,{recursive:true,filter:f=>!(path.extname(f)==='.mp3'&&path.basename(path.dirname(f))==='audio')});
for(const file of walk(out).filter(f=>/\.(html|js|css)$/.test(f))){const text=fs.readFileSync(file,'utf8');if(text.includes(oldBase))fs.writeFileSync(file,text.replaceAll(oldBase,base));}
const source=path.join(root,'scripts/client-overrides/public/notebook');
for(const name of ['wado-play.html','wado-play.js','wado-play.css','wado.html','wado-ui.js','wado-live.js','wado-workspace.js','wado-workspace.css']){
 let text=fs.readFileSync(path.join(source,name),'utf8');
 if(name.endsWith('.html')){const priorHtml=fs.readFileSync(path.join(root,oldBase,'notebook',name),'utf8'),scripts=[...priorHtml.matchAll(/<script defer src="[^"]+"><\/script>/g)].map(x=>x[0].replaceAll(oldBase,base)).join('');text=text.replace('<head>','<head><meta name="robots" content="noindex, follow">').replaceAll('/site-theme.js',base+'site-theme.js').replaceAll('/ui-text.js',base+'ui-text.js').replace('</head>',scripts+'</head>');}
 fs.writeFileSync(path.join(out,'notebook',name),text);
}
// Add a direct Wado entry while preserving every translated client component.
const appFile=path.join(out,'notebook/app.js'),appSource=fs.readFileSync(path.join(source,'app.js'),'utf8'),anchor=appSource.match(/'<a class="choice" href="\/notebook\/wado-play.html"[^]*?<\/a>'\+/)?.[0],entryMarker='We("試作&製作中","天秤・シルプレ生成・しるしのこみち","open-prototype")';
if(!anchor)throw Error('Missing Wado entry source');let app=fs.readFileSync(appFile,'utf8');if(app.split(entryMarker).length!==2)throw Error('Home entry anchor changed');app=app.replace(entryMarker,anchor.replace('/notebook/wado-play.html',base+'notebook/wado-play.html')+entryMarker);fs.writeFileSync(appFile,app);
// Keep the existing navigation route, but describe the actual primary action.
const proto=path.join(out,'notebook/prototype.js');let menu=fs.readFileSync(proto,'utf8');menu=menu.replace('問題を作って保存し、頭の中や紙で考えられます。','真ん中の漢字を考える。ヒント・印刷も使えます。');fs.writeFileSync(proto,menu);
const shellFile=path.join(out,'shell/main.js');let shell=fs.readFileSync(shellFile,'utf8'),marker='var ka="'+previous+'",wS=',start=shell.indexOf(marker)+marker.length;
if(start<marker.length)throw Error('Version marker not found');let end=start,depth=0,quoted=false,escaped=false;
for(;end<shell.length;end++){const c=shell[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='[')depth++;else if(c===']'&&!--depth){end++;break;}}
shell=shell.slice(0,start)+JSON.stringify(publicReleases(notes))+shell.slice(end);shell=shell.replace(marker,'var ka="'+version+'",wS=');fs.writeFileSync(shellFile,shell);
for(const name of Object.keys(prior.files).filter(f=>!f.includes('/releases/')&&!['nanpure/version.json','nanpure/releases.json','nanpure-version.json'].includes(f))){if(!/\.(html|css|js|xml|txt)$/.test(name))continue;const file=path.join(root,name);let text=fs.readFileSync(file,'utf8').replaceAll(oldBase,base);if(name==='nanpure/index.html')text=text.replace('data-i18n-skip="true">'+previous,'data-i18n-skip="true">'+version);fs.writeFileSync(file,text);}
const overrides=path.join(root,'scripts/client-overrides'),info={...JSON.parse(fs.readFileSync(path.join(root,'nanpure/version.json'))),version,baseRelease:previous,announcementVersion:announcementVersion(notes),clientOverridesSha256:hash(walk(overrides).sort().map(f=>path.relative(overrides,f)+'\0'+fs.readFileSync(f)).join('\0'))};
fs.writeFileSync(path.join(root,'nanpure/version.json'),JSON.stringify(info));fs.writeFileSync(path.join(root,'nanpure-version.json'),JSON.stringify({version}));fs.writeFileSync(path.join(root,'nanpure/releases.json'),JSON.stringify({version,announcementVersion:announcementVersion(notes),releases:publicReleases(notes)},null,2)+'\n');
const audio=path.join(root,'nanpure-audio',version);fs.mkdirSync(audio,{recursive:true});fs.cpSync(path.join(root,'nanpure-audio',previous),audio,{recursive:true});const index=JSON.parse(fs.readFileSync(path.join(audio,'index.json')));index.version=version;fs.writeFileSync(path.join(audio,'index.json'),JSON.stringify(index,null,2)+'\n');
const files=[...Object.keys(prior.files).filter(f=>!f.includes('/releases/')),...walk(out).map(f=>path.relative(root,f))];fs.writeFileSync(path.join(root,'nanpure/release-manifest.json'),JSON.stringify({...prior,...info,base,files:Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]))},null,2)+'\n');console.log('Prepared Wado interaction release',version,files.length,'files');
