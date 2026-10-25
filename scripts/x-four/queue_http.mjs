// The owner's Workers API is accessed by Node's native HTTP client.
// Authentication is passed through stdin, never command arguments or logs.
import {pathToFileURL} from 'node:url';
const origin='https://nanpure-x-scheduler.puzzle-hub-4826.workers.dev';
const paths=new Set(['/check','/control','/state','/prepare','/image','/ready','/dry-run']);
export async function send(value,fetcher=fetch){
 const url=new URL(value.url);
 if(url.origin!==origin||!paths.has(url.pathname)||url.search||url.hash||url.username||url.password)throw Error('Unexpected queue destination');
 const response=await fetcher(url.href,{method:value.body==null?'GET':'POST',headers:{Authorization:value.authorization,'Content-Type':'application/json'},...(value.body==null?{}:{body:JSON.stringify(value.body)}),signal:AbortSignal.timeout(60000)});
 const raw=await response.text();if(raw.length>2000000)throw Error('Queue response too large');let data=null;
 try{data=JSON.parse(raw)}catch{}
 return{status:response.status,data};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2500000)throw Error('Queue request too large')}
  process.stdout.write(JSON.stringify(await send(JSON.parse(input))));
 }catch{process.stdout.write(JSON.stringify({status:0,data:{error:'Queue transport failed'}}));process.exitCode=1}
}
