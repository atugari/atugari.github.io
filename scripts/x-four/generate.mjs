import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const repo=path.resolve(process.env.REPO_ROOT||new URL('../../',import.meta.url).pathname);
const out=path.resolve(process.argv[2]||'x-four-work');fs.mkdirSync(out,{recursive:true});
const day=process.argv[3]||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid date');
const slot=process.argv[4]||'08:00';
if(!['08:00','12:00','18:00','21:00'].includes(slot))throw Error('Invalid publication slot');
const publicationId=day+'@'+slot;
const seed=crypto.createHash('sha256').update(publicationId).digest().readUInt32LE(0);
const plan=JSON.parse(execFileSync(process.env.PYTHON||'python3',[new URL('./daily_plan.py',import.meta.url).pathname,day],{encoding:'utf8'}));
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'nanpure/release-manifest.json')));
const base=path.join(repo,manifest.base.replace(/^\//,''),'notebook');
const save=(name,p)=>fs.writeFileSync(path.join(out,name),JSON.stringify(p,null,2));
const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const historyFile=path.join(out,'history.json');
const history=fs.existsSync(historyFile)?JSON.parse(fs.readFileSync(historyFile)):JSON.parse(fs.readFileSync(new URL('./previously-prepared.json',import.meta.url)));
const used=new Set(Object.values(history.posts||{}).flatMap(p=>p.fingerprints||[]));
const fingerprints=[];
function accept(canonical){const h=hash(canonical);if(used.has(h))return false;used.add(h);fingerprints.push(h);return true;}
function context(s){let state=s;const math=Object.create(Math);math.random=()=>{state=(state+0x6D2B79F5)|0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};const c=vm.createContext({console,performance,Date,Math:math});c.window=c;c.self=c;return c;}
const {generatorEngine}=await import(pathToFileURL(path.join(repo,'nanpure-api/scripts/stock-generator-engine.js')));
const engine=generatorEngine();

for(const [index,item] of plan.entries()){
  const itemSeed=(seed+index*104729)>>>0,started=Date.now();let puzzle;
  if(item.family==='sudoku'){
    while(Date.now()-started<150000){
      const p=engine.NPGenerate({kind:item.rule,n:9,level:item.level,count:1,complexity:2},()=>{if(Date.now()-started>150000)throw Error('Sudoku generation timed out');});
      engine.NP.validate(p);
      if(p.level!==item.level||p.rating?.level!==item.level)continue;
      if(item.rule==='normal'&&!p.rating.humanSolvable)continue;
      const canonical=item.rule==='normal'?['sudoku',p.puzzle]:['sudoku-'+item.rule,p.puzzle,p.regions||null];
      if(accept(canonical)){puzzle=p;break;}
    }
  }else if(item.family==='shirupure'){
    const c=context(itemSeed);vm.runInContext(fs.readFileSync(new URL('./shiru-generator.cjs',import.meta.url),'utf8'),c,{timeout:5000});
    const generator=c.ShiruGenerator.create(6,itemSeed,'four',8);
    for(let attempt=0;attempt<10000&&Date.now()-started<120000;attempt++){
      const p=generator.attempt(item.level);
      if(p&&accept(['shirupure',p.rows,p.cols,p.marks])){puzzle=p;break;}
    }
  }else if(item.family==='crossword'){
    const c=context(itemSeed);
    for(const name of ['crossword-words.js','crossword-clues.js','crossword-layouts.js','crossword-engine.js','crossword-layout.js'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),c,{timeout:10000});
    for(let i=0;i<300;i++){
      const p=c.Crossword.generate(0,itemSeed+i,{level:item.level,clue:0,genre:'all'});
      if(p.n===7&&p.entries.reduce((s,e)=>s+e.clue.length,0)<=500&&[0,1].every(d=>p.entries.filter(e=>e.d===d).reduce((h,e)=>h+Math.max(51,Math.ceil(e.clue.length/21)*44+7),0)<=710)&&c.Crossword.valid(p)&&accept(['crossword',p.n,p.grid])){puzzle=p;break;}
    }
  }else if(item.family==='wado'){
    const c=context(itemSeed);
    vm.runInContext(fs.readFileSync(path.join(repo,'scripts/client-overrides/public/notebook/wado-engine.js'),'utf8'),c,{timeout:5000});
    const data=JSON.parse(fs.readFileSync(path.join(repo,'scripts/client-overrides/public/notebook/wado-data.json'))),generator=c.NPWado.create(data);
    for(let i=0;i<300;i++){
      const p=generator.generate({level:item.level,count:4,seed:itemSeed+i});generator.validate(p);
      const words=c.NPWado.positions.map(position=>{const word=generator.word(p,position),e=generator.entry(word,p);return{position,word,reading:e.reading,sources:e.readingSources};});
      if(words.some(e=>!e.sources||e.sources.length<2))continue;
      if(accept(['wado',['top','left','right','bottom'].map(k=>p.arms[k])])){puzzle={...p,words};break;}
    }
  }else throw Error('Unknown puzzle family');
  if(!puzzle)throw Error('No unused verified puzzle for '+item.rule+' at the requested level');
  save(item.data_file,puzzle);
  console.log('Generated '+item.rule+' level '+item.level+' for '+publicationId);
}
save('meta.json',{date:day,slot,publication_id:publicationId,plan_version:1,questions:plan,fingerprints,sourceVersion:manifest.version});
console.log('Generated four unused puzzles for '+publicationId);
