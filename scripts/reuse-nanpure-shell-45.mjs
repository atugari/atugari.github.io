// Scope the shared shell to byte-verifiable changes over the already public .44.
// The new generator lives in notebook assets, so existing API/admin/contact code
// does not need rebuilding or changing for this release.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function reuseVerifiedShell(root,output,note){
 const oldVersion='2026.10.23.44',version='2026.10.23.45',oldBase='/nanpure/releases/'+oldVersion+'/',base='/nanpure/releases/'+version+'/';
 if(note?.version!==version)throw Error('Unexpected shell release');
 const prior=path.join(root,oldBase,'shell'),destination=path.join(output,'shell'),entry=JSON.stringify(note)+',';
 fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
 const audit=[];
 for(const name of fs.readdirSync(prior)){
  const original=fs.readFileSync(path.join(prior,name),'utf8');let text=original.replaceAll(oldBase,base),undo;
  if(name==='main.js'){
   const marker='var ka="'+oldVersion+'",wS=[';
   if(text.split(marker).length!==2)throw Error('Verified public shell anchors changed');
   text=text.replace(marker,'var ka="'+version+'",wS=['+entry);
   undo=text.replace('var ka="'+version+'",wS=['+entry,marker).replaceAll(base,oldBase);
  }else undo=text.replaceAll(base,oldBase);
  if(undo!==original)throw Error('Shared shell contains changes outside the authorized version, release note, backup key and asset URLs');
  fs.writeFileSync(path.join(destination,name),text);
  const sha=value=>crypto.createHash('sha256').update(value).digest('hex');audit.push({file:name,publicBaseSha256:sha(original),outputSha256:sha(text),normalizedByteIdentity:true});
 }
 console.log('Verified shared shell scope:',JSON.stringify(audit));
}
