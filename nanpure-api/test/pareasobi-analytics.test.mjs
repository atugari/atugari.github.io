import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {hash} from '../src/http.js';
import {japanDay} from '../src/shared/daily-plan.js';

const ownerKey='c'.repeat(64),visitor='a'.repeat(64),session='b'.repeat(64),origin='https://atugari.github.io';
async function setup(t){
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-10T02:00:00.000Z')});
 const DB=database(),env={DB,OWNER_KEY_HASH:await hash(ownerKey)};t.after(()=>DB.raw.close());
 async function call(path,{data,admin=false,headers={},method=data?'POST':'GET',originHeader=origin}={}){
  const h={...(data?{Origin:originHeader,'Content-Type':'application/json'}:{}),...(admin?{Authorization:'Bearer '+ownerKey}:{}),...headers};
  const response=await worker.fetch(new Request('https://worker.test'+path,{method,headers:h,...(data?{body:JSON.stringify(data)}:{})}),env);
  return{status:response.status,headers:response.headers,data:await response.json()};
 }
 return{DB,env,call};
}
const event=(eventId,event,extra={})=>({visitor,session,eventId,game:'wado',page:'/puzzles/wado/',screen:'play',event,...extra});

test('Pareasobi event collection is anonymous, validated, deduplicated and owner-only',async t=>{
 const{DB,call}=await setup(t);
 assert.equal((await call('/api/pareasobi/analytics',{admin:true})).status,200);
 assert.equal((await call('/api/pareasobi/analytics')).status,403);
 assert.equal((await call('/api/pareasobi/event',{data:event('1'.repeat(64),'page_view')})).status,200);
 assert.equal((await call('/api/pareasobi/event',{data:event('1'.repeat(64),'page_view')})).status,200);
 assert.equal((await call('/api/pareasobi/event',{data:event('2'.repeat(64),'screen_view')})).status,200);
 assert.equal((await call('/api/pareasobi/event',{data:event('3'.repeat(64),'ad_impression')})).status,200);
 assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM pareasobi_events').get().n,3);
 assert.equal(DB.raw.prepare('SELECT visitor FROM pareasobi_events LIMIT 1').get().visitor,await hash('pareasobi:visitor:'+visitor));
 assert.notEqual(DB.raw.prepare('SELECT visitor FROM pareasobi_events LIMIT 1').get().visitor,visitor);
 const report=await call('/api/pareasobi/analytics?range=30d',{admin:true});
 assert.equal(report.status,200);assert.equal(report.data.totals.pageViews,1);assert.equal(report.data.totals.visitors,1);assert.equal(report.data.totals.players,1);
 assert.equal(report.data.totals.adImpressions,1);assert.equal(report.data.games[0].game,'wado');assert.equal(report.data.games[0].players,1);
 assert.equal(report.data.ads[0].screen,'play');assert.equal(report.headers.get('cache-control'),'no-store');
 for(const bad of [event('4'.repeat(64),'ad_impression',{payload:'secret'}),event('5'.repeat(64),'not-real'),event('6'.repeat(64),'page_view',{game:'unlisted'}),event('7'.repeat(64),'page_view',{page:'x'.repeat(181)})])
  assert.equal((await call('/api/pareasobi/event',{data:bad})).status,400);
 assert.equal((await call('/api/pareasobi/event',{data:event('8'.repeat(64),'page_view'),originHeader:'https://evil.example'})).status,403);
 assert.equal((await call('/api/pareasobi/event',{data:event('9'.repeat(64),'page_view'),headers:{DNT:'1'}})).data.ignored,true);
});

test('unique browser counts remain stable across days while daily game usage is separated',async t=>{
 const{call}=await setup(t);
 await call('/api/pareasobi/event',{data:event('a'.repeat(64),'game_start')});
 const first=japanDay(Date.now());
 t.mock.timers.setTime(Date.now()+86400000);
 await call('/api/pareasobi/event',{data:{...event('b'.repeat(64),'game_start'),game:'crossword',page:'/puzzles/crossword/'}});
 const report=await call('/api/pareasobi/analytics?range=7d',{admin:true});
 assert.equal(report.data.totals.visitors,1);
 assert.equal(report.data.totals.starts,2);
 assert.equal(report.data.daily.length,2);
 assert.equal(report.data.daily[0].day,first);
 assert.equal(report.data.games.length,2);
});

test('invalid range and retention cleanup are bounded',async t=>{
 const{DB,call}=await setup(t);
 assert.equal((await call('/api/pareasobi/analytics?range=all',{admin:true})).status,400);
 const old=Date.now()-91*86400000;
 DB.raw.prepare('INSERT INTO pareasobi_events VALUES(?,?,?,?,?,?,?,?,?)').run('old','2026-01-01','wado','/puzzles/wado/','play','page_view','v','s',old);
 const {cleanupPareasobiAnalytics}=await import('../src/pareasobi-analytics.js');
 await cleanupPareasobiAnalytics(DB,Date.now());
 assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM pareasobi_events').get().n,0);
});
