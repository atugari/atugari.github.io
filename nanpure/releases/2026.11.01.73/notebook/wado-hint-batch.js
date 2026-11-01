/* Print-only hint editing. Puzzle and play state are never replaced. */
(function(g){
 'use strict';
 const labels=['なし','大まか','詳しい','より詳しい'],fields=['printHintStage','hintChoice'];
 const snapshot=p=>Object.fromEntries(fields.filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]]));
 const signature=p=>JSON.stringify(fields.map(k=>[Object.hasOwn(p,k),p[k]]));
 function restore(p,value){for(const k of fields){delete p[k];if(Object.hasOwn(value,k))p[k]=value[k];}}
 function set(p,stage){delete p.hintChoice;if(stage==='default')delete p.printHintStage;else p.printHintStage=Number(stage);}
 function resolve(p,fallback){return [0,1,2,3].includes(p.printHintStage)?p.printHintStage:fallback;}
 function integer(value,label,optional=true){if((value===''||value===undefined)&&optional)return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error(label+'は0以上の整数で指定してください。');return n;}
 function plan(items,o,fingerprint){
  if(!['selected','all','page'].includes(o.target))throw Error('変更する範囲を選んでください。');
  const from=integer(o.from,'開始番号'),to=integer(o.to,'終了番号'),limit=integer(o.limit,'問数');
  if(from===0||to===0||from!==null&&to!==null&&from>to)throw Error('問題番号の範囲を確認してください。');
  const allowed=new Set(o.target==='page'?o.page:o.selected),level=Number(o.level||0);
  let matched=items.map((p,i)=>({p,id:fingerprint(p),number:i+1})).filter(x=>(o.target==='all'||allowed.has(x.id))&&(!level||x.p.level===level)&&(from===null||x.number>=from)&&(to===null||x.number<=to));
  if(o.order==='newest')matched.reverse();if(limit!==null)matched=matched.slice(0,limit);
  let assignments=[];
  if(o.mode==='mix'){
   const counts=[1,2,3,0].map(n=>[n,integer(o.counts?.[n]||0,labels[n]+'の問数',false)]),total=counts.reduce((n,x)=>n+x[1],0);
   if(total>matched.length)throw Error('振り分ける問数が対象の'+matched.length+'問を超えています。');
   let offset=0;for(const [stage,n]of counts){assignments.push(...matched.slice(offset,offset+n).map(x=>({...x,stage})));offset+=n;}
  }else{if(!['default','0','1','2','3'].includes(String(o.stage)))throw Error('ヒントの詳しさを選んでください。');assignments=matched.map(x=>({...x,stage:o.stage==='default'?'default':Number(o.stage)}));}
  const changes=assignments.filter(x=>{const p={...x.p};set(p,x.stage);return signature(p)!==signature(x.p);}).map(x=>({id:x.id,number:x.number,stage:x.stage,before:snapshot(x.p)}));
  return{matched:matched.length,assignments:assignments.map(({id,number,stage})=>({id,number,stage})),changes,token:JSON.stringify(items.map(p=>[fingerprint(p),signature(p)]))};
 }
 function create(config){
  const $=id=>document.getElementById('wado-batch-'+id);let preview=null,last=null;
  const controls=['target','level','from','to','order','limit','mode','stage','count-1','count-2','count-3','count-0'];
  function options(){return{target:$('target').value,level:$('level').value,from:$('from').value,to:$('to').value,order:$('order').value,limit:$('limit').value,mode:$('mode').value,stage:$('stage').value,counts:Object.fromEntries([1,2,3,0].map(n=>[n,$('count-'+n).value])),selected:config.selected(),page:config.page()};}
  function describe(result,items){
   const byId=new Map(items.map(p=>[config.fingerprint(p),p]));
   const lines=['対象 '+result.matched+'問 ／ 変更 '+result.changes.length+'問'];
   for(const s of ['default',1,2,3,0]){const a=result.assignments.filter(x=>x.stage===s);if(a.length)lines.push((s==='default'?'用紙の設定':labels[s])+'：'+a.length+'問（第'+a.map(x=>x.number).join('・')+'問）');}
   if(result.assignments.length<result.matched)lines.push('残り'+(result.matched-result.assignments.length)+'問は変更しません。');
   const unavailable=result.assignments.filter(x=>x.stage!=='default'&&x.stage!==0&&!config.hasHint(byId.get(x.id),x.stage));
   if(unavailable.length)lines.push('指定した段階のヒントが未収録：第'+unavailable.map(x=>x.number).join('・')+'問。用紙にも未収録と表示します。');
   return lines.join('\n');
  }
  function refresh(){
   $('uniform').hidden=$('mode').value==='mix';$('mix').hidden=$('mode').value!=='mix';
   try{const data=config.read();preview=plan(data.items,options(),config.fingerprint);$('preview').textContent=describe(preview,data.items);$('apply').disabled=!preview.changes.length;}
   catch(e){preview=null;$('preview').textContent=e.message;$('apply').disabled=true;}
   $('undo').disabled=!last;
  }
  for(const name of controls){$(name).addEventListener('input',refresh);$(name).addEventListener('change',refresh);}
  $('apply').addEventListener('click',async()=>{
   if(!preview?.changes.length)return;const seen=preview,input=options();$('apply').disabled=true;
   try{let undo;const data=await config.mutate(data=>{const now=plan(data.items,input,config.fingerprint);if(now.token!==seen.token||JSON.stringify(now.assignments)!==JSON.stringify(seen.assignments))throw Error('保存内容が変わりました。変更内容をもう一度確認してください。');undo=now.changes.map(x=>{const p=data.items.find(p=>config.fingerprint(p)===x.id);set(p,x.stage);return{id:x.id,before:x.before,after:signature(p)};});});last=undo;config.render(data);$('status').textContent=undo.length+'問の印刷ヒントを変更しました。';}
   catch(e){$('status').textContent='変更できませんでした。'+e.message;refresh();}
  });
  $('undo').addEventListener('click',async()=>{
   if(!last)return;const undo=last;$('undo').disabled=true;
   try{const data=await config.mutate(data=>{for(const x of undo){const p=data.items.find(p=>config.fingerprint(p)===x.id);if(!p||signature(p)!==x.after)throw Error('後から変更された問題があるため取り消せません。');}for(const x of undo)restore(data.items.find(p=>config.fingerprint(p)===x.id),x.before);});last=null;config.render(data);$('status').textContent='直前の一括変更を取り消しました。';}
   catch(e){$('status').textContent=e.message;refresh();}
  });
  return{refresh};
 }
 g.WadoHintBatch={labels,resolve,snapshot,signature,set,restore,plan,create};
})(globalThis);
