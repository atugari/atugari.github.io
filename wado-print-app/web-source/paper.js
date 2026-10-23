(function(g){
 'use strict';
 const sizes={compact:45,small:55,medium:70,large:90,largest:120};
 const textScales={normal:1,large:1.25,larger:1.5,largest:1.75},weights={normal:400,medium:500,bold:600};
 const defaults={problemSize:'medium',printWeight:'normal',showHeading:true,showNameDate:true,showNumber:true,showDifficulty:true,showId:false,showFooter:true};
 function paperId(p){if(p.id)return p.id;let n=2166136261;for(const c of JSON.stringify([p.arms,p.answer,p.level,p.count]))n=Math.imul(n^c.charCodeAt(0),16777619);return 'W-'+(n>>>0).toString(36).toUpperCase();}
 const flags=Object.keys(defaults).filter(k=>k.startsWith('show'));
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function preferences(input={}){const p={...defaults,...input};if(!Object.hasOwn(sizes,p.problemSize)||!Object.hasOwn(weights,p.printWeight)||flags.some(k=>typeof p[k]!=='boolean'))throw Error('印刷する項目の設定を確認してください。');return Object.fromEntries(Object.keys(defaults).map(k=>[k,p[k]]));}
 function build({host,items,kind,prefs,board,hint,words,edition='漢字穴埋め 印刷帳'}){
  const doc=host.ownerDocument,p={...prefs,...preferences(prefs)},scale=textScales[p.printText]||1,mm=sizes[p.problemSize],measure=doc.createElement('div');
  measure.className='wp-measure';measure.style.cssText='position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:190mm';
  measure.style.setProperty('--wp-board-size',mm+'mm');measure.style.setProperty('--wp-text-scale',scale);measure.style.setProperty('--wp-weight',weights[p.printWeight]);measure.style.setProperty('--wp-padding',p.spacing==='normal'?'4mm':'2mm');
  measure.style.setProperty('--wp-glyph-ratio',({normal:.142,large:.165,largest:.182}[p.kanjiSize]||.165));measure.style.setProperty('--wp-glyph-stroke',({normal:'0',bold:'.004em',heavy:'.008em'}[p.kanjiWeight]||'0'));
  doc.body.append(measure);
  let pages=[],columns=kind==='hints'?1:0;
  const grades=kind==='hints'?[1,2,3]:[0],gradeLabels=['','難しめ','ふつう','やさしめ'];
  function page(stage){const el=doc.createElement('section');el.className='sheet wado-sheet wp-sheet';el.dataset.kind=kind;if(stage)el.dataset.stage=stage;
   const title=kind==='answers'?'解答例':kind==='hints'?'ヒント · '+gradeLabels[stage]:'問題';
   const help=kind==='questions'?'矢印の向きに読んで、2文字の熟語を作りましょう。':kind==='answers'?'掲載しているのは解答例です。他の言葉が成り立つ場合もあります。':'手がかりの具体性による難しさの目安です。感じ方には個人差があります。';
   if(p.showHeading||kind==='questions'&&p.showNameDate){const head=doc.createElement('header');head.className='wp-head';head.innerHTML=(p.showHeading?'<div><h1>漢字穴埋め '+title+'</h1><p>'+help+'</p></div>':'')+(kind==='questions'&&p.showNameDate?'<div class="wp-person">お名前 __________________<br>日付 ______月______日</div>':'');el.append(head);}
   const grid=doc.createElement('div');grid.className='sheet-grid wp-grid';el.append(grid);
   if(p.showFooter){const foot=doc.createElement('footer');foot.className='wp-foot';foot.innerHTML='<span>'+escape(edition)+'</span><span class="wp-page-number">000 / 000</span>';el.append(foot);}
   measure.append(el);pages.push(el);return{el,grid,rows:0};
  }
  function item(x,stage){const el=doc.createElement('article');el.className='sheet-item wado-question wp-item';
   const labels=[p.showNumber?'問題 '+x.number:'',p.showDifficulty?'難しさ '+x.p.level+' / '+x.p.count+'語':'',p.showId?paperId(x.p):''].filter(Boolean);
   el.innerHTML=(labels.length?'<div class="wp-item-label">'+labels.map(escape).join(' · ')+'</div>':'')+(kind==='hints'?hint(x,stage,true):board(x,kind==='answers')+(kind==='answers'?'<div class="wp-answers">'+words(x)+'</div>':hint(x,p.hint,false)));
   return el;
  }
  function fits(page){const r=page.grid.getBoundingClientRect();return[...page.grid.children].every(n=>{const b=n.getBoundingClientRect();return b.bottom<=r.bottom+1&&b.right<=r.right+1&&n.scrollWidth<=n.clientWidth+1;});}
  try{
   let first=page(grades[0]),width=first.grid.getBoundingClientRect().width;
   if(width<1)throw Error('印刷の大きさを確認できませんでした。画面の読み込み後にもう一度お試しください。');
   const ruler=doc.createElement('div');ruler.style.width='100mm';measure.append(ruler);const pxPerMm=ruler.getBoundingClientRect().width/100;ruler.remove();
   columns=columns||Math.max(1,Math.min(4,Math.floor((width/pxPerMm+4)/(mm+(p.spacing==='normal'?8:4)+4))));
   let retry=true;
   while(retry){retry=false;measure.replaceChildren();pages=[];
    for(const stage of grades){let current=page(stage);current.grid.style.gridTemplateColumns='repeat('+columns+',minmax(0,1fr))';
     for(let i=0;i<items.length;i+=columns){const row=items.slice(i,i+columns).map(x=>item(x,stage));for(const n of row)current.grid.append(n);
      if(!fits(current)){
       for(const n of row)n.remove();
       if(current.rows){current=page(stage);current.grid.style.gridTemplateColumns='repeat('+columns+',minmax(0,1fr))';for(const n of row)current.grid.append(n);}
       else for(const n of row)current.grid.append(n);
       if(!fits(current)){if(columns>1){columns--;retry=true;break;}throw Error('この設定では1問がA4に収まりません。問題か説明文字を小さくするか、載せる項目を減らしてください。');}
      }
      current.rows++;
     }
     if(retry)break;
    }
   }
   const counts=pages.map(el=>el.querySelectorAll('.wp-item').length);pages.forEach((el,i)=>{el.dataset.itemCount=counts[i];const n=el.querySelector('.wp-page-number');if(n)n.textContent=(i+1)+' / '+pages.length;for(const key of ['--wp-board-size','--wp-text-scale','--wp-weight','--wp-padding','--wp-glyph-ratio','--wp-glyph-stroke'])el.style.setProperty(key,measure.style.getPropertyValue(key));});
   host.replaceChildren(...pages);return{pages:pages.length,counts,columns,boardSize:mm};
  }finally{measure.remove();}
 }
 g.WadoPaper={defaults,preferences,flags,sizes,build};
})(typeof window==='undefined'?globalThis:window);
