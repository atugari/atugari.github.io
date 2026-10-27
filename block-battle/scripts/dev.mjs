import {spawn} from 'node:child_process';
const args=process.argv.slice(2),at=x=>{let i=args.indexOf(x);return i>=0?args[i+1]:undefined};
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--ip',at('--host')||'0.0.0.0','--port',at('--port')||'4173','--inspector-port','0'],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'}});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code||0));
