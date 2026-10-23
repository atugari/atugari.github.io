(function(g){
 'use strict';
 const defaults={level:2,count:4,batch:10,layout:2,hint:1,spacing:'tight',kanjiSize:'large',kanjiWeight:'bold',previewScale:'page'};
 function preferences(p){
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('印刷・生成の設定を確認してください。');
  const n={...defaults,...p};
  if(!Number.isInteger(n.level)||n.level<1||n.level>10||![2,3,4].includes(n.count)||![1,5,10,20,50,100].includes(n.batch)||![1,2,4,6,8,9,12].includes(n.layout)||![0,1,2,3].includes(n.hint)||!['normal','tight'].includes(n.spacing)||!['normal','large','largest'].includes(n.kanjiSize)||!['normal','bold','heavy'].includes(n.kanjiWeight)||!['page','width','actual'].includes(n.previewScale)||n.layout>6&&n.hint!==0)throw Error('印刷・生成の設定を確認してください。');
  return Object.fromEntries(Object.keys(defaults).map(k=>[k,n[k]]));
 }
 function plan(p,kind='questions'){
  const per=kind==='questions'?p.layout:6,columns=per<=2?1:per===9||per===12?3:2,rows=per/columns;
  return{per,columns,rows,tight:kind==='questions'&&(p.spacing==='tight'||per>6),noHints:kind==='questions'&&p.hint===0};
 }
 function fitScale(mode,width,height,naturalWidth,naturalHeight){
  if(mode==='actual')return 1;
  const w=Math.max(1,width)/naturalWidth;
  return Math.max(.05,Math.min(1,w,mode==='page'?Math.max(1,height)/naturalHeight:1));
 }
 g.WadoLayout={defaults,preferences,plan,fitScale};
})(typeof window==='undefined'?globalThis:window);
