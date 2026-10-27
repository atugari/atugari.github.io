import test from 'node:test';import assert from 'node:assert/strict';import{BattleHub}from'../game/hub.js';import{http}from'../generated/game.mjs';
test('rooms, exactly-once attacks, hibernation, wins, rematch and timeout',async()=>{
 let clock=Date.now(),old=Date.now;Date.now=()=>clock;let sockets=[],alarms=[];const ctx={getWebSockets:()=>sockets.filter(w=>w.readyState===1),storage:{setAlarm:async v=>alarms.push(v)}};let hub=new BattleHub(ctx),checks=0;
 const add=(bucket_='nine',n=9)=>{let attachment;const w={readyState:1,messages:[],send(s){this.messages.push(s)},serializeAttachment:a=>attachment=structuredClone(a),deserializeAttachment:()=>structuredClone(attachment),close(code){this.readyState=3;this.code=code;hub.webSocketClose(this)}};sockets.push(w);hub.add_(w,{bucket_,n,name:'テスト名ABCDEFGHIJ'.slice(0,10)});return w};
 const snapshot=w=>w.deserializeAttachment(),room=w=>snapshot(w).room,own=w=>room(w).players.find(p=>p.id===snapshot(w).id);
 const tick=(w,seq,extra={})=>hub.webSocketMessage(w,JSON.stringify({t:'tick',seq,round:room(w).seed,board:'0'.repeat(220),piece:[0,3,1,0],score:0,lines:0,a:0,alive:1,...extra}));
 try{
  let nine=Array.from({length:9},()=>add());assert.equal(new Set(nine.map(w=>room(w).id)).size,1);assert.equal(room(nine[0]).players.length,9);assert.equal(room(nine[0]).phase,1);checks+=3;
  clock=room(nine[0]).start+1;nine.forEach(w=>tick(w,1));clock+=101;tick(nine[0],2,{a:4});tick(nine[0],2,{a:4});tick(nine[0],2,{a:4});assert.equal(room(nine[0]).players.reduce((s,p)=>s+p.g,0),4);checks++;
  tick(nine[0],3,{round:room(nine[0]).seed-1,a:16});assert.equal(room(nine[0]).players.reduce((s,p)=>s+p.g,0),4);checks++;
  let before=JSON.stringify(room(nine[0])),rid=room(nine[0]).id;hub=new BattleHub(ctx);assert.equal(JSON.stringify(room(nine[0])),before);clock+=101;tick(nine[0],2,{a:4});assert.equal(room(nine[0]).id,rid);assert.equal(room(nine[0]).players.reduce((s,p)=>s+p.g,0),4);checks+=3;
  clock+=101;tick(nine[8],2,{alive:0});clock+=101;tick(nine[8],3,{a:16,alive:1});assert.equal(own(nine[8]).alive,0);assert.equal(room(nine[0]).players.reduce((s,p)=>s+p.g,0),4);checks+=2;
  hub.webSocketMessage(nine[0],JSON.stringify({t:'ready'}));assert.equal(room(nine[0]).phase,1);checks++;
  for(let w of nine.slice(1,8)){clock+=101;tick(w,4,{alive:0})}assert.equal(room(nine[0]).phase,2);assert.equal(room(nine[0]).winner,own(nine[0]).id);assert.equal(own(nine[0]).wins,1);checks+=3;
  for(let i=0;i<4;i++)tick(nine[0],8+i);assert.equal(own(nine[0]).wins,1);checks++;
  let oldSeed=room(nine[0]).seed;nine.slice(0,8).forEach(w=>hub.webSocketMessage(w,JSON.stringify({t:'ready'})));assert.equal(room(nine[0]).phase,2);hub.webSocketMessage(nine[8],JSON.stringify({t:'ready'}));assert.equal(room(nine[0]).phase,1);assert.notEqual(room(nine[0]).seed,oldSeed);assert.ok(room(nine[0]).players.every(p=>p.alive&&p.online&&p.g===0&&!p.ready));checks+=4;
  clock=room(nine[0]).start+1;tick(nine[0],30,{round:oldSeed,a:16,alive:0});assert.equal(own(nine[0]).alive,1);assert.equal(room(nine[0]).players.reduce((s,p)=>s+p.g,0),0);checks+=2;
  const eighteen=Array.from({length:18},()=>add('random'));let ids=eighteen.map(w=>room(w).id),counts={};for(let id of ids)counts[id]=(counts[id]||0)+1;assert.deepEqual(Object.values(counts).sort(),[9,9]);checks++;
  let pair=[add('pair',2),add('pair',2)];for(let i=0;i<3;i++){clock=room(pair[0]).start+1;tick(pair[1],i+1,{alive:0});assert.equal(own(pair[0]).wins,i===2?1:i+1);pair.forEach(w=>hub.webSocketMessage(w,JSON.stringify({t:'ready'})));checks++}
  pair[1].close(1000);clock=room(pair[0]).start+1;tick(pair[0],20);assert.equal(room(pair[0]).phase,2);assert.equal(room(pair[0]).players.filter(p=>!p.online).length,1);hub.webSocketMessage(pair[0],JSON.stringify({t:'ready'}));assert.equal(room(pair[0]).phase,2);checks+=3;
  let waiting=add('waiting',2);waiting.close(1000);let fresh=[add('waiting',2),add('waiting',2)];assert.equal(room(fresh[0]).players.length,2);assert.equal(room(fresh[0]).phase,1);checks+=2;
  const bad=add('invalid',2);hub.webSocketMessage(bad,'{');assert.equal(bad.code,1008);checks++;
  const badState=add('invalid2',2);hub.webSocketMessage(badState,JSON.stringify({t:'tick',board:'8'.repeat(221)}));assert.equal(badState.code,1008);checks++;
  const max=Math.max(...sockets.filter(w=>w.readyState===1).map(w=>Buffer.byteLength(JSON.stringify(w.deserializeAttachment()))));assert.ok(max<16384);checks++;
  clock=room(nine[0]).start+16000;hub.webSocketMessage(nine[0],'ping');await hub.alarm();assert.equal(room(nine[0]).phase,2);assert.equal(room(nine[0]).winner,own(nine[0]).id);checks+=2;
  sockets.forEach(w=>{if(w.readyState===1)w.close(1000)});assert.equal(hub.rooms_.size,0);checks++;
  console.log(JSON.stringify({pass:true,checks,hibernation:true,eighteen:true,bo3:true,attachmentsMaxBytes:max}));
 }finally{Date.now=old}
});
test('HTTP public page and WebSocket admission validation',async()=>{
 let called=0;const env={HUB:{idFromName:n=>n,get:()=>({fetch:()=>{called++;return new Response('ok')}})}};
 const get=(path,headers={})=>http(new Request('https://battle.example'+path,{headers}),env);
 assert.equal((await get('/ws?n=9&mode=random')).status,426);
 assert.equal((await get('/ws?n=9&mode=random',{Upgrade:'websocket',Origin:'https://evil.invalid'})).status,403);
 assert.equal((await get('/ws?n=10&mode=random',{Upgrade:'websocket'})).status,400);
 assert.equal((await get('/ws?n=2&mode=private&code=A',{Upgrade:'websocket'})).status,400);
 assert.equal((await get('/ws?n=9&mode=random',{Upgrade:'websocket'})).status,200);assert.equal(called,1);
 let r=await get('/');assert.equal(r.headers.get('content-encoding'),null);let html=await r.text();assert.match(html,/<title>BLOCK BATTLE/);assert.ok(!html.includes('chatgpt.site'));assert.ok(!html.includes('<script src='));assert.match(html,/v25/);
 let health=await(await get('/api/health')).json();assert.equal(health.transport,'websocket');assert.equal(health.version,24);
});
