import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {hash} from '../src/http.js';
import {japanDay} from '../src/shared/daily-plan.js';

const key='d'.repeat(64),other='e'.repeat(64),origin='https://atugari.github.io';
async function call(DB,path,{data,token=key,source=origin}={}){
 const response=await worker.fetch(new Request('https://worker.test'+path,{method:data?'POST':'GET',headers:{Origin:source,...(token?{'X-Nanpure-Key':token}:{})},...(data?{body:JSON.stringify(data)}:{})}),{DB});
 return {status:response.status,data:await response.json()};
}
function seed(DB,{player,day=japanDay(),level=1,elapsed=10000,name=null,finished=Date.now(),solved=Date.now(),...rest}){
 const row={id:crypto.randomUUID(),player,day:day+':cloudflare-v1',level,started:Date.now()-elapsed,elapsed,name,finished,solved,abandoned:null,excluded:null,...rest},fields=Object.keys(row);
 DB.raw.prepare('INSERT INTO attempts('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')').run(...Object.values(row));return row;
}

test('a correct check automatically ranks an unnamed player once, and a shared nickname updates every period',async t=>{
 let now=Date.parse('2026-11-02T03:00:00Z');t.mock.method(Date,'now',()=>now);
 const DB=database(),player=await hash('x-nanpure-key:'+key),solution=Array.from({length:81},(_,i)=>(Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9+1),puzzle=solution.slice();puzzle[80]=0;
 try{
  DB.raw.prepare('INSERT INTO daily_assignments VALUES(?,?,?,?,?,?)').run('2026-11-02:1','2026-11-02',1,'auto-unique',JSON.stringify({day:'2026-11-02',level:1,kind:'normal',n:9,puzzle,solution}),now);
  let r=await call(DB,'/api/daily',{data:{action:'start',level:1,mode:'auto'}});assert.equal(r.status,200);const id=r.data.id;
  now+=9000;
  r=await call(DB,'/api/daily',{data:{action:'check',id,level:1,grid:solution}});assert.equal(r.status,200);assert.equal(r.data.finished,true);assert.equal(r.data.elapsed,9000);
  let board=(await call(DB,'/api/ranking')).data;assert.equal(board.totalPlayers,1);assert.equal(board.rows[0].name,'ナンプレイヤー');assert.equal(board.myRank,1);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM ranking_profiles').get().n,0);
  now+=30000;r=await call(DB,'/api/daily',{data:{action:'check',id,level:1,grid:solution}});assert.equal(r.data.elapsed,9000);
  assert.equal((await call(DB,'/api/daily',{data:{action:'start',level:1,mode:'auto'}})).data.finished,true);
  seed(DB,{player,day:'2026-11-01',elapsed:60000,name:'Not a published nickname',finished:null});
  const before=DB.raw.prepare('SELECT id,elapsed,solved FROM attempts ORDER BY id').all();
  r=await call(DB,'/api/ranking-profile',{data:{name:'  ＡＢＣ  '}});assert.equal(r.status,200);assert.equal(r.data.name,'ABC');
  assert.deepEqual((await call(DB,'/api/ranking-profile')).data,{name:'ABC',displayName:'ABC'});
  for(const path of ['/api/ranking','/api/ranking?mode=score&period=today','/api/ranking?mode=score&period=all']){
   board=(await call(DB,path)).data;assert.equal(board.myEntry.name,'ABC');assert.equal(board.myEntry.isMe,true);
  }
  assert.equal((await call(DB,'/api/ranking?mode=score&period=all')).data.myEntry.clears,2);
  assert.deepEqual(DB.raw.prepare('SELECT id,elapsed,solved FROM attempts ORDER BY id').all(),before);
  await call(DB,'/api/ranking-profile',{data:{name:''}});assert.equal((await call(DB,'/api/ranking')).data.myEntry.name,'ナンプレイヤー');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM attempts WHERE id=?').get(id).n,1);
 }finally{DB.raw.close();}
});

test('every anonymous participant is reachable across pages, including ties and an own row beyond 100',async()=>{
 const DB=database(),me=await hash('x-nanpure-key:'+key);
 try{
  for(let i=0;i<122;i++)seed(DB,{player:i===121?me:'page-player-'+i,elapsed:i===121?9999999:i<60?10000:10000+i});
  seed(DB,{player:'unfinished',solved:null});seed(DB,{player:'practice',abandoned:Date.now()});seed(DB,{player:'excluded',excluded:Date.now()});seed(DB,{player:'too-fast',elapsed:1});
  for(const mode of ['time','score']){
   const rows=[];
   for(let page=1;page<=3;page++){
    const r=await call(DB,`/api/ranking?mode=${mode}&page=${page}`);assert.equal(r.status,200);
    const b=r.data;assert.equal(b.totalPlayers,122);assert.equal(b.completed,122);assert.equal(b.totalPages,3);assert.equal(b.page,page);assert.equal(b.myPage,3);assert.equal(b.hasMore,page<3);
    assert.equal(b.rows.length,page===3?22:50);assert(b.rows.every(row=>row.name==='ナンプレイヤー'));rows.push(...b.rows);
    for(const secret of [key,me,'page-player-','Not a published nickname','started','finished'])assert(!JSON.stringify(b).includes(secret));
   }
   assert.equal(rows.length,122);assert.equal(rows.filter(row=>row.isMe).length,1);
   if(mode==='time'){assert(rows.slice(0,60).every(row=>row.rank===1));assert.equal(rows[60].rank,61);assert.equal(rows.at(-1).rank,122);}
   const beyond=(await call(DB,`/api/ranking?mode=${mode}&page=999`,{token:null})).data;assert.equal(beyond.totalPlayers,122);assert.deepEqual(beyond.rows,[]);
  }
  for(const page of ['0','-1','NaN','1.5','9007199254740991'])assert.equal((await call(DB,'/api/ranking?page='+page)).status,400);
 }finally{DB.raw.close();}
});

test('nickname changes are authenticated, bounded and isolated without leaking the player identity',async()=>{
 const DB=database();
 try{
  assert.equal((await call(DB,'/api/ranking-profile',{token:null})).status,401);
  assert.equal((await call(DB,'/api/ranking-profile',{data:{name:'No'},source:'https://elsewhere.test'})).status,403);
  assert.deepEqual((await call(DB,'/api/ranking-profile')).data,{name:'',displayName:'ナンプレイヤー'});
  for(const name of ['長'.repeat(17),'a\nb','a\u200bb',123,null])assert.equal((await call(DB,'/api/ranking-profile',{data:{name}})).status,400);
  assert.equal((await call(DB,'/api/ranking-profile',{data:{name:'x'.repeat(5000)}})).status,413);
  await call(DB,'/api/ranking-profile',{data:{name:'パレード'}});
  assert.equal((await call(DB,'/api/ranking-profile',{token:other})).data.name,'');
  assert.equal((await call(DB,'/api/ranking-profile')).data.name,'パレード');
 }finally{DB.raw.close();}
});

test('migration preserves already-public names and publishes old verified clears anonymously without changing time',async()=>{
 const DB=database();
 try{
  DB.raw.exec('DROP TABLE ranking_profiles');
  const done=Date.now(),publicRow=seed(DB,{player:'already-public',name:'公開名',finished:done,solved:done});
  const old=seed(DB,{player:'old-unnamed',name:'Private draft',finished:null,solved:done,elapsed:54321});
  const excluded=seed(DB,{player:'excluded-draft',finished:null,excluded:done});
  const sql=fs.readFileSync(new URL('../migrations/0007_ranking_profiles.sql',import.meta.url),'utf8');DB.raw.exec(sql);
  assert.equal(DB.raw.prepare('SELECT name FROM ranking_profiles WHERE player=?').get(publicRow.player).name,'公開名');
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM ranking_profiles WHERE player=?').get(old.player).n,0);
  const migrated=DB.raw.prepare('SELECT * FROM attempts WHERE id=?').get(old.id);assert.equal(migrated.finished,done);assert.equal(migrated.elapsed,54321);assert.equal(migrated.name,'Private draft');
  const visible=(await call(DB,'/api/ranking')).data.rows;assert(visible.some(row=>row.name==='ナンプレイヤー'));assert(!visible.some(row=>row.name==='Private draft'));
  assert.equal(DB.raw.prepare('SELECT finished FROM attempts WHERE id=?').get(excluded.id).finished,null);
  DB.raw.prepare('UPDATE ranking_profiles SET name=? WHERE player=?').run('新しい名前',publicRow.player);DB.raw.exec(sql);
  assert.equal(DB.raw.prepare('SELECT name FROM ranking_profiles WHERE player=?').get(publicRow.player).name,'新しい名前');
 }finally{DB.raw.close();}
});
