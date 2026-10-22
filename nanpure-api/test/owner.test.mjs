import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {database} from './db.mjs';
import {hash} from '../src/http.js';
import {japanDay} from '../src/shared/daily-plan.js';
import {usageView,utcPeriod} from '../src/shared/provider-usage.js';
import {collectUsage} from '../scripts/owner-usage.mjs';

const ownerKey='c'.repeat(64),visitor='a'.repeat(64),session='b'.repeat(64);
const origin='https://atugari.github.io',ownDatabase='7bb28b61-5fe2-47ce-b71b-b0e04fc3747b';
const now=Date.parse('2026-10-22T12:34:00.000Z');
async function setup(t) {
  t.mock.timers.enable({apis:['Date'],now});
  const DB=database(),env={DB,OWNER_KEY_HASH:await hash(ownerKey),SITE_VERSION:'2026.10.22.33'};
  t.after(()=>DB.raw.close());
  async function call(path,{data,admin=false,headers={},method=data?'POST':'GET'}={}) {
    const requestHeaders={...(data?{Origin:origin}:{}),...(admin?{Authorization:'Bearer '+ownerKey}:{}),...headers};
    for(const [name,value] of Object.entries(requestHeaders))if(value===null)delete requestHeaders[name];
    const response=await worker.fetch(new Request('https://worker.test'+path,{method,headers:requestHeaders,...(data?{body:JSON.stringify(data)}:{})}),env);
    return {status:response.status,headers:response.headers,data:await response.json()};
  }
  return {DB,env,call};
}

test('owner overview requires the existing bearer secret before touching private data',async t=>{
  const {env,call}=await setup(t);let touched=false;
  env.DB={batch(){touched=true;throw Error('private database data')},prepare(){touched=true;throw Error('private database data')}};
  for(const headers of [{},{Authorization:'Bearer '+visitor},{Authorization:'Basic '+ownerKey},{'oai-authenticated-user-email':'owner@example.test'}]) {
    const result=await call('/api/owner/overview',{headers});
    assert.equal(result.status,403);assert(!JSON.stringify(result.data).includes('private database'));
  }
  assert.equal(touched,false);
  assert.equal((await call('/api/owner/overview',{data:{},admin:true})).status,405);
});

test('visits deduplicate concurrent sessions and browsers, and store only daily hashes',async t=>{
  const {DB,call}=await setup(t),data={visitor,session};
  const results=await Promise.all(Array.from({length:6},()=>call('/api/visits',{data})));
  assert(results.every(result=>result.status===200));
  await call('/api/visits',{data:{visitor:'d'.repeat(64),session}});
  await call('/api/visits',{data:{visitor,session:'e'.repeat(64)}});
  await call('/api/visits',{data:{visitor:'d'.repeat(64),session:'f'.repeat(64)}});
  const day=japanDay(now),row=DB.raw.prepare('SELECT * FROM visit_days WHERE day=?').get(day);
  assert.equal(row.browsers,2);assert.equal(row.visits,3);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM visit_sessions').get().n,3);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM visit_browsers').get().n,2);
  const saved=DB.raw.prepare('SELECT visitor FROM visit_browsers ORDER BY visitor').all().map(row=>row.visitor);
  assert(saved.includes(await hash(day+':visitor:'+visitor)));assert(!saved.includes(visitor));
  assert.deepEqual(DB.raw.prepare('PRAGMA table_info(visit_browsers)').all().map(row=>row.name),['day','visitor','created']);
  const summary=await call('/api/owner/overview',{admin:true});
  assert.deepEqual(summary.data.traffic.today,{browsers:2,visits:3});
  assert.equal(summary.data.traffic.since,now);assert(!JSON.stringify(summary.data).includes(visitor));
  t.mock.timers.setTime(now+86400000);
  await call('/api/visits',{data});
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM visit_browsers').get().n,3);
  assert.notEqual(await hash(day+':visitor:'+visitor),await hash(japanDay(now+86400000)+':visitor:'+visitor));
});

test('visit collector respects privacy signals, bounds input, enforces origin and limits new visits',async t=>{
  const {DB,call}=await setup(t),data={visitor,session};
  for(const signal of ['DNT','Sec-GPC'])assert.equal((await call('/api/visits',{data,headers:{[signal]:'1'}})).status,200);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM visit_days').get().n,0);
  for(const invalid of [{visitor,session:'short'},{visitor,session,referrer:'private'},{visitor:123,session}])assert.equal((await call('/api/visits',{data:invalid})).status,400);
  assert.equal((await call('/api/visits',{data:{visitor,session,payload:'x'.repeat(500)}})).status,413);
  assert.equal((await call('/api/visits',{data,headers:{Origin:null}})).status,403);
  assert.equal((await call('/api/visits',{data,headers:{Origin:'https://other.example'}})).status,403);
  assert.equal((await call('/api/visits')).status,405);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM rate_limits').get().n,0);
  const ip='198.51.100.20',rateKey='visits:'+await hash(ip)+':'+Math.floor(now/3600000);
  DB.raw.prepare('INSERT INTO rate_limits VALUES(?,?,?)').run(rateKey,120,now+7200000);
  assert.equal((await call('/api/visits',{data,headers:{'cf-connecting-ip':ip}})).status,429);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM visit_days').get().n,0);
});

test('owner overview summarizes existing data without exposing inquiries, credentials or puzzle answers',async t=>{
  const {DB,env,call}=await setup(t),day=japanDay(now);
  const inquiry=DB.raw.prepare('INSERT INTO inquiries(id,category,topic,detail,locale,sender,created,status) VALUES(?,?,?,?,?,?,?,?)');
  ['received','received','reading','answered','closed'].forEach((status,i)=>inquiry.run('inquiry-'+i,'question','howto','PRIVATE INQUIRY CONTENT','ja','PRIVATE SENDER',now,status));
  for(const [offset,count] of [[0,3],[1,3],[2,2],[3,3]])for(let level=1;level<=count;level++) {
    const date=japanDay(now+offset*86400000),id=date+':'+level;
    DB.raw.prepare('INSERT INTO daily_assignments VALUES(?,?,?,?,?,?)').run(id,date,level,id,JSON.stringify({solution:'PRIVATE SOLUTION'}),now);
  }
  DB.raw.prepare('INSERT INTO cloud_saves(owner,revision,object_key,created,bytes,puzzles) VALUES(?,?,?,?,?,?)').run('PRIVATE BACKUP OWNER','rev','key',now,12345,4);
  DB.raw.prepare('INSERT INTO cloud_uploads VALUES(?,?,?,?,?,?,?,?,?)').run('upload','owner',null,now,now+1000,800,1,3,'digest');
  DB.raw.prepare('INSERT INTO contact_images VALUES(?,?,?)').run('img','image/png',Buffer.alloc(100));
  DB.raw.prepare('INSERT INTO daily_maintenance VALUES(?,?,0)').run('cloudflare-refill',JSON.stringify({at:now-1000,added:3}));
  DB.raw.prepare('INSERT INTO visit_days VALUES(?,?,?,?,?)').run(japanDay(now-40*86400000),7,9,now-40*86400000,now-40*86400000);
  DB.raw.prepare('INSERT INTO visit_days VALUES(?,?,?,?,?)').run(day,2,3,now,now);
  // Reapplying the new additive migration cannot alter existing application rows.
  DB.raw.exec(readFileSync(new URL('../migrations/0003_owner_monitoring.sql',import.meta.url),'utf8'));
  env.DB={prepare:DB.prepare,batch:async statements=>(await DB.batch(statements)).map(row=>({...row,meta:{...row.meta,size_after:64000}}))};
  const result=await call('/api/owner/overview',{admin:true});assert.equal(result.status,200);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(result.data.site,{url:'https://atugari.github.io/nanpure/',version:'2026.10.22.33',apiVersion:'1.2.0'});
  assert.deepEqual(result.data.inquiries,{total:5,received:2,reading:1,answered:1,closed:1,open:3});
  assert.equal(result.data.traffic.history.length,1);assert.equal(result.data.traffic.since,now-40*86400000);
  assert.equal(result.data.stock.todayCount,3);assert.equal(result.data.stock.readyDays,2);assert.equal(result.data.stock.through,japanDay(now+86400000));assert.equal(result.data.stock.lastRefillAt,now-1000);
  assert.deepEqual(result.data.storage,{backupCount:1,backupBytes:12345,uploadBytes:800,contactImageBytes:100,backupLimitBytes:209715200});
  const metric=id=>result.data.usage.metrics.find(row=>row.id===id);
  assert.equal(metric('workersRequests').used,null);assert.equal(metric('workersRequests').status,'unavailable');
  assert.equal(metric('d1DatabaseBytes').used,64000);assert.equal(metric('d1DatabaseBytes').status,'ready');
  assert(!JSON.stringify(result.data).includes('PRIVATE'));assert(!JSON.stringify(result.data).includes(ownerKey));
  const admin=await call('/api/admin',{admin:true});assert.equal(admin.status,200);assert.equal(admin.data.items.length,5);assert(!JSON.stringify(admin.data).includes('PRIVATE SENDER'));
});

test('usage presentation distinguishes absent, zero, stale, and live database measurements',()=>{
  const missing=usageView(null,now);assert(missing.metrics.every(row=>row.used===null&&row.status==='unavailable'));
  const snapshot={capturedAt:now,period:utcPeriod(now),metrics:[{id:'workersRequests',used:0,measuredAt:now},{id:'d1RowsRead',used:9,measuredAt:now-7200001},{id:'d1RowsWritten',used:-1,measuredAt:now}]};
  const view=usageView(snapshot,now,123),metric=id=>view.metrics.find(row=>row.id===id);
  assert.equal(metric('workersRequests').used,0);assert.equal(metric('workersRequests').status,'ready');
  assert.equal(metric('d1RowsRead').status,'stale');assert.equal(metric('d1RowsWritten').status,'unavailable');
  assert.equal(metric('d1DatabaseBytes').status,'ready');assert.equal(metric('d1DatabaseBytes').used,123);
  const rollover=usageView({...snapshot,period:utcPeriod(now-86400000)},now);
  assert.equal(rollover.metrics[0].status,'stale');
  assert.doesNotThrow(()=>usageView({metrics:{malformed:true}},now));
});

function providerFixture({denyAnalytics=false,denyStorage=false,incomplete=false}={}) {
  const requests=[];
  const fetcher=async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith('/graphql')) {
      if(denyAnalytics)return Response.json({errors:[{message:'not authorized: PRIVATE PROVIDER MESSAGE'}]});
      const body=JSON.parse(options.body);
      const account=body.query.includes('OwnerWorkers')?{workersInvocationsAdaptive:[{sum:{requests:17}}]}:{d1AnalyticsAdaptiveGroups:[{sum:{rowsRead:999,rowsWritten:33}}]};
      return Response.json({data:{viewer:{accounts:[account]}}});
    }
    if(denyStorage)return Response.json({success:false,errors:[{message:'Forbidden: PRIVATE PROVIDER MESSAGE'}]},{status:403});
    if(url.endsWith('?per_page=100'))return Response.json({success:true,result:[{uuid:ownDatabase},{uuid:'11111111-2222-3333-4444-555555555555'}],result_info:{total_count:incomplete?3:2}});
    return Response.json({success:true,result:{file_size:url.includes(ownDatabase)?64000:36000}});
  };
  return {fetcher,requests};
}

test('usage collector measures account aggregates, uses read-only analytics token and keeps secrets out of snapshots',async()=>{
  const {fetcher,requests}=providerFixture();
  const result=await collectUsage({fetcher,token:'FAKE DEPLOY TOKEN',analyticsToken:'FAKE ANALYTICS TOKEN',now});
  const values=Object.fromEntries(result.metrics.map(row=>[row.id,row.used]));
  assert.deepEqual(values,{workersRequests:17,d1RowsRead:999,d1RowsWritten:33,d1StorageBytes:100000,d1DatabaseBytes:64000});
  assert.equal(result.period.start,'2026-10-22T00:00:00.000Z');assert.equal(result.period.timezone,'UTC');
  const graphql=requests.filter(row=>row.url.endsWith('/graphql'));
  assert(graphql.every(row=>row.options.headers.Authorization==='Bearer FAKE ANALYTICS TOKEN'));
  assert(graphql.every(row=>!row.options.body.includes('scriptName')&&!row.options.body.includes('databaseId')));
  assert(requests.filter(row=>!row.url.endsWith('/graphql')).every(row=>row.options.headers.Authorization==='Bearer FAKE DEPLOY TOKEN'));
  assert(!JSON.stringify(result).includes('TOKEN'));
});

test('provider permission failure is unavailable, preserves explicitly stale values, and never carries daily usage into a new day',async()=>{
  const {fetcher}=providerFixture({denyAnalytics:true,denyStorage:true});
  const empty=await collectUsage({fetcher,token:'fake',now});
  assert(empty.metrics.every(row=>row.used===null&&row.reason==='permissions'));
  assert.equal(empty.capturedAt,null);assert.equal(empty.lastAttemptAt,now);
  assert(!JSON.stringify(empty).includes('PRIVATE'));
  const previous={period:utcPeriod(now),metrics:[{id:'workersRequests',used:77,measuredAt:now-10000},{id:'d1StorageBytes',used:900,measuredAt:now-10000}]};
  const sameDay=await collectUsage({fetcher,token:'fake',now,previous});
  assert.equal(sameDay.metrics[0].used,77);assert.equal(usageView(sameDay,now).metrics[0].status,'stale');
  const nextDay=await collectUsage({fetcher,token:'fake',now:now+86400000,previous});
  assert.equal(nextDay.metrics[0].used,null);assert.equal(nextDay.metrics.find(row=>row.id==='d1StorageBytes').used,900);
  const incomplete=await collectUsage({fetcher:providerFixture({incomplete:true}).fetcher,token:'fake',now});
  assert.equal(incomplete.metrics.find(row=>row.id==='d1StorageBytes').used,null);
});
