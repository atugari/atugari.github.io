import test from'node:test';import assert from'node:assert/strict';import{world}from'./client-world.mjs';
test('thirty simulated minutes of gravity, rotations, placement, clears and restarts remain valid',{timeout:120000},async()=>{
 const clock={now:10000},w=world({globals:{testClock:clock,performance:{now:()=>clock.now}}});await w.elements.get('solo').click();w.run('reset(91);running=true');
 const result=w.run(`(()=>{
  let placed=0,totalLines=0,restarts=0,maxActive=0;
  function choose(){let bestMove=null;
   for(let r=0;r<4;r++){let m=matrix(piece.t,r);for(let x=-3;x<10;x++){
    let y=piece.y;if(hit(m,x,y))continue;while(!hit(m,x,y+1))y++;let a=copy(board);m.forEach((row,Y)=>row.forEach((v,X)=>{if(v&&y+Y>=0)a[y+Y][x+X]=v}));
    let cleared=a.filter(row=>row.every(Boolean)).length;a=a.filter(row=>!row.every(Boolean));while(a.length<H)a.unshift(Array(W).fill(0));
    let heights=[],holes=0;for(let X=0;X<W;X++){let top=a.findIndex(row=>row[X]);heights.push(top<0?0:H-top);if(top>=0)for(let Y=top;Y<H;Y++)if(!a[Y][X])holes++}
    let grade=cleared*9-heights.reduce((s,v)=>s+v,0)*.5-holes*7-heights.slice(1).reduce((s,v,i)=>s+Math.abs(v-heights[i]),0)*.3;
    if(!bestMove||grade>bestMove.grade)bestMove={r,x,grade};
   }}return bestMove;
  }
  for(let frame=0;frame<108000;frame++){
   testClock.now=10000+frame*1000/60;advance(testClock.now);
   if(frame%15===0){if(dead){totalLines+=lines;restarts++;reset(restarts+91);running=true}let pick=choose();if(pick){for(let i=0;i<4&&piece.r!==pick.r;i++)rotate(1);for(let i=0;i<10&&piece.x!==pick.x;i++)if(!move(piece.x<pick.x?1:-1,0))break;act('x');placed++}}
   if(board.length!==H||board.some(row=>row.length!==W||row.some(v=>!Number.isInteger(v)||v<0||v>8)))throw Error('Invalid board during endurance');
   if(!Number.isFinite(score)||score<0||queue.length>20)throw Error('Invalid score or unbounded queue');maxActive=Math.max(maxActive,Object.keys(active).length);
  }
  return{simulatedMinutes:30,frames:108000,placed,totalLines:totalLines+lines,restarts,maxActive};
 })()`);
 assert.equal(result.frames,108000);assert.ok(result.placed>5000);assert.ok(result.totalLines>100);assert.ok(result.maxActive<20);console.log(JSON.stringify({pass:true,clientEndurance:result}));
});
