// Derive static fallback copy from the same catalog used by the live filters.
const fs=require('node:fs'),path=require('node:path');
function refreshMetadata(root){
 const configs=JSON.parse(fs.readFileSync(path.join(root,'nanpure/collection/catalog.json'))).configs.filter(c=>c.kind!=='cross');
 const rules=new Set(configs.map(c=>c.kind)).size,count=configs.reduce((n,c)=>n+c.count,0).toLocaleString('en-US');
 const file=path.join(root,'nanpure/collection/index.html');let html=fs.readFileSync(file,'utf8');
 html=html.replace(/ナンプレ(?:などナンプレ)?\d+ルール・[\d,]+問を無料収録/g,`ナンプレ${rules}ルール・${count}問を無料収録`)
  .replace(/<title>[\d,]+問の無料ナンプレ問題集/g,`<title>${count}問の無料ナンプレ問題集`)
  .replace(/(<p id="summary" role="status">)\d+ルール・[\d,]+問を収録/g,`$1${rules}ルール・${count}問を収録`)
  .replace(/完成済みのナンプレ[\d,]+問を収録/g,`完成済みのナンプレ${count}問を収録`);
 fs.writeFileSync(file,html);
 const home=path.join(root,'nanpure/index.html');if(fs.existsSync(home))fs.writeFileSync(home,fs.readFileSync(home,'utf8').replace(/(href="\/nanpure\/collection\/">)\d+ルール・[\d,]+問の問題集/g,`$1${rules}ルール・${count}問の問題集`));
 return {rules,count};
}
module.exports={refreshMetadata};
if(require.main===module)console.log(refreshMetadata(path.resolve(__dirname,'../..')));
