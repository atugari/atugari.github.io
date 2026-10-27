import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{brotliDecompressSync}from'node:zlib';import vm from'node:vm';import{PAGE}from'../public/block-battle.mjs';
test('single-file Unicode payload restores valid game code and stays within X limit',async()=>{
 assert.ok([...PAGE].every(c=>c.charCodeAt(0)>=256&&c.charCodeAt(0)<=511));assert.equal(PAGE.normalize('NFC'),PAGE);
 const html=brotliDecompressSync(Uint8Array.from(PAGE,c=>c.charCodeAt(0)-256)).toString();assert.match(html,/id="play"/);assert.match(html,/即落下/);assert.match(html,/id="controls"/);new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 const size=JSON.parse(await readFile('generated/size.json','utf8'));assert.ok(size.postConservativeXWeight<=20000);assert.equal((await readFile('public/x-post.txt','utf8')).normalize('NFC'),await readFile('public/x-post.txt','utf8'));
});
