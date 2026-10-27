const uid=()=>crypto.randomUUID().replaceAll('-',''),blank='0'.repeat(220);
function options(url){let u=new URL(url),n=+u.searchParams.get('n'),mode=u.searchParams.get('mode'),code=(u.searchParams.get('code')||'').toUpperCase(),name=(u.searchParams.get('name')||'PLAYER').trim().slice(0,10)||'PLAYER';if(!Number.isInteger(n)||n<2||n>9||!['random','private'].includes(mode)||mode==='private'&&!/^[A-Z0-9]{4,12}$/.test(code))return null;return{n,name,bucket_:(mode==='private'?'p'+code:'r')+':'+n}}
function resetPlayer(p,clearWins=false){Object.assign(p,{board:blank,piece:'[]',score:0,lines:0,g:0,alive:1,dead:0,ready:0,last_:Date.now(),lastTick_:0});if(clearWins)p.wins=0}
function valid(d){return Number.isSafeInteger(d.seq)&&d.seq>0&&d.seq<1e9&&Number.isInteger(d.a)&&d.a>=0&&d.a<=16&&/^[0-8]{220}$/.test(d.board)&&Array.isArray(d.piece)&&d.piece.length===4&&d.piece.every(Number.isInteger)&&d.piece[0]>=0&&d.piece[0]<7&&d.piece[1]>=-4&&d.piece[1]<=10&&d.piece[2]>=-4&&d.piece[2]<=22&&d.piece[3]>=0&&d.piece[3]<4&&[0,1].includes(d.alive)&&Number.isSafeInteger(d.score)&&d.score>=0&&d.score<1e9&&Number.isInteger(d.lines)&&d.lines>=0&&d.lines<1e6}
export class BattleHub{
 constructor(ctx){this.ctx_=ctx;ctx.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair('ping','pong'));this.rooms_=new Map;this.links_=new Map;for(let ws of ctx.getWebSockets()){try{let{id,room}=ws.deserializeAttachment();if(!room||!id||ws.readyState!==1)continue;this.links_.set(ws,{id,room:room.id});if(!this.rooms_.has(room.id)||this.rooms_.get(room.id).rev_<room.rev_)this.rooms_.set(room.id,room)}catch{}}}
 async fetch(req){let o=options(req.url);if(!o||req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Invalid connection',{status:400});if(this.links_.size>=144)return new Response('満員です',{status:503});let[c,s]=Object.values(new WebSocketPair);this.ctx_.acceptWebSocket(s);this.add_(s,o);await this.ctx_.storage.setAlarm(Date.now()+15000);return new Response(null,{status:101,webSocket:c})}
 add_(ws,o){let room=[...this.rooms_.values()].find(r=>r.phase===0&&r.bucket_===o.bucket_&&r.players.length<o.n);if(!room){room={id:uid(),bucket_:o.bucket_,n:o.n,phase:0,seed:crypto.getRandomValues(new Uint32Array(1))[0]>>>1,start:0,winner:'',rev_:0,players:[]};this.rooms_.set(room.id,room)}let p={id:uid(),name:o.name,seq:0,wins:0,online:1};resetPlayer(p);room.players.push(p);this.links_.set(ws,{id:p.id,room:room.id});if(room.players.length===room.n){room.phase=1;room.start=Date.now()+3500}this.broadcast_(room);return p.id}
 state_(room,id){let{players,...r}=room;delete r.bucket_;return{type:'state',now:Date.now(),id,room:r,players,ack:players.find(p=>p.id===id)?.seq||0}}
 save_(room){room.rev_++;for(let[ws,link]of this.links_)if(link.room===room.id&&ws.readyState===1)try{ws.serializeAttachment({id:link.id,room})}catch{}}
 broadcast_(room,rows){this.save_(room);for(let[ws,link]of this.links_)if(link.room===room.id&&ws.readyState===1)try{ws.send(JSON.stringify(rows?{type:'delta',room:room.id,seed:room.seed,rows}:this.state_(room,link.id)))}catch{}}
 reply_(ws,room,id){try{ws.send(JSON.stringify(this.state_(room,id)))}catch{}}
 finish_(room){if(room.phase!==1||Date.now()<room.start)return false;let live=room.players.filter(p=>p.alive);if(live.length>1)return false;room.phase=2;room.winner=live[0]?.id||'';if(live[0])live[0].wins++;return true}
 webSocketMessage(ws,raw){let link=this.links_.get(ws),room=link&&this.rooms_.get(link.room),p=room?.players.find(p=>p.id===link.id);if(!p)return;let now=Date.now();p.last_=now;
  if(raw==='ping'){this.save_(room);ws.send('pong');return}
  let d;try{if(typeof raw!=='string'||raw.length>4096)throw 0;d=JSON.parse(raw);if(!d||typeof d!=='object')throw 0}catch{ws.close(1008,'Invalid data');this.drop_(ws);return}
  if(d.t==='ready'){
   if(room.phase===2&&room.players.every(x=>x.online)){p.ready=1;if(room.players.every(x=>x.ready)){let clear=room.n===2&&room.players.some(x=>x.wins>=2),old=room.seed;room.seed=(crypto.getRandomValues(new Uint32Array(1))[0]>>>1);if(room.seed===old)room.seed++;room.phase=1;room.start=now+3500;room.winner='';for(let x of room.players)resetPlayer(x,clear)}}this.broadcast_(room);return
  }
  if(d.t!=='tick'||!valid(d)){ws.close(1008,'Invalid state');this.drop_(ws);return}
  if(room.phase!==1||d.round!==room.seed||now<room.start||d.seq<=p.seq||now-p.lastTick_<100){this.save_(room);this.reply_(ws,room,p.id);return}
  let was=p.alive;Object.assign(p,{seq:d.seq,lastTick_:now});let rows=[p];
  if(was){Object.assign(p,{board:d.board,piece:JSON.stringify(d.piece),score:d.score,lines:d.lines,alive:d.alive});if(!p.alive)p.dead=now;if(d.a&&d.alive){let targets=room.players.filter(x=>x.id!==p.id&&x.alive&&x.online),target=targets[crypto.getRandomValues(new Uint32Array(1))[0]%Math.max(1,targets.length)];if(target){target.g+=d.a;rows.push(target)}}}
  let ended=this.finish_(room);this.broadcast_(room,ended?null:rows)
 }
 drop_(ws){let link=this.links_.get(ws);if(!link)return;this.links_.delete(ws);let room=this.rooms_.get(link.room),p=room?.players.find(x=>x.id===link.id);if(!p)return;p.online=0;p.alive=0;p.dead||=Date.now();if(room.phase===0)room.players=room.players.filter(x=>x.id!==p.id);this.finish_(room);if(![...this.links_.values()].some(l=>l.room===room.id))this.rooms_.delete(room.id);else this.broadcast_(room)}
 webSocketClose(ws){this.drop_(ws)}
 webSocketError(ws){this.drop_(ws)}
 sweep_(){let now=Date.now();for(let[ws,link]of this.links_){let p=this.rooms_.get(link.room)?.players.find(x=>x.id===link.id);if(!p||now-Math.max(p.last_,+this.ctx_.getWebSocketAutoResponseTimestamp?.(ws)||0)>15000){this.drop_(ws);try{ws.close(1001,'Connection timeout')}catch{}}}}
 async alarm(){this.sweep_();if(this.links_.size)await this.ctx_.storage.setAlarm(Date.now()+15000)}
}
