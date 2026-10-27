import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

const origin=process.argv[2],seconds=Number(process.argv[3]||1200);
if(!origin||!origin.startsWith('https://')||new URL(origin).hostname.endsWith('.chatgpt.site')||seconds<30||seconds>1800)throw Error('Use the external public game and 30–1800 seconds');
const peers=[],began=Date.now(),code='QASOAK'+crypto.randomUUID().slice(0,6).toUpperCase();
let sent=0,received=0,rounds=0,heartbeats=0,maxBuffered=0,unexpectedCloses=0,stopping=false,lastLog=began,stage='connect';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,ms=15000,retry){let end=Date.now()+ms;while(Date.now()<end){if(f())return;await delay(retry?500:50);retry?.()}throw Error('Soak condition timed out: '+stage)}
async function connect(i){
 const u=new URL('/ws',origin);u.protocol='wss:';u.search=new URLSearchParams({mode:'private',n:'2',code,name:'SOAK'+i});
 const ws=new WebSocket(u),p={ws,id:null,room:null,players:[],seq:0,last:Date.now()};peers.push(p);
 ws.addEventListener('message',e=>{received++;p.last=Date.now();if(e.data==='pong')return;const d=JSON.parse(e.data);if(d.type==='state'){p.id=d.id;p.room=d.room;p.players=d.players}else if(d.type==='delta'&&p.room?.seed===d.seed){for(const row of d.rows){let v=p.players.find(x=>x.id===row.id);if(v)Object.assign(v,row)}}});
 ws.addEventListener('close',()=>{if(!stopping)unexpectedCloses++});
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Connect timeout')),10000);ws.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('WebSocket connection failed'))},{once:true})});return p;
}
function tick(p,alive=1,attack=0){
 const board=Array(220).fill('0');for(let i=210;i<220;i++)board[i]=String((i+p.seq)%8);
 const data={t:'tick',seq:++p.seq,round:p.room.seed,board:board.join(''),piece:[p.seq%7,3,2+p.seq%16,p.seq%4],score:p.seq*2,lines:Math.floor(p.seq/30),a:attack,alive};
 p.ws.send(JSON.stringify(data));sent++;maxBuffered=Math.max(maxBuffered,p.ws.bufferedAmount);return data;
}
let result;
try{
 await Promise.all([connect(0),connect(1)]);await until(()=>peers.every(p=>p.room?.phase===1));
 const activeStart=Date.now(),end=activeStart+seconds*1000;let nextRound=activeStart+60000;
 console.log(JSON.stringify({event:'started',seconds,origin,players:2}));
 while(Date.now()<end){
  assert.equal(unexpectedCloses,0,'Unexpected server disconnect');assert.ok(peers.every(p=>Date.now()-p.last<16000),'No server updates');
  if(Date.now()>=peers[0].room.start&&peers.every(p=>p.room.phase===1)){
   for(const p of peers)tick(p,1,p.seq%40===39?1:0);
   if(Date.now()>=nextRound){
    // Respect the relay's 100 ms minimum between game-state packets.
    const oldSeed=peers[0].room.seed,loser=peers[rounds%2];await delay(150);stage='winner';const ko=tick(loser,0);await until(()=>peers.every(p=>p.room.phase===2),15000,()=>{if(loser.room.phase===1){loser.ws.send(JSON.stringify(ko));sent++}});
    const winner=peers.find(p=>p!==loser);assert.ok(peers.every(p=>p.room.winner===winner.id));
    peers[0].ws.send(JSON.stringify({t:'ready'}));await delay(150);assert.ok(peers.every(p=>p.room.phase===2));
    stage='rematch';peers[1].ws.send(JSON.stringify({t:'ready'}));await until(()=>peers.every(p=>p.room.phase===1&&p.room.seed!==oldSeed),15000,()=>{for(const p of peers)if(p.room.phase===2)p.ws.send(JSON.stringify({t:'ready'}))});
    assert.ok(peers.every(p=>p.players.every(x=>x.alive&&x.g===0)));rounds++;nextRound=Date.now()+60000;
   }
  }else for(const p of peers){p.ws.send('ping');heartbeats++}
  if(Date.now()-lastLog>=60000){lastLog=Date.now();console.log(JSON.stringify({event:'progress',elapsedSeconds:Math.round((Date.now()-activeStart)/1000),sent,received,rounds,unexpectedCloses,maxBuffered}))}
  await delay(500);
 }
 result={pass:true,origin,seconds,elapsedSeconds:Math.round((Date.now()-activeStart)/1000),players:2,sent,received,completedRounds:rounds,heartbeats,unexpectedCloses,maxBuffered,finishedAt:new Date().toISOString(),scope:'Real public WebSockets and repeated ready/win cycles; synthetic game states, not physical-device gameplay'};
}catch(e){result={pass:false,error:e.message,stage,elapsedSeconds:Math.round((Date.now()-began)/1000),sent,received,rounds,unexpectedCloses,peers:peers.map(p=>({phase:p.room?.phase,seed:p.room?.seed,seq:p.seq,players:p.players.map(x=>({name:x.name,seq:x.seq,alive:x.alive,ready:x.ready,online:x.online,wins:x.wins}))}))};process.exitCode=1}
finally{stopping=true;for(const p of peers)if(p.ws.readyState<2)p.ws.close(1000,'QA soak finished');await writeFile('docs/soak-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))}
