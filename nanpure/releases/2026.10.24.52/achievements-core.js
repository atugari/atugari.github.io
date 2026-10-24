/* Title rules are independent of the view and network. Events describe verified actions, never clicks alone. */
(function(g){'use strict';
const date=at=>new Date(at+9*3600000).toISOString().slice(0,10);
const base=()=>({version:1,earned:{},queue:[],counts:{},sets:{},seen:{},active:{},history:[],personal:{},flags:{},notification:'standard',participate:false});
function read(v){try{v=JSON.parse(JSON.stringify(v))}catch{return base()}if(!v||v.version!==1||typeof v.earned!=='object'||Array.isArray(v.earned))return base();const s=base();for(const k of ['earned','counts','sets','seen','active','personal','flags'])if(v[k]&&typeof v[k]==='object'&&!Array.isArray(v[k]))s[k]=v[k];for(const k of ['queue','history'])if(Array.isArray(v[k]))s[k]=v[k];s.queue=s.queue.filter(id=>/^NP-\d{4}$/.test(id)&&s.earned[id]);s.history=s.history.slice(-200);s.notification=['standard','quiet','off'].includes(v.notification)?v.notification:'standard';s.participate=v.participate===true;return s;}
function inc(s,k,n=1){s.counts[k]=(Number(s.counts[k])||0)+n;}
function distinct(s,k,v){if(v===undefined||v===null)return false;const a=s.sets[k]||(s.sets[k]=[]);if(a.includes(v))return false;a.push(v);s.counts[k]=a.length;return true;}
function once(s,k,v){if(!v)return false;const a=s.seen[k]||(s.seen[k]={});if(a[v])return false;a[v]=1;return true;}
function secret(s,n){s.counts['secret:s'+String(n).padStart(3,'0')]=1;}
function pattern(a,p){return a.length>=p.length&&p.every((x,i)=>a[a.length-p.length+i]===x);}
function anyPattern(a,p){return a.some((_,i)=>p.every((x,j)=>a[i+j]===x));}
function active(s,d){return s.active[d.id]||(s.active[d.id]={first:[],filled:[],modes:[],sources:[],hints:0,errors:0,notes:0,undos:0,guide:[],observed:false,erased:false});}
function family(s,key,d){inc(s,key);if(d.kind)inc(s,key+':kind:'+d.kind);}
function evaluate(s,c,at){const added=[];function earn(x){if(s.earned[x.id]||(s.counts[x.rule]||0)<x.target)return; s.earned[x.id]={at,confirmedAt:at};s.queue.push(x.id);added.push(x.id);}
for(const x of c.rows)if(x.chapter!==18)earn(x);
if(added.length&&s.notification==='off'&&!s.earned['NP-0906']){secret(s,6);earn(c.rows.find(x=>x.id==='NP-0906'));}
const owned=c.rows.filter(x=>x.chapter!==18&&s.earned[x.id]);s.counts['meta:count']=owned.length;s.counts['meta:visibility']=new Set(owned.map(x=>x.visibility)).size===3?1:0;s.counts['meta:rarities']=new Set(owned.map(x=>x.rarity)).size===6?1:0;
for(const x of c.rows)if(x.chapter===18)earn(x);
return added;}
function clearSecrets(s,c,d,a,at){const h=s.history.filter(x=>x.game==='sudoku'),total=s.counts['clear:all']||0,n=d.n,first=a.first,vals=first.map(x=>x.v),last=first.at(-1),last3=first.slice(-3);const nine=n===9,initial=a.observed&&!a.erased;
if(nine&&initial&&last){if(last.i===40)secret(s,11);if(last.i===0)secret(s,12);if(last.v===9)secret(s,13);if(last.v===1)secret(s,14);}
const patterns=[[15,[1,3,5]],[16,[1,2,4,8]],[17,[1,2,3,2,1]],[18,[2,3,5,7]],[19,[3,1,4,1,5]],[20,[1,1,2,3,5,8]]];for(const[k,p]of patterns)if((k===15?n>=6:nine)&&anyPattern(vals,p))secret(s,k);
if(nine&&initial&&last3.length===3){const rows=last3.map(x=>Math.floor(x.i/9)),cols=last3.map(x=>x.i%9),blocks=last3.map(x=>Math.floor(x.i/27)*3+Math.floor(x.i%9/3));if(new Set(rows).size===1)secret(s,21);if(new Set(cols).size===1)secret(s,22);if(d.kind==='normal'){if(new Set(blocks).size===1)secret(s,23);if(last3.every(x=>Math.floor(x.i/9)===x.i%9))secret(s,24);if(new Set(rows).size===3&&new Set(cols).size===3&&new Set(blocks).size===3)secret(s,25);}}
if(nine){for(let i=0;i<first.length;i++){const q=first.slice(i,i+3);if(q.length===3){const[r0,c0]=[Math.floor(q[0].i/9),q[0].i%9];if(q[1].i===(r0+1)*9+c0+1&&q[2].i===(r0+2)*9+c0+2&&r0<7&&c0<7)secret(s,26);if(q[1].i===r0*9+c0+1&&q[2].i===(r0+1)*9+c0+1&&r0<8&&c0<8)secret(s,27);}
const q2=first[i+1];if(q2&&first[i].i+q2.i===80)secret(s,28);if(q2&&d.kind==='antiknight'){const dr=Math.abs(Math.floor(first[i].i/9)-Math.floor(q2.i/9)),dc=Math.abs(first[i].i%9-q2.i%9);if(dr*dc===2)secret(s,29);}}
if(a.observed&&!d.hints)for(let i=0;i<=vals.length-9;i++)if(new Set(vals.slice(i,i+9)).size===9)secret(s,30);}
const hs=h.concat(d);const sizes=hs.map(x=>x.n),kinds=hs.map(x=>x.kind);for(const[k,p]of [[31,[6,9,6]],[32,[4,6,8,9]],[33,[9,8,6,4]]])if(pattern(sizes,p))secret(s,k);if(pattern(hs.filter(x=>x.kind==='normal').map(x=>x.n),[9,16,25]))secret(s,34);
for(const[k,p]of [[35,['normal','jigsaw','normal']],[36,['normal','killer','normal']],[37,['thermo','arrow','renban']],[38,['sandwich','skyscraper','sandwich']],[39,['kropki','diagonal','hyper']],[40,['normal','killer','jigsaw','killer','normal']]])if(pattern(kinds,p))secret(s,k);
const dh=hs.filter(x=>x.daily);if(pattern(dh.map(x=>x.tier),[1,3,1]))secret(s,41);if(d.daily){const same=dh.filter(x=>x.day===d.day).map(x=>x.tier);if(pattern(same,[3,2,1]))secret(s,42);if(pattern(same,[2,1,3]))secret(s,43);}
const levels=hs.filter(x=>x.kind==='normal'&&x.n===9).map(x=>x.level);if(pattern(levels,[1,2,3,2,1]))secret(s,44);if(pattern(levels,[2,4,8]))secret(s,45);
if(a.observed&&a.modes.length===1)distinct(s,'pure-modes',a.modes[0]);if((s.counts['pure-modes']||0)>=2)secret(s,46);if(a.observed&&a.sources.length===1)distinct(s,'pure-sources',a.sources[0]);if((s.counts['pure-sources']||0)>=2)secret(s,47);
if(d.hints===1&&a.hintCell!==undefined&&d.grid?.[a.hintCell]===a.hintValue&&!a.hintErased)secret(s,48);if(d.hints&&first.filter(x=>x.at>(a.lastHint||Infinity)).length>=10)secret(s,49);if(a.notesClearedAt&&first.filter(x=>x.at>a.notesClearedAt).length>=5)secret(s,50);if(a.undoRestored)secret(s,51);if(a.resumedDay&&a.resumedDay<date(at))secret(s,52);if(a.resumed&&distinct(s,'resumed-clears',d.id)&&(s.counts['resumed-clears']||0)>=2)secret(s,53);if(a.observed&&a.timerHidden&&d.timerHidden)secret(s,54);if(a.observed&&a.silent&&d.silent)secret(s,55);
if(total>=100&&total%100===0&&nine)secret(s,56);if(total>=25&&Number.isInteger(Math.sqrt(total))&&d.kind==='normal')secret(s,57);if(total>=32&&Math.log2(total)%1===0&&!d.hints)secret(s,58);if(total>=31&&d.kind==='jigsaw'&&Array.from({length:Math.floor(Math.sqrt(total))-1},(_,i)=>i+2).every(x=>total%x))secret(s,59);if(total>=111&&/^([1-9])\1{2,}$/.test(String(total))&&d.errorKnown&&d.errors===0)secret(s,60);
if(d.generated&&s.seen['print-separated']?.[d.id])secret(s,70);if(d.kind==='jigsaw'&&s.history.at(-1)?.game==='shirupure')secret(s,81);if(d.kind==='killer'&&s.history.at(-1)?.game==='tenbin')secret(s,83);
if(c.kinds.every(k=>(s.counts['nohint:kind:'+k]||0)>0))secret(s,91);
if(d.daily){const dt=new Date(at+9*3600000);distinct(s,'daily:quarters',Math.floor(dt.getUTCMonth()/3));distinct(s,'daily:weekdays',dt.getUTCDay());distinct(s,'daily:months',dt.getUTCMonth());if(s.counts['daily:quarters']===4)secret(s,92);if(s.counts['daily:weekdays']===7)secret(s,93);if(s.counts['daily:months']===12)secret(s,94);if(d.tier===1&&!d.hints&&d.errorKnown&&d.errors===0)distinct(s,'daily:easy-perfect',d.id);if(s.counts['daily:easy-perfect']>=50)secret(s,95);}
if((s.counts['tools:手がかりを力に']||0)>=100&&(s.counts['nohint:all']||0)>=100)secret(s,96);
if([4,6,8].every(n=>(s.counts['perfect:max:normal:'+n]||0)>0))secret(s,98);if(['normal:9:18','thermo:9:8','arrow:9:8','jigsaw:9:5'].every(k=>s.counts['nohint:level:'+k]))secret(s,99);
}
function apply(s,c,type,d={},at=Date.now()){
if(!Number.isFinite(at))return[];const id=typeof d.id==='string'?d.id:'';
if(type==='start'&&id){const previous=s.active[id],a=active(s,d);if(previous){a.resumed=true;a.resumedDay=a.savedDay||date(at);}else{a.observed=d.fresh===true;a.timerHidden=!!d.timerHidden;a.silent=!!d.silent;}a.savedDay=date(at);a.lastAt=at;if(d.filtered)a.filtered=true;}
else if(type==='input'&&id){const a=active(s,d);a.lastAt=at;a.savedDay=date(at);if(d.timerHidden===false)a.timerHidden=false;if(d.silent===false)a.silent=false;if(d.memo){a.notes++;}else{if(d.value===0&&d.old)a.erased=true;if(d.value>0&&d.value!==d.old){if(d.correct===false)a.errors++;if(!d.byHint){if(!a.filled.includes(d.cell)&&d.correct){a.filled.push(d.cell);a.first.push({i:d.cell,v:d.value,at});}if(!a.modes.includes(d.mode))a.modes.push(d.mode);if(!a.sources.includes(d.source))a.sources.push(d.source);if(a.undoCell!==undefined&&d.correct&&d.cell!==a.undoCell)a.afterUndo=true;if(a.afterUndo&&d.cell===a.undoCell&&d.correct)a.undoRestored=true;}}if(a.hintCell===d.cell&&d.value!==a.hintValue)a.hintErased=true;}}
else if(type==='options'&&id){const a=active(s,d);if(d.timerHidden===false)a.timerHidden=false;if(d.silent===false)a.silent=false;}
else if(type==='hint'&&id){const a=active(s,d);a.hints++;a.lastHint=at;if(d.cell!==undefined){a.hintCell=d.cell;a.hintValue=d.value;}if(d.technique&&s.flags['guide:'+d.technique])a.pendingGuide=d.technique;}
else if(type==='guide-apply'&&id){const a=active(s,d);if(d.technique&&s.flags['guide:'+d.technique]&&!a.guide.includes(d.technique))a.guide.push(d.technique);}
else if(type==='undo'&&id){const a=active(s,d);a.undos++;if(d.correct){a.undoCell=d.cell;a.afterUndo=false;}}
else if(type==='notes-cleared'&&id)active(s,d).notesClearedAt=at;
else if(type==='clear'&&id&&d.valid===true&&!d.auto&&!d.revealed&&d.game!=='wado'&&once(s,'clear',id)){
const a=active(s,d);d={...d,id,at,generated:!!s.flags['generated:'+id],hints:Math.max(d.hints||0,a.hints),errors:Math.max(d.errors||0,a.errors)};
if(d.game==='sudoku'){
if(!c.kinds.includes(d.kind)||!Number.isInteger(d.n)||!Number.isInteger(d.level))return[];
family(s,'clear:all',{});inc(s,'clear:kind:'+d.kind);if(d.kind==='normal')inc(s,'clear:normal:size:'+d.n);if(d.level>0)inc(s,'clear:first-level:'+d.kind+':'+d.n+':'+d.level);
if(!d.hints){inc(s,'nohint:all');inc(s,'nohint:kind:'+d.kind);inc(s,'nohint:level:'+d.kind+':'+d.n+':'+d.level);if(d.level===c.limits[d.kind+':'+d.n])inc(s,'nohint:max:'+d.kind+':'+d.n);}
if(d.errorKnown&&d.errors===0){inc(s,'noerror:all');inc(s,'noerror:kind:'+d.kind);if(!d.hints){inc(s,'perfect:all');inc(s,'perfect:kind:'+d.kind);if(d.level===c.limits[d.kind+':'+d.n])inc(s,'perfect:max:'+d.kind+':'+d.n);}}
const tools={'しおりの続き':a.resumed&&!d.ranked,'余白の作戦家':a.notes>0,'手がかりを力に':d.hints>0,'指先の解き手':a.sources.includes('keyboard'),'マスから始まる一手':a.modes.includes('cell'),'数字から始まる一手':a.modes.includes('number'),'立て直す力':d.errors>0,'ひとつ戻って前へ':a.undos>0};for(const[k,v]of Object.entries(tools))if(v)inc(s,'tools:'+k);
if(d.favorite)inc(s,'library:お気に入りの頁');if(a.filtered)inc(s,'library:見つけ直した一枚');
for(const k of a.guide){inc(s,'guide:apply:'+k);distinct(s,'guide:variety',k);}if(a.guide.length>=3)s.counts['guide:three-in-one']=1;
if(d.daily){inc(s,'daily:clears');distinct(s,'daily:active-days',date(at));distinct(s,'daily:issue-days',d.day);inc(s,'daily:tier:'+(['','簡単','普通','難問'][d.tier]||''));distinct(s,'daily:kind-variety',d.kind);if(d.day&&d.day<date(at))inc(s,'daily:past');const days=s.flags.dayTiers||(s.flags.dayTiers={});const tiers=days[d.day]||(days[d.day]=[]);if(!tiers.includes(d.tier))tiers.push(d.tier);if(tiers.length===3)distinct(s,'daily:three-tiers',d.day);if(d.ranked){inc(s,'ranked:completed');distinct(s,'ranked:tier-variety',d.tier);}}
const key=d.kind+':'+d.n+':'+d.level+':'+d.hints+':'+(d.errorKnown?d.errors:'?'),p=s.personal[key]||(s.personal[key]=[]);if(a.observed&&Number.isFinite(d.elapsed)&&d.elapsed>0){if(p.length&&d.elapsed<Math.min(...p)){inc(s,'personal:best-updates');distinct(s,'personal:best-kinds',d.kind);}if(p.length>=5){const sorted=p.slice(-5).sort((a,b)=>a-b);if(d.elapsed<sorted[2])inc(s,'personal:median');}p.push(d.elapsed);if(p.length>20)p.shift();}
if(d.level>0){const pair=d.kind+':'+d.n,max=s.flags['max:'+pair];if(Number.isInteger(max)&&d.level>max)inc(s,'personal:level-updates');s.flags['max:'+pair]=Math.max(max||0,d.level);distinct(s,'levels:'+pair,d.level);if(s.counts['levels:'+pair]===c.limits[pair])distinct(s,'personal:all-level-pairs',pair);}
clearSecrets(s,c,d,a,at);
}else if(d.game==='shirupure'){
inc(s,'shirupure:部屋を結ぶ手');if(d.variant==='four')inc(s,'shirupure:印の住む部屋');if(d.variant==='number')inc(s,'shirupure:数字の住む部屋');if(d.colors>=2){inc(s,'shirupure:色で考える部屋');distinct(s,'shiru:colored-variants',d.variant);if(s.counts['shiru:colored-variants']>=2)secret(s,84);}if(a.resumed)inc(s,'shirupure:部屋の続きから');if(a.undos)inc(s,'shirupure:引き直す境界');if(d.afterClearMarks>=5)secret(s,85);if(a.resumedDay&&a.resumedDay<date(at))secret(s,86);
}else if(d.game==='crossword'){
inc(s,'crossword:clear');if(!d.hints){inc(s,'crossword:nohint');if(a.resumed)secret(s,87);}if(d.hints===1&&d.afterHint>=10)secret(s,88);if(s.history.at(-1)?.game==='sudoku'&&s.history.at(-1)?.kind==='normal')secret(s,82);
}else if(d.game==='tenbin'){
inc(s,'tenbin:clear');if(d.level===10&&d.choices===1)inc(s,'tenbin:max-first');if(d.choices>1)secret(s,89);
}
s.history.push({game:d.game,kind:d.kind,n:d.n,level:d.level,tier:d.tier,daily:d.daily,day:d.day,at});s.history=s.history.slice(-200);delete s.active[id];
}else if(type==='generated'&&id&&d.valid===true&&once(s,'generated',id)){
if(d.game==='wado')inc(s,'wado:generated');else if(d.game==='sudoku'&&c.kinds.includes(d.kind)){inc(s,'generation:問題を生む手');if(d.n===9)inc(s,'generation:九つの枠の編集室');if(d.n>=16)inc(s,'generation:大判の設計机');distinct(s,'library:問題帳の広がり',d.kind);distinct(s,'generated:kinds',d.kind);s.flags['generated:'+id]=true;}
}else if(type==='generation-job'&&d.valid&&once(s,'generation-job',id)){
for(const[k,v]of Object.entries({'束ねてつくる':d.count>=10,'ルールを編む':d.kinds>=3,'作問の続きから':d.resumed&&d.count>0,'不足を補う手':d.refill&&d.count>0,'難しさの見本帳':d.levels>=3}))if(v)inc(s,'generation:'+k);if(d.rested&&d.count>0)secret(s,68);if(d.refill&&d.count>0&&s.flags.emptyRefill)secret(s,69);
}else if(type==='empty-refill')s.flags.emptyRefill=true;
else if(type==='search'&&d.valid&&once(s,'search',id))inc(s,'library:探し方の引き出し');
else if(type==='print'&&d.valid&&id){
if(once(s,'print',d.setId||id)){
if(d.game==='wado')inc(s,'wado:print');else inc(s,'print:紙へのしたく');
}
for(const[k,v]of Object.entries({'六問の一枚':d.six9,'冊子のしたく':d.booklet&&d.pages>=2,'一問を広げる':d.tiled,'答えは別の頁に':d.separate,'綴じる余白':d.gutter>=5,'一冊の中の三景':d.kinds>=3,'いつもの版で':d.preset}))if(v&&once(s,'print-family:'+k,d.setId||id))inc(s,'print:'+k);
if(d.preset)distinct(s,'library:用紙の型紙',d.preset);
for(const p of d.puzzles||[]){if(d.separate)once(s,'print-separated',p.id);if(s.flags['generated:'+p.id]){distinct(s,'generated-printed:kinds',p.kind);if(d.separate&&s.seen.clear?.[p.id])secret(s,70);}}
const old=s.flags['print-set:'+d.setId];if(old&&d.pages<old.pages){if(d.all9)secret(s,61);if(d.cellMm>=old.cellMm&&d.onlyLayout)secret(s,62);}if(d.setId)s.flags['print-set:'+d.setId]={pages:d.pages,cellMm:d.cellMm};
if(d.booklet&&d.setId){distinct(s,'bindings:'+d.setId,d.binding);if(s.counts['bindings:'+d.setId]===2)secret(s,67);}
if(d.game==='wado'){
if(d.undo)secret(s,63);if(d.viewCycle)secret(s,64);if(d.hintsRemovedMore)secret(s,65);if(d.textScale>=1.5)secret(s,66);if(d.noAnswersViewed&&!d.answersOnQuestion)secret(s,76);if(d.setId){distinct(s,'wado-print-hints:'+d.setId,!!d.hints);if(s.counts['wado-print-hints:'+d.setId]===2)secret(s,78);}
}
}else if(type==='wado-view'&&id&&d.valid){
if(once(s,'wado-view',id)){inc(s,'wado:views');inc(s,'wado:word-count:'+d.wordCount);distinct(s,'wado:level-variety',d.level);}const seq=s.flags.wadoSequence||(s.flags.wadoSequence=[]);seq.push(d.wordCount);s.flags.wadoSequence=seq.slice(-3);if(pattern(seq,[2,3,4]))secret(s,71);if(pattern(seq,[4,3,2]))secret(s,72);distinct(s,'wado:levels',d.level);if(s.sets['wado:levels'].includes(1)&&s.sets['wado:levels'].includes(10))secret(s,77);
}else if(type==='wado-hint'&&id){
const perspective=d.perspective;if(['scene','usage','feature','association','contrast'].includes(perspective)){distinct(s,'wado:hint-perspectives',perspective);if(s.flags.lastPerspective==='scene'&&perspective==='usage')secret(s,79);if(s.flags.lastPerspective==='feature'&&perspective==='contrast')secret(s,80);s.flags.lastPerspective=perspective;distinct(s,'wado-perspective:'+id,perspective);}if(d.grade)distinct(s,'wado-grade:'+id,d.grade);if(s.counts['wado-grade:'+id]===3)secret(s,73);if(d.saved&&s.counts['wado-perspective:'+id]>=2)secret(s,74);
}else if(type==='wado-print-view-cycle')secret(s,64);
else if(type==='wado-answer'&&s.flags.alternativeNotice)secret(s,75);
else if(type==='ui'){
if(d.action==='logo'){s.flags.logo=(s.flags.logo||0)+1;if(s.flags.logo>=3)secret(s,1);}if(d.action==='empty-frame')secret(s,2);if(d.action==='last-book')secret(s,3);if(d.action==='gallery'&&s.flags.darkHome)secret(s,4);if(d.action==='light-home')s.flags.lightHome=true;if(d.action==='dark-home')s.flags.darkHome=true;if(d.action==='guide'&&s.flags.lightHome)secret(s,5);if(d.action==='guide'&&d.technique)s.flags['guide:'+d.technique]=true;if(d.action==='guide-large')s.flags.largeGuide=true;if(d.action==='home'&&s.flags.largeGuide)secret(s,7);if(d.action==='credit')s.flags.credit=true;if(d.action==='external')s.flags.credit=false;if(d.action==='home'&&s.flags.credit)secret(s,10);if(d.action==='license-source'&&s.flags.license)secret(s,9);if(d.action==='license')s.flags.license=true;if(d.action==='alternative-notice')s.flags.alternativeNotice=true;if(d.action==='thick-preview')s.flags.thickPreview=true;if(d.action==='thick-play'&&s.flags.thickPreview)secret(s,8);if(d.action==='play'){s.flags.darkHome=false;s.flags.lightHome=false;}
}
if(c.kinds.every(k=>s.sets['generated-printed:kinds']?.includes(k)))secret(s,97);
if((s.counts['clear:kind:normal']||0)>0&&(s.counts['shirupure:部屋を結ぶ手']||0)>0&&(s.counts['crossword:clear']||0)>0&&(s.counts['tenbin:clear']||0)>0&&(s.counts['wado:views']||0)>0)secret(s,90);
if((s.counts['clear:all']||0)>=1000&&(s.counts['wado:print']||0)>0&&(s.counts['shirupure:部屋を結ぶ手']||0)>=10&&(s.counts['crossword:clear']||0)>=10)secret(s,100);
return evaluate(s,c,at);
}
function project(s,c,stats={}){return c.rows.map(x=>{const earned=s.earned[x.id],secret=x.visibility==='完全秘密'&&!earned;return{id:x.id,name:secret?'？？？':x.name,category:secret?'秘密':x.category,chapter:secret?19:x.chapter,rarity:x.rarity,visibility:x.visibility,description:secret?'獲得するまで名前も条件も秘密です。':earned?x.condition:x.public,earned:!!earned,at:earned?.at??null,confirmedAt:earned?.confirmedAt??null,progress:!earned&&x.visibility==='明記'?Math.min(x.target,s.counts[x.rule]||0):null,target:!earned&&x.visibility==='明記'?x.target:null,owners:stats.counts?.[x.id]??null,total:stats.total??null};});}
g.NPAchievementCore={base,read,apply,evaluate,project,date};if(typeof module==='object')module.exports=g.NPAchievementCore;
})(globalThis);
