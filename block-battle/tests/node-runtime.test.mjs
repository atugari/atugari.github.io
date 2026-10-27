import test from 'node:test';import assert from 'node:assert/strict';import{spawn}from'node:child_process';
test('portable single file serves HTTP and nine native WebSockets',{timeout:30000},async()=>{
 const child=spawn(process.execPath,['public/block-battle.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',b=>logs+=b);let sockets=[];
 const origin=await new Promise((resolve,reject)=>{let t=setTimeout(()=>reject(Error('Server startup: '+logs)),5000);child.stdout.on('data',b=>{let m=b.toString().match(/http:\/\/localhost:\d+/);if(m){clearTimeout(t);resolve(m[0])}});child.on('exit',c=>{clearTimeout(t);reject(Error('Exit '+c+' '+logs))})});
 try{
  const r=await fetch(origin);assert.equal(r.status,200);assert.match(await r.text(),/<title>BLOCK BATTLE/);assert.equal((await(await fetch(origin+'/api/health')).json()).version,23);assert.match(await(await fetch(origin+'/block-battle.mjs')).text(),/BattleHub/);
  const join=async i=>{let url=new URL('/ws',origin);url.protocol='ws:';url.search=new URLSearchParams({mode:'private',n:'9',code:'NODETEST',name:'N'+i});let ws=new WebSocket(url);let item={ws,id:null,room:null,players:[]};sockets.push(item);ws.addEventListener('message',e=>{if(e.data==='pong')return;let d=JSON.parse(e.data);if(d.type==='state'){item.id=d.id;item.room=d.room;item.players=d.players}else if(d.type==='delta'){for(let row of d.rows){let p=item.players.find(x=>x.id===row.id);if(p)Object.assign(p,row)}}});await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});return item};
  await Promise.all(Array.from({length:9},(_,i)=>join(i)));
  const until=async(fn,ms=10000)=>{let end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('Runtime timeout')};
  await until(()=>sockets.every(x=>x.room?.phase===1&&x.players.length===9));assert.equal(new Set(sockets.map(x=>x.room.id)).size,1);assert.equal(new Set(sockets.map(x=>x.room.seed)).size,1);await until(()=>Date.now()>=sockets[0].room.start);
  const tick=(x,seq,extra={})=>x.ws.send(JSON.stringify({t:'tick',seq,round:x.room.seed,board:'0'.repeat(220),piece:[0,3,1,0],score:0,lines:0,a:0,alive:1,...extra}));
  tick(sockets[0],1,{a:4});tick(sockets[0],1,{a:4});await until(()=>sockets[0].players.reduce((s,p)=>s+p.g,0)===4);
  for(let x of sockets.slice(1))tick(x,1,{alive:0});await until(()=>sockets.every(x=>x.room.phase===2));assert.ok(sockets.every(x=>x.room.winner===sockets[0].id));
  for(let x of sockets)x.ws.send(JSON.stringify({t:'ready'}));await until(()=>sockets.every(x=>x.room.phase===1));assert.ok(sockets.every(x=>x.players.every(p=>p.g===0&&p.alive)));
  console.log(JSON.stringify({pass:true,portableNode:true,nineLiveSockets:true,attackOnce:true,victory:true,rematch:true}));
 }finally{sockets.forEach(x=>x.ws.close());child.kill('SIGTERM')}
});
