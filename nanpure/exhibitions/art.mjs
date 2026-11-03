export function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
export function btn(text,action,cls=''){const b=el('button',text,cls);b.type='button';b.onclick=action;return b;}
export function draw(canvas,p,grid=p.puzzle,focus=-1){
 const size=900;canvas.width=size;canvas.height=size;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${p.n}×${p.n}のナンプレ${focus>=0?'。注目するマスは'+(Math.floor(focus/p.n)+1)+'行'+(focus%p.n+1)+'列':''}`);
 const c=canvas.getContext('2d'),linked=p.linked?.cells&&p.linked?.boards?p.linked:null,W=linked?.width||p.n,H=linked?.height||p.n,u=(size-32)/Math.max(W,H),ox=(size-W*u)/2,oy=(size-H*u)/2;
 c.fillStyle='#fffefa';c.fillRect(0,0,size,size);c.textAlign='center';c.textBaseline='middle';c.font=`${u*.57}px system-ui`;
 const cells=linked?.cells||Array.from({length:grid.length},(_,i)=>({x:i%p.n,y:Math.floor(i/p.n)}));
 cells.forEach((pos,i)=>{const x=ox+pos.x*u,y=oy+pos.y*u;c.fillStyle=i===focus?'#f5d795':p.puzzle[i]?'#f5f3ed':'#fffefa';c.fillRect(x,y,u,u);c.strokeStyle='#d5d0c5';c.lineWidth=Math.max(.5,u*.012);c.strokeRect(x,y,u,u);if(grid[i]){c.fillStyle=p.puzzle[i]?'#35453c':'#38765e';c.fillText(String(grid[i]),x+u*.5,y+u*.53);}});
 c.lineWidth=Math.max(1.5,u*.04);c.strokeStyle='#667064';
 if(linked)for(const b of linked.boards)c.strokeRect(ox+b.x*u,oy+b.y*u,b.n*u,b.n*u);
 else if(p.regions?.length===grid.length){for(let i=0;i<grid.length;i++){const x=i%p.n,y=Math.floor(i/p.n);if(!x||p.regions[i]!==p.regions[i-1]){c.beginPath();c.moveTo(ox+x*u,oy+y*u);c.lineTo(ox+x*u,oy+(y+1)*u);c.stroke()}if(!y||p.regions[i]!==p.regions[i-p.n]){c.beginPath();c.moveTo(ox+x*u,oy+y*u);c.lineTo(ox+(x+1)*u,oy+y*u);c.stroke()}}c.strokeRect(ox,oy,p.n*u,p.n*u);}
 else{const br=p.blockRows||Math.floor(Math.sqrt(p.n)),bc=p.blockCols||p.n/br;if(Number.isInteger(bc)&&br*bc===p.n){for(let i=0;i<=p.n;i+=br){c.beginPath();c.moveTo(ox,oy+i*u);c.lineTo(ox+p.n*u,oy+i*u);c.stroke()}for(let i=0;i<=p.n;i+=bc){c.beginPath();c.moveTo(ox+i*u,oy);c.lineTo(ox+i*u,oy+p.n*u);c.stroke()}}c.strokeRect(ox,oy,p.n*u,p.n*u);}
}
