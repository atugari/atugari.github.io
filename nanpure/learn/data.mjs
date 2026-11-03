import {hashBytes,readGzipJSON} from '../collection/pack-reader.mjs?v=20261031-stock1';
export class LearningData{
 constructor(base=new URL('./data/',import.meta.url)){this.base=base;this.cache=new Map();this.pending=new Map();this.index=null;}
 async load(){const r=await fetch(new URL('index.json',this.base),{cache:'no-cache'});if(!r.ok)throw Error('問題一覧を取得できません。通信を確認してください。');const index=await r.json();if(index.format!=='nanpure-learning-index-v1'||!Array.isArray(index.records)||!Array.isArray(index.packs))throw Error('問題一覧の形式を確認できません。');this.index=index;return index;}
 async record(sourceId){
  const row=this.index.records.find(r=>r.id===sourceId);if(!row)throw Error('この番号の解説データはありません。');
  const meta=this.index.packs.find(p=>p.file===row.pack);if(!meta||!/^\d{4}-[a-f0-9]{12}\.gz\.b64$/.test(meta.file))throw Error('手順の参照先を確認できません。');
  let records=this.cache.get(meta.file);
  if(!records){
   if(!this.pending.has(meta.file))this.pending.set(meta.file,this.readPack(meta).then(records=>{this.cache.set(meta.file,records);while(this.cache.size>4)this.cache.delete(this.cache.keys().next().value);return records;}).finally(()=>this.pending.delete(meta.file)));
   records=await this.pending.get(meta.file);
  }
  const record=records.find(r=>r.sourceId===sourceId);if(!record)throw Error('問題と手順の対応を確認できません。');
  this.cache.delete(meta.file);this.cache.set(meta.file,records);return record;
 }
 async readPack(meta){
  const res=await fetch(new URL(meta.file,this.base));if(!res.ok)throw Error('解説の手順を取得できません。通信を確認してください。');
  const base64=(await res.text()).replace(/\s/g,'');if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length>4000000)throw Error('手順ファイルの形式を確認できません。');
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));if(bytes.byteLength!==meta.bytes||await hashBytes(bytes)!==meta.sha256)throw Error('手順ファイルの照合に失敗しました。ページを読み込み直してください。');
  const payload=await readGzipJSON(bytes);if(payload.format!=='nanpure-learning-pack-v1'||payload.engineVersion!==this.index.engineVersion||!Array.isArray(payload.records)||payload.records.length!==meta.ids.length||payload.records.some((r,i)=>r.sourceId!==meta.ids[i]))throw Error('問題一覧と手順が一致しません。');
  return payload.records;
 }
}
