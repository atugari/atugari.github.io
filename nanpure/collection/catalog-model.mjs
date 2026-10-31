// Configuration entries are immutable ID segments. Later imports may append a
// segment with the same logical key without changing any previous ID range.
export function validCatalog(catalog){
 if(catalog?.format!==2||!Number.isSafeInteger(catalog.total)||catalog.total<1||catalog.total>999999||!Array.isArray(catalog.configs)||!catalog.configs.length||catalog.configs.some(c=>!c||typeof c!=='object'))return false;
 const cids=new Set();let next=1;
 for(const c of [...catalog.configs].sort((a,b)=>a.start-b.start)){
  if(!Number.isSafeInteger(c.start)||c.start!==next||!Number.isSafeInteger(c.count)||c.count<1||typeof c.key!=='string'||!c.key||typeof c.cid!=='string'||!c.cid||cids.has(c.cid)||!c.index||typeof c.index.file!=='string'||!Number.isSafeInteger(c.index.bytes)||c.index.bytes<1||!/^[a-f0-9]{64}$/.test(c.index.sha256))return false;
  cids.add(c.cid);next+=c.count;
 }
 return next-1===catalog.total;
}
