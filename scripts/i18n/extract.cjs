const fs=require('fs'),path=require('path'),cp=require('child_process');
// node scripts/i18n/extract.cjs /path/to/source /tmp/nanpure-string-audit
const source=path.resolve(process.argv[2]||''),work=path.resolve(process.argv[3]||'/tmp/nanpure-string-audit'),repo=path.resolve(__dirname,'../..');fs.mkdirSync(work,{recursive:true});
const ts=require(path.join(source,'node_modules/typescript'));
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'catalog.json'),'utf8'));
const references={};
const jp=/[ぁ-ゖァ-ヺ一-鿿]/;
const fresh={},dynamic={},fragments=[],excluded=[],normalization=[];
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const relative=f=>f.startsWith(source)?'source/'+path.relative(source,f):'github/'+path.relative(repo,f);
function record(key,ref){const list=references[key]||(references[key]=[]);if(!list.some(r=>r.file===ref.file&&r.line===ref.line&&r.kind===ref.kind))list.push(ref)}
function add(key,ref){
 key=key.replace(/^\s+|\s+$/g,'');if(!jp.test(key))return;
 if(key.length>2500||/\b(?:function\s*\(|document\.querySelector|=>\s*\{)/.test(key)){excluded.push({text:key.slice(0,300),reason:'code or oversized literal',...ref});return;}
 if(/^\s*(?:window\.|[.#][\w-]+\s*\[|\[data-)/.test(key)||/^(?:data-|aria-)[a-z-]+=/.test(key)){excluded.push({text:key,reason:'selector or markup attribute fragment',...ref});return;}
 if(/(?:\.json|\.zip|\.html|\.txt|\.csv)$/i.test(key)){excluded.push({text:key,reason:'filename',...ref});return;}
 if(/\{\d+\}/.test(key)){dynamic[key]||={placeholders:[],references:[]};if(ref.expressions)dynamic[key].placeholders=ref.expressions;dynamic[key].references.push(ref);record(key,ref);return;}
 record(key,ref);if(!catalog[key])fresh[key]={};
}
function html(value,ref){fragments.push({value,ref})}
function dispatch(value,ref){if(/<\/?[a-z][^>]*>/i.test(value)||/^[^<]*>[\s\S]*</.test(value))html(value,ref);else add(value,ref)}
function parse(text,file,startLine=0){
 const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,/tsx?$/.test(file)?(file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS):ts.ScriptKind.JS);
 function reference(node,kind){return {file:relative(file),line:startLine+ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,kind}}
 function stringy(node){if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateExpression(node))return true;if(ts.isParenthesizedExpression(node))return stringy(node.expression);return ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken&&(stringy(node.left)||stringy(node.right));}
 function oldflatten(node,parts,exprs){if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken){oldflatten(node.left,parts,exprs);oldflatten(node.right,parts,exprs)}else if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))parts.push(node.text);else{parts.push('{'+exprs.length+'}');exprs.push(node.getText(ast))}}
 function flatten(node,parts,exprs){
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken&&stringy(node)){flatten(node.left,parts,exprs);flatten(node.right,parts,exprs)}
  else if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))parts.push(node.text);
  else{parts.push('{'+exprs.length+'}');exprs.push(node.getText(ast))}
 }
 function visit(node){
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken&&!(ts.isBinaryExpression(node.parent)&&node.parent.operatorToken.kind===ts.SyntaxKind.PlusToken)){
   const parts=[],expressions=[];flatten(node,parts,expressions);const value=parts.join('');if(jp.test(value)){const oldparts=[],oldexpressions=[];oldflatten(node,oldparts,oldexpressions);const ref={...reference(node,'concatenation-template'),expressions};if(oldparts.join('')!==value)normalization.push({old:oldparts.join(''),new:value,oldExpressions:oldexpressions,newExpressions:expressions,ref});dispatch(value,ref);if(dynamic[value])dynamic[value].placeholders=expressions;}
  }else if(ts.isTemplateExpression(node)){
   const expressions=node.templateSpans.map(p=>p.expression.getText(ast));let value=node.head.text;node.templateSpans.forEach((p,i)=>value+='{'+i+'}'+p.literal.text);if(jp.test(value)){const ref={...reference(node,'template'),expressions};dispatch(value,ref);if(dynamic[value])dynamic[value].placeholders=expressions;}
  }else if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){
   if(!jp.test(node.text))return;const par=node.parent;
   if((ts.isPropertyAssignment(par)&&par.name===node)||(ts.isElementAccessExpression(par)&&par.argumentExpression===node)){excluded.push({text:node.text,...reference(node,'internal-key'),reason:'object or index key'});return;}
   if(ts.isBinaryExpression(par)&&par.operatorToken.kind===ts.SyntaxKind.PlusToken){if(/<\/?[a-z]/i.test(node.text))html(node.text,reference(node,'html-fragment'));return;}
   if(ts.isBinaryExpression(par)&&[ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(par.operatorToken.kind)){excluded.push({text:node.text,...reference(node,'comparison'),reason:'comparison constant'});return;}
   dispatch(node.text,reference(node,'literal'));
  }else if(ts.isJsxText(node)){add(node.text,reference(node,'jsx-text'));}
  ts.forEachChild(node,visit);
 }
 visit(ast);
}
let files=[...walk(path.join(source,'app')),...walk(path.join(source,'lib')),...walk(path.join(source,'public')),...walk(path.join(repo,'nanpure-api/client'))].filter(f=>/\.(?:js|tsx?|html)$/.test(f));
files=files.filter(f=>!f.includes('/api/')&&!/\/(?:i18n-data|i18n|crossword-(?:words|clues|layouts)|pako\.min|furigana)\.js$/.test(f)&&!f.endsWith('/lib/locale.ts'));
for(const file of files){
 const text=fs.readFileSync(file,'utf8');if(!jp.test(text))continue;
 if(file.endsWith('.html')){
  for(const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))parse(m[1],file,text.slice(0,m.index).split('\n').length-1);
  html(text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,''),{file:relative(file),line:1,kind:'html'});
 }else parse(text,file);
}
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|[0-9]+);/gi,m=>{const known={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};if(known[m])return known[m];const hex=m.slice(2,3).toLowerCase()==='x';return String.fromCodePoint(parseInt(m.slice(hex?3:2,-1),hex?16:10));});
for(const item of fragments){
 const markup=item.value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 for(const token of markup.match(/<[^>]*>|[^<]+/g)||[]){
  if(token.startsWith('<')){
   for(const m of token.matchAll(/(?:aria-label|title|alt|placeholder|label)\s*=\s*(["'])([\s\S]*?)\1/gi))add(decode(m[2]),{...item.ref,kind:item.ref.kind+':attribute'});
  }else if(!/^\s*["']?(?:>|(?:class|type|data-\w+)=)/.test(token))add(decode(token),{...item.ref,kind:item.ref.kind+':text'});
 }
}
for(const key of Object.keys(dynamic)){if(catalog[key])delete dynamic[key];else dynamic[key].references=dynamic[key].references.filter((v,i,a)=>a.findIndex(t=>JSON.stringify(t)===JSON.stringify(v))===i);}
fs.writeFileSync(path.join(work,'normalized-new-strings.json'),JSON.stringify(fresh,null,2)+'\n');
fs.writeFileSync(path.join(work,'normalized-dynamic-strings.json'),JSON.stringify(dynamic,null,2)+'\n');
fs.writeFileSync(path.join(work,'normalized-excluded-strings.json'),JSON.stringify(excluded,null,2)+'\n');
fs.writeFileSync(path.join(work,'normalized-references.json'),JSON.stringify(references,null,2)+'\n');
const byFile={};for(const k of Object.keys(fresh))for(const r of references[k])byFile[r.file]=(byFile[r.file]||0)+1;
const summary={files:files.length,existingKeys:Object.keys(catalog).length,newStaticKeys:Object.keys(fresh).length,newDynamicTemplates:Object.keys(dynamic).length,excluded:excluded.length,byFile:Object.fromEntries(Object.entries(byFile).sort((a,b)=>b[1]-a[1]))};
fs.writeFileSync(path.join(work,'normalized-extraction-summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));

fs.writeFileSync(path.join(work,'dynamic-normalization-map.json'),JSON.stringify(normalization,null,2)+'\n');
