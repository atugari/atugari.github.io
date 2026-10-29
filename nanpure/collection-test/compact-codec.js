// Lossless distribution codec. Never applied to the player's mutable save data.
(function(root){
 const tag='$npCompact1';
 function encode(value){
  if(Array.isArray(value)){
   if(value.length>=24&&value.every(x=>Number.isInteger(x)&&x>=0&&x<=255&&!Object.is(x,-0))){
    let chars='';for(const n of value)chars+=String.fromCharCode(n);
    return {[tag]:'bytes',data:btoa(chars)};
   }
   return value.map(encode);
  }
  if(value&&typeof value==='object'){
   const out={};for(const [k,v] of Object.entries(value))Object.defineProperty(out,k,{value:encode(v),enumerable:true,writable:true,configurable:true});
   return Object.hasOwn(value,tag)?{[tag]:'escaped',data:out}:out;
  }
  return value;
 }
 function decode(value){
  if(Array.isArray(value))return value.map(decode);
  if(value&&typeof value==='object'){
   if(value[tag]==='bytes')return Array.from(atob(value.data),c=>c.charCodeAt(0));
   const input=value[tag]==='escaped'?value.data:value,out={};
   for(const [k,v] of Object.entries(input))Object.defineProperty(out,k,{value:decode(v),enumerable:true,writable:true,configurable:true});
   return out;
  }
  return value;
 }
 function compactRecord(record){
  const copy=JSON.parse(JSON.stringify(record)),p=copy.puzzle,restore={};
  if(p&&typeof p==='object'){
   if(Array.isArray(p.grid)&&Array.isArray(p.puzzle)&&JSON.stringify(p.grid)===JSON.stringify(p.puzzle)){delete p.grid;restore.grid=true;}
   // Only omit explicitly present, exact defaults; missing fields stay missing.
   for(const [key,value] of Object.entries({elapsed:0,completed:false,notes:{}})){
    if(Object.hasOwn(p,key)&&JSON.stringify(p[key])===JSON.stringify(value)){delete p[key];(restore.defaults??=[]).push(key);}
   }
  }
  return [encode(copy),restore];
 }
 function restoreRecord([encoded,restore]){
  const copy=decode(encoded),p=copy.puzzle;
  if(restore.grid)p.grid=p.puzzle.slice();
  for(const key of restore.defaults||[])p[key]=key==='notes'?{}:key==='elapsed'?0:false;
  return copy;
 }
 const api={encode,decode,compactRecord,restoreRecord};
 root.NPCollectionCodec=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
