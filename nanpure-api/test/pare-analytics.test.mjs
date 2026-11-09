import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {hash} from '../src/http.js';
const ownerKey='c'.repeat(64),visitor='a'.repeat(64),session='b'.repeat(64),origin='https://atugari.github.io';
const now=Date.parse('2026-11-10T12:34:00.000Z');
async function setup(t){
 t.mock.timers.enable({apis:['Date'],now});const DB=database(),env={DB,OWNER_KEY_HASH:await hash(ownerKey)};
 t.after(()=>DB.raw.close());
 async function call(path,{data,admin=false,headers={},method=data?'POST':'GET'}={}){
  const h={...(data?{Origin:origin}:{}),...(admin?{Authorization:'Bearer '+ownerKey}:{}),...headers};
  const response=await worker.fetch(new Request('https://worker.test'+path,{method,headers:h,...(data?{body:JSON.stringify(data)}:{})}),env);
  return{status:response.status,headers:response.headers,data:await response.json()};
 }
 return{DB,call};
}
test('PareAsobi analytics counts events by game and screen and deduplicates daily people',async t=>{
 const{DB,call}=await setup(t),makeEvent=(game,screen,kind,who=visitor,sess=session)=>({visitor:who,session:sess,game,screen,event:kind});
 for(const [game,screen,event]of [['pareasobi','home','page_view'],['wado','entry','page_view'],['wado','entry','game_access'],['wado','play','game_start'],['wado','play','game_start'],['wado','play','ad_impression'],['shirupure','entry','page_view']]){
  const r=await call('/api/pare/analytics',{data:makeEvent(game,screen,event)});assert.equal(r.status,200);
 }
 await call('/api/pare/analytics',{data:makeEvent('wado','play','game_access','d'.repeat(64),'e'.repeat(64))});
 const day='2026-11-10';
 const rows=DB.raw.prepare('SELECT game,screen,event,count FROM pare_analytics_daily ORDER BY game,screen,event').all();
 const find=(g,s,e)=>rows.find(x=>x.game===g&&x.screen===s&&x.event===e)?.count||0;
 assert.equal(find('wado','play','game_start'),2);
 assert.equal(find('wado','play','ad_impression'),1);
 assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM pare_analytics_unique WHERE day=? AND game='wado' AND kind='player'").get(day).n,1);
 assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM pare_analytics_unique WHERE day=? AND game='wado' AND kind='visitor'").get(day).n,2);
 assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM pare_analytics_sessions WHERE day=? AND game='wado'").get(day).n,2);
 const summary=await call('/api/pare/analytics?days=30',{admin:true});
 assert.equal(summary.status,200);assert.equal(summary.data.games.find(g=>g.id==='wado').uniquePlayers,1);
 assert.equal(summary.data.games.find(g=>g.id==='wado').adImpressions,1);
 assert.equal(summary.data.screens.find(s=>s.game==='wado'&&s.screen==='play').adImpressions,1);
 assert.equal(summary.data.totals.pageViews,3);
 assert.equal(summary.data.totals.uniqueVisitors,2);
 assert.equal(summary.data.history[0].visitors,2);
 assert.equal(summary.data.history[0].day,day);
 assert(!JSON.stringify(summary.data).includes(visitor));
});
test('PareAsobi analytics protects owner data, validates events, and respects DNT/GPC',async t=>{
 const{DB,call}=await setup(t),data={visitor,session,game:'wado',screen:'play',event:'ad_impression'};
 for(const headers of [{},{Authorization:'Bearer '+'d'.repeat(64)}]){
  const r=await call('/api/pare/analytics',{admin:false,headers});assert.equal(r.status,403);
 }
 assert.equal((await call('/api/pare/analytics',{data,headers:{DNT:'1'}})).data.skipped,true);
 assert.equal((await call('/api/pare/analytics',{data,headers:{'Sec-GPC':'1'}})).data.skipped,true);
 assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM pare_analytics_daily').get().n,0);
 for(const invalid of [{...data,event:'arbitrary'},{...data,screen:'bad screen'},{...data,extra:'private'},{...data,game:'../private'}]){
  assert.equal((await call('/api/pare/analytics',{data:invalid})).status,400);
 }
 assert.equal((await call('/api/pare/analytics',{data})).status,200);
 assert.equal((await call('/api/pare/analytics?days=30')).status,403);
 assert.equal((await call('/api/pare/analytics?days=30',{admin:true})).status,200);
 assert.equal((await call('/api/pare/analytics',{data,headers:{Origin:'https://evil.example'}})).status,403);
});
