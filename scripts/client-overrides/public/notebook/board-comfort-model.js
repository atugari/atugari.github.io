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
 // The shared translator keeps Japanese source text reversible on language changes.
 // Reviewed locale packs take priority over these English fallback additions.
 const labels={
  '数字':'Numbers','上':'Top','左':'Left','文字サイズ':'Text size','同じ数字':'Matching digits','完了':'Done','広く':'Expand','文字':'Text','配色':'Colors','通常':'Normal',
  '盤面と数字の配置':'Board and keypad layout','盤面を広く':'Expand board','通常表示':'Normal view',
  '盤面の拡大':'Board zoom','盤面を縮小する':'Zoom out','盤面を拡大する':'Zoom in','全体':'Fit',
  '文字・位置':'Text and layout','数字の位置':'Keypad position','自動（余白を使う）':'Automatic (use free space)',
  '浮かせる':'Floating','移動できる数字ボタン':'Movable keypad','数字ボタンを移動する。ドラッグまたは矢印キーで移動':'Move keypad: drag or use arrow keys',
  '⠿ 数字':'⠿ Numbers','数字ボタンの形':'Keypad shape','格子':'Grid','横長':'Wide','縦長':'Tall','たたむ':'Collapse','数字を表示':'Show numbers',
  '⚠ マスが小さめ':'⚠ Small cells','マスを見やすい大きさに拡大する':'Enlarge cells for readability',
  '拡大後は盤面をドラッグして移動できます':'After zooming in, drag to move the board','小さいマスの案内を閉じる':'Dismiss small-cell notice',
  '盤面の文字と位置':'Board text and layout','盤面の文字サイズ':'Board text size','数字がマスに収まる範囲で大きくします。':'Enlarge digits while keeping them inside their cells.',
  '盤面の位置':'Board alignment','100%（標準）':'100% (default)',
  '配色・強調':'Colors and highlighting','枠の配色と選択色':'Block and highlight colors',
  '配色は作った問題と問題集で共通です。数字や途中経過は変わりません。':'Color settings are shared by created puzzles and the collection. Numbers and progress stay unchanged.',
  '淡い配色のテンプレ':'Gentle color templates','色なし':'No block colors','淡い緑':'Soft green','あたたかな紙色':'Warm paper','淡い青':'Soft blue','控えめな多色':'Subtle mixed colors',
  '配色の見本':'Color preview','枠ごとに色を変える':'Color individual blocks','色を変える枠':'Block to color','この枠の色':'This block’s color',
  'この枠の色を戻す':'Reset this block','盤面でマスを選んでから開くと、そのマスを含む枠を選びます。':'Select a cell before opening this dialog to choose its block.',
  '強調する色':'Highlight colors','選択マス':'Selected cell','選択マスの色':'Selected-cell color','縦・横':'Row and column','縦・横の色':'Row and column color',
  '同じ数字の色':'Matching-digit color','強調表示を消す条件':'When to hide highlighting','消し方':'Hide highlighting',
  '消さない':'Keep visible','一定時間後':'After a delay','盤面外を押したとき':'When pressing outside the board','時間＋盤面外':'Delay or outside press',
  '消えるまで':'Delay','色だけを消します。選択したマスと数字の入力先は保持します。マスを選び直すと色が戻ります。':'Only the highlight disappears. The selected cell remains the input target. Select a cell again to restore highlighting.',
  '配色と強調を初期設定に戻す':'Reset colors and highlighting','設定を保存できませんでした。':'Could not save settings.',
  '枠{n}（{row}行{col}列から）':'Block {n} (from row {row}, column {col})','盤面{board}：枠{n}':'Board {board}: block {n}'
 };
 root.NPTranslations=root.NPTranslations||{};
 const languages=Object.keys(root.NPI18n?.names||root.NPTranslationAssets?.names||{en:'English'}).filter(code=>code!=='ja');
 for(const [source,en]of Object.entries(labels))root.NPTranslations[source]={...Object.fromEntries(languages.map(code=>[code,en])),en,...root.NPTranslations[source]};
})(typeof window==='undefined'?globalThis:window);
