(function(root){
'use strict';
function lines(ctx,text,maxWidth){const out=[];let line='';for(const char of text){if(char==='\n'){out.push(line);line='';continue;}if(line&&ctx.measureText(line+char).width>maxWidth){out.push(line);line=char;}else line+=char;}if(line)out.push(line);return out;}
function palette(canvas){const css=root.getComputedStyle?.(canvas),get=(name,fallback)=>css?.getPropertyValue(name).trim()||fallback;return {paper:get('--paper','#f3f0e7'),ink:get('--ink','#233848'),muted:get('--muted','#5a6975'),board:get('--board-paper','#fffdf8'),clue:get('--board-ink','#26333c'),entry:get('--board-entry','#155fa5'),line:get('--board-line','#aab0b5'),frame:get('--board-frame','#293747'),note:get('--board-note','#62707d')};}
function board(canvas,state,hint,options){options=options||{};const colors=options.palette||palette(canvas),ctx=canvas.getContext('2d'),size=options.size||canvas.width,x=options.x||0,y=options.y||0,cell=size/9,A=root.NPLabAnalyzer,m=A.model(state);ctx.save();ctx.fillStyle=colors.board;ctx.fillRect(x,y,size,size);for(let i=0;i<81;i++){const cx=x+i%9*cell,cy=y+Math.floor(i/9)*cell;let bg=null;if(hint?.unit.includes(i))bg='#edf2ff';if(hint?.witness.includes(i))bg='#fff0ba';if(hint?.focus.includes(i))bg='#cbdcff';if(options.target===i)bg='#ffd59b';if(options.selected===i)bg='#b9d7fb';if(bg){ctx.fillStyle=bg;ctx.fillRect(cx,cy,cell,cell);}const v=state.grid[i];if(v){ctx.fillStyle=state.puzzle[i]?colors.clue:colors.entry;ctx.font=(state.puzzle[i]?'600 ':'500 ')+Math.floor(cell*.53)+'px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(v),cx+cell/2,cy+cell/2);}else if(options.notes!==false&&m?.candidates[i]){ctx.font=Math.max(9,Math.floor(cell*.22))+'px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';for(const d of m.candidates[i]){const dx=cx+((d-1)%3+.5)*cell/3,dy=cy+(Math.floor((d-1)/3)+.5)*cell/3;const cut=hint?.cuts.some(c=>c.i===i&&c.d===d);ctx.fillStyle=cut?'#b32939':colors.note;ctx.fillText(String(d),dx,dy);if(cut){ctx.strokeStyle='#b32939';ctx.lineWidth=Math.max(1,cell/35);ctx.beginPath();ctx.moveTo(dx-cell*.07,dy+cell*.07);ctx.lineTo(dx+cell*.07,dy-cell*.07);ctx.stroke();}}}}
for(let j=0;j<=9;j++){ctx.strokeStyle=j%3===0?colors.frame:colors.line;ctx.lineWidth=j%3===0?Math.max(2,size/230):1;ctx.beginPath();ctx.moveTo(x+j*cell,y);ctx.lineTo(x+j*cell,y+size);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y+j*cell);ctx.lineTo(x+size,y+j*cell);ctx.stroke();}ctx.restore();}
async function video(record,route,opts={}){
 if(!root.MediaRecorder)throw Error('このブラウザは動画作成に対応していません。');
 const canvas=document.createElement('canvas');canvas.width=1080;
 if(typeof canvas.captureStream!=='function')throw Error('このブラウザは盤面の動画化に対応していません。');
 const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime)throw Error('WebM動画を作れるブラウザを使ってください。');
 const ctx=canvas.getContext('2d'),A=root.NPLabAnalyzer,state=A.initial(record.puzzle),colors=palette(document.documentElement),captions=[];
 // Size the subtitle area from every actual caption; no explanation is cut off.
 const probe=A.initial(record.puzzle);ctx.font='48px system-ui,sans-serif';
 for(const step of route.steps){captions.push(A.explain(probe,step).join(' '));A.apply(probe,step);}
 const intro='確認済みの論理手順を順番に見ていきます。',outro='この問題の論理手順と唯一解は、独立した検証で確認しています。';
 const maxLines=Math.max(...[intro,outro,...captions].map(t=>lines(ctx,t,1008).length));
 canvas.height=Math.max(1500,1215+maxLines*64+36);
 const stream=canvas.captureStream(8),chunks=[],recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000}),signal=opts.signal;
 let rejectDone;
 const done=new Promise((resolve,reject)=>{rejectDone=reject;recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));recorder.onerror=e=>reject(Error(e.error?.message||'動画の作成に失敗しました。'));});
 const sleep=ms=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(Error('中断しました。'));const abort=()=>{clearTimeout(id);signal?.removeEventListener('abort',abort);reject(Error('中断しました。'));};const id=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});
 function frame(hint,title,text){
  ctx.fillStyle=colors.paper;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=colors.muted;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='30px system-ui,sans-serif';ctx.fillText('ナンプレ帳 · '+(record.sourceId||record.id),28,40);
  ctx.fillStyle=colors.ink;ctx.font='600 46px system-ui,sans-serif';ctx.fillText(title,28,99);
  board(canvas,state,hint,{x:24,y:124,size:1032,palette:colors});
  ctx.fillStyle=colors.ink;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='48px system-ui,sans-serif';
  lines(ctx,text,1008).forEach((line,i)=>ctx.fillText(line,36,1215+i*64));
 }
 try{
  frame(null,'解き方の解説',intro);recorder.start(1000);
  const stepMs=opts.stepMs||Math.min(1100,150000/Math.max(1,route.steps.length));await sleep(opts.titleMs??1000);
  for(let i=0;i<route.steps.length;i++){
   const step=route.steps[i],title=(i+1)+'手目・'+A.labels[step.type];
   frame(step,title,captions[i]);await sleep(stepMs*.65);A.apply(state,step);frame(null,title,captions[i]);opts.onProgress?.(i+1,route.steps.length);await sleep(stepMs*.35);
  }
  frame(null,'最後まで解けました',outro);await sleep(opts.titleMs??1000);recorder.stop();return await done;
 }catch(error){if(recorder.state!=='inactive')recorder.stop();rejectDone(error);await done.catch(()=>{});throw error;}
 finally{stream.getTracks().forEach(track=>track.stop());}
}
root.NPLabRender={board,video,lines};
})(globalThis);
