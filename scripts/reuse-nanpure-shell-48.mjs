// Keep the existing verified shell; only asset URLs, release version and note change.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export function reuseVerifiedShell(root,output,note){
 const previous='2026.10.24.47',version='2026.10.24.48',oldBase='/nanpure/releases/'+previous+'/',base='/nanpure/releases/'+version+'/',prior=path.join(root,oldBase,'shell'),dest=path.join(output,'shell'),entry=JSON.stringify(note)+',';
 if(note?.version!==version)throw Error('Unexpected shell release');fs.mkdirSync(dest,{recursive:true});
 for(const name of fs.readdirSync(prior)){
  const original=fs.readFileSync(path.join(prior,name),'utf8');let text=original.replaceAll(oldBase,base),undo;
  if(name==='main.js'){const marker='var ka="'+previous+'",wS=[';if(text.split(marker).length!==2)throw Error('Verified public shell anchors changed');text=text.replace(marker,'var ka="'+version+'",wS=['+entry);undo=text.replace('var ka="'+version+'",wS=['+entry,marker).replaceAll(base,oldBase);}else undo=text.replaceAll(base,oldBase);
  if(undo!==original)throw Error('Unexpected shell changes');fs.writeFileSync(path.join(dest,name),text);
 }
 console.log('Verified shared shell scope for',version);
}
