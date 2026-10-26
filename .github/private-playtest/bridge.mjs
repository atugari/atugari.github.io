import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),release=JSON.parse(readFileSync('.github/private-playtest/bridge-release.json','utf8'));
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,database='7bb28b61-5fe2-47ce-b71b-b0e04fc3747b';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
async function query(sql,params=[]){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{method:'POST',headers,body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(60000)}),data=await r.json();
 if(!r.ok||!data.success||data.result?.some(v=>v.success===false))throw Error('Temporary encrypted transfer database operation failed (HTTP '+r.status+').');
 return data.result[0]?.results||[];
}
const digest=b=>createHash('sha256').update(b).digest('hex');
const temp=process.env.RUNNER_TEMP;
if(!temp||!token||!account||!/^\w{32}$/.test(release.release)||!/^[a-f0-9]{64}$/.test(release.uploadHash))throw Error('Missing private transfer configuration.');
const command=process.argv[2];
if(command==='prepare'){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/private-playtest/settings',{headers,signal:AbortSignal.timeout(20000)}),data=await r.json();
 if(data.success){const names=new Set((data.result?.bindings||[]).map(v=>v.name));if(!names.has('DEPLOY_DB')&&!(names.has('ARENA')&&names.has('GATE_LIMITER')))throw Error('The target Worker belongs to another project.');}
 else if(r.status!==404||!data.errors?.some(v=>v.code===10007))throw Error('Could not verify the isolated destination (HTTP '+r.status+').');
 await query('CREATE TABLE IF NOT EXISTS private_playtest_release_parts(release_id TEXT NOT NULL,path TEXT NOT NULL,data TEXT NOT NULL,sha TEXT NOT NULL,PRIMARY KEY(release_id,path))');
 const folder=resolve(temp,'private-playtest-inbox');mkdirSync(folder,{recursive:true,mode:0o700});
 const config={name:'private-playtest',main:resolve(root,'.github/private-playtest/bridge-worker.mjs'),compatibility_date:'2026-05-15',workers_dev:true,preview_urls:false,d1_databases:[{binding:'DEPLOY_DB',database_name:'puzzle-db',database_id:database}],vars:{UPLOAD_HASH:release.uploadHash,RELEASE_ID:release.release}};
 writeFileSync(resolve(folder,'wrangler.json'),JSON.stringify(config));console.log('Authenticated encrypted inbox prepared.');
}else if(command==='receive'){
 console.log('STAGING_UPLOAD_READY=https://private-playtest.puzzle-hub-4826.workers.dev');
 let ready=false;
 for(let i=0;i<60;i++){if((await query('SELECT path FROM private_playtest_release_parts WHERE release_id=? AND path=?',[release.release,'complete'])).length){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,10000));}
 if(!ready)throw Error('Encrypted transfer did not finish within the reception window.');
 const paths=await query('SELECT path,sha FROM private_playtest_release_parts WHERE release_id=? AND path<>?',[release.release,'complete']);
 const folder=resolve(temp,'private-playtest-encrypted');mkdirSync(folder,{recursive:true,mode:0o700});
 for(const row of paths){
  if(!/^(payload-\d{3}\.bin|payload\.json)$/.test(row.path))throw Error('Invalid encrypted inbox path.');
  const rows=await query('SELECT data FROM private_playtest_release_parts WHERE release_id=? AND path=?',[release.release,row.path]);
  const bytes=Buffer.from(rows[0].data,'base64');if(digest(bytes)!==row.sha)throw Error('Encrypted transfer digest check failed.');writeFileSync(resolve(folder,row.path),bytes,{mode:0o600});
 }
 const manifest=JSON.parse(readFileSync(resolve(folder,'payload.json'),'utf8'));if(manifest.sha256!==release.encryptedSha256)throw Error('Wrong encrypted release.');
 console.log('Private encrypted package received and checked.');
}else if(command==='mask'){
 const entryPath=resolve(temp,'private-playtest/src/index.js'),before="const target=u.pathname==='/'?new URL('/arena/'+u.search,u):u;",after="if(u.pathname==='/')return response(null,303,{'Location':'/arena/'+u.search}); const target=u;";
 const source=readFileSync(entryPath,'utf8');
 if(!source.includes(before)&&!source.includes(after))throw Error('Unknown private entry routing format.');
 writeFileSync(entryPath,source.replace(before,after),{mode:0o600});
 const secrets=JSON.parse(readFileSync(resolve(temp,'private-playtest/.secrets/worker-secrets.json'),'utf8'));
 for(const value of Object.values(secrets))console.log('::add-mask::'+value);
 console.log('::add-mask::'+readFileSync(resolve(temp,'private-playtest/.secrets/check-code'),'utf8').trim());
}else if(command==='cleanup'){
 await query('DELETE FROM private_playtest_release_parts WHERE release_id=?',[release.release]);console.log('Temporary encrypted transfer rows removed.');
}else throw Error('Expected prepare, receive, mask, or cleanup.');
