import './compact-codec.js';
// Standalone reader for future distribution integration. Does not load all packs.
export async function readGzipJSON(bytes){
 if(typeof DecompressionStream==='undefined')throw Error('このブラウザは圧縮問題の読み込みに対応していません。ブラウザを更新してください。');
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 return JSON.parse(await new Response(stream).text());
}
export async function readProblemPack(bytes,descriptor){
 if(bytes.byteLength!==descriptor.bytes)throw Error('問題ファイルの容量が一致しません');
 const digest=await crypto.subtle.digest('SHA-256',bytes),hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==descriptor.sha256)throw Error('問題ファイルを照合できません');
 const payload=await readGzipJSON(bytes);
 const records=payload?.format==='np-compact-v1'?payload.records.map(globalThis.NPCollectionCodec.restoreRecord):payload;
 if(!Array.isArray(records)||records.length!==descriptor.ids.length||records.some((r,i)=>r.id!==descriptor.ids[i]||r.key!==descriptor.key||!r.puzzle))throw Error('問題一覧と内容が一致しません');
 return records;
}
