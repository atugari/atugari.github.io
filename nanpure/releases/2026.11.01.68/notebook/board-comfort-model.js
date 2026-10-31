/* Shared, versioned preferences for region colors and temporary highlighting. */
(function(root){
 'use strict';
 const key='np-board-comfort-v1';
 const templates={
  none:{name:'色なし',regions:[],selected:'#fff1d6',guide:'#dfedfb',same:'#e2ecd9'},
  sage:{name:'淡い緑',regions:['#f3f7ed','#e4eddb','#edf3e3','#e8efe0'],selected:'#d8e8bc',guide:'#e2ecdf',same:'#f2ebce'},
  paper:{name:'あたたかな紙色',regions:['#faf5e8','#eee8d7','#f6efde','#f0eadc'],selected:'#ead7b1',guide:'#ece7d7',same:'#e2e9d3'},
  blue:{name:'淡い青',regions:['#f2f6f8','#e5edf2','#edf3f5','#e8eff2'],selected:'#cfdfeb',guide:'#e1eaf0',same:'#e5ecd8'},
  pastel:{name:'控えめな多色',regions:['#edf3e5','#f6eedf','#e9eff4','#f0eaf1'],selected:'#e2d8bd',guide:'#e0eaf0',same:'#e1ecd9'}
 };
 const defaults={template:'none',colorsEnabled:false,selected:'#fff1d6',guide:'#dfedfb',same:'#e2ecd9',hide:'never',delay:3000,regions:{}};
 const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
 function normalize(v){
  v=v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const p={...defaults,regions:{}};
  if(Object.hasOwn(templates,v.template))p.template=v.template;
  p.colorsEnabled=v.colorsEnabled===true;
  for(const k of ['selected','guide','same'])if(color(v[k]))p[k]=v[k].toLowerCase();
  if(['never','timer','outside','both'].includes(v.hide))p.hide=v.hide;
  if([1000,2000,3000,5000,10000,15000].includes(v.delay))p.delay=v.delay;
  if(v.regions&&typeof v.regions==='object'&&!Array.isArray(v.regions))for(const [k,c]of Object.entries(v.regions).slice(0,1024))if(/^[a-z0-9-]{1,60}$/.test(k)&&color(c))p.regions[k]=c.toLowerCase();
  return p;
 }
 function ink(c){const n=parseInt(c.slice(1),16);return ((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000<145?'#f9fbf7':'#24362d';}
 const cache=new WeakMap();
 function groups(p){
  if(!p||typeof p!=='object')return {regions:[],cellKeys:[]};
  if(cache.has(p))return cache.get(p);
  const regions=[],cellKeys=Array.from({length:p.puzzle?.length||0},()=>[]);
  function add(key,label,ids){regions.push({key,label,ids});for(const i of ids)cellKeys[i]?.push(key);}
  if(p.kind==='multi'&&p.linked){
   p.linked.boards.forEach((b,bi)=>{
    const n=b.n||9,h=b.blockRows||3,w=b.blockCols||3;
    let region=0;for(let r=0;r<n;r+=h)for(let c=0;c<n;c+=w){
     const ids=Array.from({length:n},(_,i)=>b.map[(r+Math.floor(i/w))*n+c+i%w]);
     add('multi-'+bi+'-'+n+'-'+region,'盤面'+String.fromCharCode(65+bi)+'：枠'+(++region),ids);
    }
   });
  }else if(!p.linked&&!['neighbor','step','cross','twinKiller'].includes(p.kind)&&root.NP?.regions){
   const ids=root.NP.regions(p);
   if(Array.isArray(ids)&&ids.length===cellKeys.length){const sets=new Map();ids.forEach((id,i)=>{if(!sets.has(id))sets.set(id,[]);sets.get(id).push(i);});let at=0;for(const cells of sets.values())add((p.kind==='jigsaw'?'jigsaw':'grid')+'-'+p.n+'-'+at,'枠'+(++at)+'（'+(Math.floor(cells[0]/p.n)+1)+'行'+(cells[0]%p.n+1)+'列から）',cells);}
  }
  const result={regions,cellKeys};cache.set(p,result);return result;
 }
 function fill(prefs,region,index){const own=prefs.regions[region.key];if(own)return own;const colors=templates[prefs.template].regions;return colors.length?colors[index%colors.length]:null;}
 root.NPBoardComfortModel={key,templates,defaults,normalize,color,ink,groups,fill};
})(typeof window==='undefined'?globalThis:window);
