import {mkdir,copyFile,readdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('.wado-assets/',root);
await mkdir(new URL('assets/',out),{recursive:true});
for(const file of await readdir(new URL('wado-player/',root))){
 await copyFile(new URL('wado-player/'+file,root),new URL(file==='index.html'?file:'assets/'+file,out));
}
for(const file of ['wado-engine.js','wado-data.json','wado-licenses.txt']){
 await copyFile(new URL('../scripts/client-overrides/public/notebook/'+file,root),new URL('assets/'+file,out));
}
console.log('Prepared owner-only Wado assets (authentication runs before all assets).');
