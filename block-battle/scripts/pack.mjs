import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {transform} from 'esbuild';import {brotliCompressSync,constants} from 'node:zlib';
const read=p=>readFile(p,'utf8');
const client=(await transform(await read('game/client.js'),{minify:true,format:'iife',charset:'utf8',target:'es2022'})).code.trim();
const html=(await read('game/shell.html')).replace(/\s*\n\s*/g,'').replace('__CLIENT__',client.replaceAll('</script','<\\/script'));
// One byte per Latin Extended letter: no controls, quotes or combining marks.
// These letters each carry weight 1 in the conservative X calculation.
const compressed=brotliCompressSync(Buffer.from(html),{params:{[constants.BROTLI_PARAM_QUALITY]:11}});
const encoded=Array.from(compressed,b=>String.fromCharCode(256+b)).join('');
if(encoded!==encoded.normalize('NFC'))throw Error('Payload must survive canonical Unicode normalization');
const source='export const PAGE='+JSON.stringify(encoded)+';\n'+await read('game/hub.js')+'\n'+await read('game/http.js')+'\n'+await read('game/node.js');
const packed=(await transform(source,{minify:true,mangleProps:/_$/,format:'esm',charset:'utf8',target:'es2022'})).code;
const post='// v23: Node.js 24+ / node block-battle.mjs / localhost:8787\n'+packed;
const weight=s=>Array.from(s).reduce((n,c)=>n+(c.codePointAt(0)<=0x10ff||c.codePointAt(0)>=0x2000&&c.codePointAt(0)<=0x200d||c.codePointAt(0)>=0x2010&&c.codePointAt(0)<=0x201f||c.codePointAt(0)>=0x2032&&c.codePointAt(0)<=0x2037?1:2),0);
await mkdir('public',{recursive:true});await mkdir('generated',{recursive:true});
await writeFile('public/block-battle.mjs',packed);await writeFile('public/x-post.txt',post);await writeFile('generated/game.mjs',packed);
const size={characters:packed.length,conservativeXWeight:weight(packed),postCharacters:post.length,postConservativeXWeight:weight(post)};await writeFile('generated/size.json',JSON.stringify(size,null,2)+'\n');console.log(size);
if(size.postConservativeXWeight>20000)throw Error('20,000-character constraint exceeded');
for(const forbidden of ['chatgpt.site','unpkg.com','esm.run'])if(packed.includes(forbidden)||html.includes(forbidden))throw Error('Private host or external game dependency leaked');
