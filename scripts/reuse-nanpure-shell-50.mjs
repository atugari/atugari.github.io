// Preserve the verified game client; replace only release data, its notification hook and asset URLs.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{publicReleases,announcementVersion}from'./public-release-policy.mjs';
export function reuseVerifiedShell(root,output,note){
 const previous='2026.10.24.49',version='2026.10.24.50',oldBase='/nanpure/releases/'+previous+'/',base='/nanpure/releases/'+version+'/',prior=path.join(root,oldBase,'shell'),dest=path.join(output,'shell');
 const all=JSON.parse(fs.readFileSync(path.join(root,'scripts/release-notes.json'))),notes=publicReleases(all),publicVersion=announcementVersion(all);
 if(note?.version!==version)throw Error('Unexpected shell release');fs.mkdirSync(dest,{recursive:true});
 for(const name of fs.readdirSync(prior)){
  const original=fs.readFileSync(path.join(prior,name),'utf8');let text=original.replaceAll(oldBase,base),undo;
  if(name==='main.js'){
   const marker='var ka="'+previous+'",wS=';if(text.split(marker).length!==2)throw Error('Verified release anchor changed');
   const start=text.indexOf(marker)+marker.length;let end=start,depth=0,quoted=false,escaped=false;
   for(;end<text.length;end++){const c=text[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='[')depth++;else if(c===']'&&!--depth){end++;break;}}
   const oldArray=text.slice(start,end);if(!Array.isArray(vm.runInNewContext('('+oldArray+')',Object.create(null),{timeout:1000})))throw Error('Invalid existing release data');
   const oldPrefix=marker+oldArray,newPrefix='var ka="'+version+'",wS='+JSON.stringify(notes);text=text.replace(oldPrefix,newPrefix);
   const a=text.indexOf('function BS(){'),b=text.indexOf('function gp(',a);if(a<0||b<a)throw Error('Notification hook anchor changed');const oldHook=text.slice(a,b);
   const newHook=`function BS(){let p=${JSON.stringify(publicVersion)},[e,a]=(0,Fu.useState)(ka),[t,l]=(0,Fu.useState)(false);return (0,Fu.useEffect)(()=>{try{let s=localStorage.getItem("np-release-seen");l(!s||s.localeCompare(p,undefined,{numeric:true})<0)}catch{}let u=0,o=async()=>{if(document.hidden||Date.now()-u<6e4)return;u=Date.now();try{let r=await fetch("/nanpure/version.json",{cache:"no-store"}),s=await r.json();r.ok&&typeof s.announcementVersion==="string"&&s.announcementVersion.localeCompare(p,undefined,{numeric:true})>0&&a(s.version)}catch{}};o();let n=setInterval(o,3e5);return document.addEventListener("visibilitychange",o),()=>{clearInterval(n),document.removeEventListener("visibilitychange",o)}},[]),{latest:e,unread:t,markRead:()=>{l(false);try{localStorage.setItem("np-release-seen",p)}catch{}}}}`;
   text=text.slice(0,a)+newHook+text.slice(b);undo=text.replace(newHook,oldHook).replace(newPrefix,oldPrefix).replaceAll(base,oldBase);
  }else undo=text.replaceAll(base,oldBase);
  if(undo!==original)throw Error('Unexpected shell changes');fs.writeFileSync(path.join(dest,name),text);
 }
 console.log('Verified shared shell scope for',version);
}
