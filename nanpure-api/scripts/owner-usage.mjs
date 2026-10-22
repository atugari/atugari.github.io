// Runs on GitHub Actions only. Credentials stay in environment variables and
// are never stored in D1, printed, bundled in the app or uploaded as artifacts.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {finiteUsage,usageDefinitions,utcPeriod} from '../src/shared/provider-usage.js';
import {japanDay} from '../src/shared/daily-plan.js';
const account='3fb1db1d33caddf96fec77fac7d571e6',database='7bb28b61-5fe2-47ce-b71b-b0e04fc3747b';
const base='https://api.cloudflare.com/client/v4';
class ProviderFailure extends Error {constructor(reason='provider'){super('Provider usage is unavailable');this.reason=reason;}}
async function api(fetcher,path,token,body) {
  let response,data;
  try {response=await fetcher(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});data=await response.json();}
  catch {throw new ProviderFailure('network');}
  if(response.status===401||response.status===403)throw new ProviderFailure('permissions');
  if(!response.ok||data.success===false||data.errors?.length) {
    // Inspect the message only to classify; never persist or log provider text.
    const permission=data.errors?.some(error=>/auth|permission|not authorized|not permitted|access/i.test(error.message||''));
    throw new ProviderFailure(permission?'permissions':'provider');
  }
  return data;
}
function total(rows,key) {
  if(!Array.isArray(rows)||rows.some(row=>!finiteUsage(row?.sum?.[key])))throw new ProviderFailure();
  return rows.reduce((sum,row)=>sum+row.sum[key],0);
}
function oneAccount(data) {
  const accounts=data?.data?.viewer?.accounts;
  if(!Array.isArray(accounts)||accounts.length!==1)throw new ProviderFailure('permissions');
  return accounts[0];
}
export async function collectUsage({fetcher=fetch,token,analyticsToken=token,now=Date.now(),previous=null}) {
  const period=utcPeriod(now),date=period.start.slice(0,10),values=new Map(),reasons=new Map();
  const tasks=[
    {ids:['workersRequests'],run:async()=>{
      const query='query OwnerWorkers($account: string, $start: string, $end: string) { viewer { accounts(filter: {accountTag: $account}) { workersInvocationsAdaptive(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { requests } } } } }';
      const data=oneAccount(await api(fetcher,'/graphql',analyticsToken,{query,variables:{account,start:period.start,end:period.end}}));
      return {workersRequests:total(data.workersInvocationsAdaptive,'requests')};
    }},
    {ids:['d1RowsRead','d1RowsWritten'],run:async()=>{
      const query='query OwnerD1($account: string!, $day: Date) { viewer { accounts(filter: {accountTag: $account}) { d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: $day, date_leq: $day}) { sum { rowsRead rowsWritten } } } } }';
      const data=oneAccount(await api(fetcher,'/graphql',analyticsToken,{query,variables:{account,day:date}}));
      return {d1RowsRead:total(data.d1AnalyticsAdaptiveGroups,'rowsRead'),d1RowsWritten:total(data.d1AnalyticsAdaptiveGroups,'rowsWritten')};
    }},
    {ids:['d1StorageBytes','d1DatabaseBytes'],run:async()=>{
      // The allowance is account-wide. Do not compare one database with 5 GB.
      const list=await api(fetcher,`/accounts/${account}/d1/database?per_page=100`,token);
      if(!Array.isArray(list.result)||list.result.length>=100||(list.result_info?.total_count??list.result.length)>list.result.length)throw new ProviderFailure();
      let sum=0,own=null;
      for(const entry of list.result) {
        if(typeof entry.uuid!=='string'||!/^[a-f0-9-]{36}$/.test(entry.uuid))throw new ProviderFailure();
        const data=await api(fetcher,`/accounts/${account}/d1/database/${entry.uuid}?fields=uuid,file_size`,token);
        if(!finiteUsage(data.result?.file_size))throw new ProviderFailure();
        sum+=data.result.file_size;if(entry.uuid===database)own=data.result.file_size;
      }
      if(own===null)throw new ProviderFailure();
      return {d1StorageBytes:sum,d1DatabaseBytes:own};
    }}
  ];
  const results=await Promise.allSettled(tasks.map(task=>task.run()));
  results.forEach((result,index)=>{
    if(result.status==='fulfilled')for(const [id,value] of Object.entries(result.value))values.set(id,value);
    else for(const id of tasks[index].ids)reasons.set(id,result.reason instanceof ProviderFailure?result.reason.reason:'provider');
  });
  const capturedAt=values.size?now:Number.isSafeInteger(previous?.capturedAt)?previous.capturedAt:null;
  return {format:1,capturedAt,lastAttemptAt:now,period,metrics:usageDefinitions.map(def=>{
    if(finiteUsage(values.get(def.id)))return {id:def.id,used:values.get(def.id),measuredAt:now};
    const old=Array.isArray(previous?.metrics)?previous.metrics.find(row=>row?.id===def.id):null;
    const usable=finiteUsage(old?.used)&&Number.isSafeInteger(old.measuredAt)&&(!def.daily||previous.period?.start===period.start);
    return {id:def.id,used:usable?old.used:null,measuredAt:usable?old.measuredAt:null,reason:reasons.get(def.id)||'provider'};
  })};
}
async function main() {
  const token=process.env.CLOUDFLARE_API_TOKEN;
  if(!token)throw new Error('Cloudflare deployment credential is not configured.');
  async function query(sql,params=[]) {
    const data=await api(fetch,`/accounts/${account}/d1/database/${database}/query`,token,{sql,params});
    if(!Array.isArray(data.result)||!data.result[0]?.success)throw new Error('Unable to update the private usage snapshot.');
    return data.result[0];
  }
  const previousRow=await query("SELECT payload FROM owner_usage_snapshots WHERE id='cloudflare'");
  let previous=null;try{previous=JSON.parse(previousRow.results[0]?.payload)}catch{}
  const now=Date.now(),snapshot=await collectUsage({token,analyticsToken:process.env.CLOUDFLARE_ANALYTICS_TOKEN||token,now,previous});
  try {snapshot.siteVersion=JSON.parse(readFileSync(new URL('../../nanpure-version.json',import.meta.url),'utf8')).version;}catch{}
  await query("INSERT INTO owner_usage_snapshots(id,payload,updated) VALUES('cloudflare',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated",[JSON.stringify(snapshot),now]);
  // Only short-lived monitoring pseudonyms are pruned. Daily aggregate totals
  // and all existing application data are retained.
  const before=japanDay(now-35*86400000);
  await query('DELETE FROM visit_sessions WHERE day<?',[before]);
  await query('DELETE FROM visit_browsers WHERE day<?',[before]);
  const available=snapshot.metrics.filter(row=>row.used!==null&&!row.reason).map(row=>row.id);
  const needsRead=snapshot.metrics.some(row=>row.reason==='permissions'&&['workersRequests','d1RowsRead','d1RowsWritten'].includes(row.id));
  console.log('Private usage snapshot updated. Available metrics: '+(available.join(', ')||'none yet')+'.');
  if(needsRead)console.log('Some analytics need Account Analytics: Read. The app shows unavailable rather than zero; add an optional CLOUDFLARE_ANALYTICS_TOKEN repository secret to enable them.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Could not update the private usage snapshot. Existing values are preserved; check provider access and retry.');process.exitCode=1;});
