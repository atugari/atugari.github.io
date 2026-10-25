import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const repo=path.resolve(process.env.REPO_ROOT||new URL('../../',import.meta.url).pathname);
const out=path.resolve(process.argv[2]||'x-four-work');fs.mkdirSync(out,{recursive:true});
const day=process.argv[3]||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid date');
const seed=Number(day.replaceAll('-',''));
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'nanpure/release-manifest.json')));
const base=path.join(repo,manifest.base.replace(/^\//,''),'notebook');
const save=(name,p)=>fs.writeFileSync(path.join(out,name),JSON.stringify(p,null,2));
const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const historyFile=path.join(out,'history.json');
const history=fs.existsSync(historyFile)?JSON.parse(fs.readFileSync(historyFile)):JSON.parse(fs.readFileSync(new URL('./previously-prepared.json',import.meta.url)));
const used=new Set(Object.values(history.posts||{}).flatMap(p=>p.fingerprints||[]));
const fingerprints=[];
function accept(p,canonical){const h=hash(canonical);if(used.has(h))return false;fingerprints.push(h);return true;}
function context(s){let state=s;const math=Object.create(Math);math.random=()=>{state=(state+0x6D2B79F5)|0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};const c=vm.createContext({console,performance,Date,Math:math});c.window=c;c.self=c;return c;}
const {generatorEngine}=await import(pathToFileURL(path.join(repo,'nanpure-api/scripts/stock-generator-engine.js')));
const engine=generatorEngine();let sudoku;
const started=Date.now();
while(Date.now()-started<120000){
  const p=engine.NPGenerate({kind:'normal',n:9,level:8,count:1,complexity:2},()=>{if(Date.now()-started>120000)throw Error('Sudoku generation timed out');});
  engine.NP.validate(p);if(accept(p,['sudoku',p.puzzle])){sudoku=p;break;}
}
if(!sudoku)throw Error('No unused hard Sudoku');save('sudoku.json',sudoku);

let shiru;const sc=context(seed);vm.runInContext(fs.readFileSync(new URL('./shiru-generator.cjs',import.meta.url),'utf8'),sc,{timeout:5000});
const shiruEngine=sc.ShiruGenerator.create(6,seed,'four',8),shiruStart=Date.now();
for(let attempt=0;attempt<10000&&Date.now()-shiruStart<120000;attempt++){
  const p=shiruEngine.attempt(3);
  if(p&&accept(p,['shirupure',p.rows,p.cols,p.marks])){shiru=p;break;}
}
if(!shiru)throw Error('No unused verified difficult Shirupure');save('shiru.json',shiru);

const c=context(seed);
for(const name of ['crossword-words.js','crossword-clues.js','crossword-layouts.js','crossword-engine.js','crossword-layout.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),c,{timeout:10000});
let crossword;
for(let i=0;i<100;i++){const p=c.Crossword.generate(0,seed+i,{level:3,clue:0,genre:'all'});if(p.n===7&&[0,1].every(d=>p.entries.filter(e=>e.d===d).reduce((h,e)=>h+Math.max(51,Math.ceil(e.clue.length/21)*44+7),0)<=745)&&c.Crossword.valid(p)&&accept(p,['crossword',p.n,p.grid])){crossword=p;break;}}
if(!crossword)throw Error('No unused valid crossword');save('crossword-generated.json',crossword);

vm.runInContext(fs.readFileSync(path.join(repo,'scripts/client-overrides/public/notebook/wado-engine.js'),'utf8'),c,{timeout:5000});
const data=JSON.parse(fs.readFileSync(path.join(repo,'scripts/client-overrides/public/notebook/wado-data.json'))),we=c.NPWado.create(data);let wado;
for(let i=0;i<200;i++){
  const p=we.generate({level:8,count:4,seed:seed+i});we.validate(p);
  const words=c.NPWado.positions.map(position=>{const word=we.word(p,position),e=we.entry(word,p);return{position,word,reading:e.reading,sources:e.readingSources};});
  if(words.some(e=>!e.sources||e.sources.length<2))continue;
  if(accept(p,['wado',['top','left','right','bottom'].map(k=>p.arms[k])])){wado={...p,words};break;}
}
if(!wado)throw Error('No unused dictionary-verified Wado');save('wado.json',wado);
save('meta.json',{date:day,fingerprints,sourceVersion:manifest.version});
console.log('Generated four unused puzzles for '+day);
