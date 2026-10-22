// Official provider limits checked 2026-10-22. These are free-plan reference
// limits, not an assertion about the user's current paid/free subscription.
export const usageDefinitions = [
  {id:'workersRequests',label:'Workers 通信回数（アカウント全体）',limit:100000,unit:'requests',scope:'account',daily:true,source:'https://developers.cloudflare.com/workers/platform/limits/'},
  {id:'d1RowsRead',label:'D1 読み込み行数（アカウント全体）',limit:5000000,unit:'rows',scope:'account',daily:true,source:'https://developers.cloudflare.com/d1/platform/pricing/'},
  {id:'d1RowsWritten',label:'D1 書き込み行数（アカウント全体）',limit:100000,unit:'rows',scope:'account',daily:true,source:'https://developers.cloudflare.com/d1/platform/pricing/'},
  {id:'d1StorageBytes',label:'D1 保存容量（アカウント全体）',limit:5000000000,unit:'bytes',scope:'account',daily:false,source:'https://developers.cloudflare.com/d1/platform/limits/'},
  {id:'d1DatabaseBytes',label:'このデータベースの保存容量',limit:500000000,unit:'bytes',scope:'database',daily:false,source:'https://developers.cloudflare.com/d1/platform/limits/'}
];
export function utcPeriod(now=Date.now()) {
  return {start:new Date(now).toISOString().slice(0,10)+'T00:00:00.000Z',end:new Date(now).toISOString(),timezone:'UTC'};
}
export const finiteUsage=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
export function usageView(snapshot,now=Date.now(),databaseBytes=null) {
  const period=utcPeriod(now),valid=snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)?snapshot:{};
  const capturedAt=Number.isSafeInteger(valid.capturedAt)?valid.capturedAt:null;
  const lastAttemptAt=Number.isSafeInteger(valid.lastAttemptAt)?valid.lastAttemptAt:capturedAt;
  const metrics=usageDefinitions.map(def=>{
    const stored=Array.isArray(valid.metrics)?valid.metrics.find(row=>row?.id===def.id):null;
    let used=finiteUsage(stored?.used)?stored.used:null;
    let measuredAt=Number.isSafeInteger(stored?.measuredAt)?stored.measuredAt:capturedAt;
    let stale=used!==null&&(!!stored?.reason||!measuredAt||now-measuredAt>7200000||def.daily&&valid.period?.start!==period.start);
    let status=used===null?'unavailable':stale?'stale':'ready';
    let note=used===null?'まだ取得できていません。Cloudflare の管理画面でも確認できます。':stale?'前回取得した値です。現在の使用量ではありません。':'Cloudflare が集計した使用量です。反映まで時間差があります。';
    if(stored?.reason==='permissions'&&used===null)note=def.daily?'使用量の閲覧権限が必要です。Account Analytics: Read を持つ読み取り専用トークンを設定すると自動取得できます。':'D1 の閲覧権限を確認してください。Cloudflare の管理画面でも容量を確認できます。';
    if(def.id==='d1DatabaseBytes'&&finiteUsage(databaseBytes)) {used=databaseBytes;measuredAt=now;status='ready';note='D1 が返した現在のデータベース容量です。';}
    return {...def,used,measuredAt,status,note};
  });
  return {capturedAt,lastAttemptAt,period:valid.period?.timezone==='UTC'&&typeof valid.period.start==='string'&&typeof valid.period.end==='string'?{start:valid.period.start,end:valid.period.end,timezone:'UTC'}:null,
    metrics,note:'無料枠の目安です。通信回数・読み書きはアカウント全体で共用し、毎日日本時間9時にリセットされます。利用プランや最新値はCloudflareで確認してください。',refreshMinutes:30};
}
