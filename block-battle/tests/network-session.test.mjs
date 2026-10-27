import test from'node:test';import assert from'node:assert/strict';import{spawn}from'node:child_process';
test('real local sockets isolate private/random rooms, track best-of-three and place reconnects in a new room',{timeout:40000},async()=>{
 const child=spawn(process.execPath,['public/block-battle.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});let errors='',peers=[],heartbeat;child.stderr.on('data',s=>errors+=s);
 const origin=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Startup '+errors)),5000);child.stdout.on('data',s=>{const m=s.toString().match(/http:\/\/localhost:\d+/);if(m){clearTimeout(t);resolve(m[0])}})});
 const until=async f=>{const end=Date.now()+10000;while(Date.now()<end){if(f())return;await new Promise(r=>setTimeout(r,30))}throw Error('Session condition timed out')};
 const connect=async(mode,n,code='',name='TEST')=>{const u=new URL('/ws',origin);u.protocol='ws:';u.search=new URLSearchParams({mode,n:String(n),code,name});const ws=new WebSocket(u),p={ws,room:null,players:[],id:null,seq:0};peers.push(p);ws.addEventListener('message',e=>{if(e.data==='pong')return;const d=JSON.parse(e.data);if(d.type==='state'){p.id=d.id;p.room=d.room;p.players=d.players}else if(d.type==='delta'&&p.room?.seed===d.seed)for(const row of d.rows){let v=p.players.find(x=>x.id===row.id);if(v)Object.assign(v,row)}});await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});return p};
 const tick=(p,extra={})=>p.ws.send(JSON.stringify({t:'tick',seq:++p.seq,round:p.room.seed,board:'0'.repeat(220),piece:[0,3,1,0],score:0,lines:0,a:0,alive:1,...extra}));
 try{
  const a=await connect('private',2,'GROUPA','<script>'),b=await connect('private',2,'GROUPB'),pair=await connect('private',2,'GROUPA');
  await until(()=>a.room?.phase===1&&pair.room?.phase===1&&b.room?.phase===0);assert.notEqual(a.room.id,b.room.id);assert.equal(b.players.length,1);assert.equal(a.players.length,2);
  const random=await Promise.all(Array.from({length:18},()=>connect('random',9)));heartbeat=setInterval(()=>peers.forEach(p=>{if(p.ws.readyState===1)p.ws.send('ping')}),3000);
  await until(()=>random.every(p=>p.room?.phase===1));const counts={};for(const p of random)counts[p.room.id]=(counts[p.room.id]||0)+1;assert.deepEqual(Object.values(counts).sort(),[9,9]);assert.ok(random.every(p=>p.room.id!==a.room.id&&p.room.id!==b.room.id));
  const small=await connect('random',2);await until(()=>small.room?.phase===0);assert.ok(random.every(p=>p.room.id!==small.room.id));
  for(let i=0;i<3;i++){
   await until(()=>Date.now()>=a.room.start);tick(pair,{alive:0});await until(()=>a.room.phase===2&&pair.room.phase===2);assert.equal(a.room.winner,a.id);assert.equal(a.players.find(x=>x.id===a.id).wins,i===2?1:i+1);
   const seed=a.room.seed;a.ws.send(JSON.stringify({t:'ready'}));await new Promise(r=>setTimeout(r,150));assert.equal(a.room.phase,2);pair.ws.send(JSON.stringify({t:'ready'}));await until(()=>a.room.phase===1&&pair.room.phase===1&&a.room.seed!==seed);
   assert.ok(a.players.every(p=>p.g===0&&p.alive));if(i===1)assert.ok(a.players.every(p=>p.wins===0));
  }
  const oldRoom=a.room.id;pair.ws.close();await until(()=>a.players.some(p=>!p.online));const back=await connect('private',2,'GROUPA');await until(()=>back.room?.phase===0);assert.notEqual(back.room.id,oldRoom);assert.equal(back.players.length,1);
  await until(()=>Date.now()>=a.room.start);tick(a);await until(()=>a.room.phase===2);a.ws.send(JSON.stringify({t:'ready'}));await new Promise(r=>setTimeout(r,150));assert.equal(a.room.phase,2);
  const head=await fetch(origin,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal((await fetch(origin,{method:'POST'})).status,405);
  console.log(JSON.stringify({pass:true,localRealWebSockets:true,privateIsolation:true,randomEighteen:true,separatePlayerCounts:true,bestOfThreeReset:true,allReady:true,reconnectNewRoom:true,disconnectedRematchBlocked:true,headAndMethodValidation:true}));
 }finally{clearInterval(heartbeat);for(const p of peers)p.ws.close();child.kill('SIGTERM')}
});
