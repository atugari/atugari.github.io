const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function context(){const ctx={console,crypto:globalThis.crypto,performance,Date,Math,setTimeout,clearTimeout,Uint8Array,Uint32Array,TextEncoder};ctx.window=ctx;ctx.self=ctx;ctx.global=ctx;vm.createContext(ctx);return ctx}
function load(){const version=JSON.parse(fs.readFileSync(path.join(root,'nanpure-version.json'))).version,base=path.join(root,'nanpure/releases',version,'notebook'),html=fs.readFileSync(path.join(base,'index.html'),'utf8');const c=context();
const inline=Object.fromEntries([...html.matchAll(/<script[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>[m[1],m[2]]));
const numeric=Object.entries(inline).filter(([id])=>id.startsWith('core-')||['common-source','generator-source'].includes(id)).map(x=>x[1]).join('\n');vm.runInContext(numeric,c);for(const name of ['batch.js','lan-identity.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),c);
for(const name of ['crossword-words.js','crossword-clues.js','crossword-layouts.js','crossword-layout.js','crossword-engine.js','tenbin-engine.js','wado-engine.js','wado-clues.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),c);
vm.runInContext(inline['shiru-generator-source'],c);c.wado=c.NPWado.create(JSON.parse(fs.readFileSync(path.join(base,'wado-data.json'))));c.clues=c.WadoClues.create(JSON.parse(fs.readFileSync(path.join(base,'wado-hints.json'))));return{c,version,base,numeric,shiru:inline['shiru-generator-source']}}
module.exports={load,root};
