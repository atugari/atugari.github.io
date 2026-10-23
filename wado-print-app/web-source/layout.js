(function(g){
 'use strict';
 const defaults={level:2,count:4,batch:10,layout:2,hint:1,spacing:'tight',kanjiSize:'large',kanjiWeight:'bold',previewScale:'page',uiSize:'normal',printText:'normal'};
 const uiScales={normal:1,large:1.25,larger:1.5,largest:2},printScales={normal:1,large:1.25,larger:1.5,largest:1.75};
 function preferences(p){
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('印刷・生成の設定を確認してください。');
  const n={...defaults,...p};
  if(!Number.isInteger(n.level)||n.level<1||n.level>10||![2,3,4].includes(n.count)||![1,5,10,20,50,100].includes(n.batch)||![1,2,4,6,8,9,12].includes(n.layout)||![0,1,2,3].includes(n.hint)||!['normal','tight'].includes(n.spacing)||!['normal','large','largest'].includes(n.kanjiSize)||!['normal','bold','heavy'].includes(n.kanjiWeight)||!['page','width','actual'].includes(n.previewScale)||n.layout>6&&n.hint!==0)throw Error('印刷・生成の設定を確認してください。');
  if(!Object.hasOwn(uiScales,n.uiSize)||!Object.hasOwn(printScales,n.printText))throw Error('文字の大きさの設定を確認してください。');
  return Object.fromEntries(Object.keys(defaults).map(k=>[k,n[k]]));
 }
 function plan(p,kind='questions'){
  const scale=printScales[p.printText]||1,cap=kind==='hints'?(scale>=1.75?3:scale>=1.5?4:scale>1?5:6):(kind==='answers'||p.hint!==0)?(scale>=1.5?2:scale>1?4:12):12;
  const per=Math.min(kind==='questions'?p.layout:6,cap),columns=kind==='hints'?1:per<=2?1:per===9||per===12?3:2,rows=per/columns;
  return{per,columns,rows,tight:kind==='questions'&&(p.spacing==='tight'||per>6),noHints:kind==='questions'&&p.hint===0};
 }
 function fitScale(mode,width,height,naturalWidth,naturalHeight){
  if(mode==='actual')return 1;
  const w=Math.max(1,width)/naturalWidth;
  return Math.max(.05,Math.min(1,w,mode==='page'?Math.max(1,height)/naturalHeight:1));
 }
 function kanjiStroke(weight,size){return({normal:0,bold:.25,heavy:.5}[weight]||0)*({normal:48,large:56,largest:62}[size]||56)/56;}
 g.WadoLayout={defaults,preferences,plan,fitScale,uiScales,printScales,kanjiStroke};
})(typeof window==='undefined'?globalThis:window);
