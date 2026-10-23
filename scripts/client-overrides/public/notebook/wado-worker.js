'use strict';
importScripts('wado-engine.js');
const ready=fetch('wado-data.json').then(r=>{if(!r.ok)throw Error('辞書を読み込めませんでした。');return r.json();}).then(data=>NPWado.create(data));
onmessage=async({data})=>{try{const engine=await ready;if(!Number.isInteger(data.batch)||data.batch<1||data.batch>20)throw Error('問題数を確認してください。');const seen=new Set(data.seen),random=crypto.getRandomValues(new Uint32Array(data.batch));for(let i=0;i<data.batch;i++){const p=engine.generate({level:data.level,count:data.wordCount,seed:random[i],seen:[...seen]});seen.add(engine.fingerprint(p));postMessage({type:'puzzle',puzzle:p,index:i+1,total:data.batch});}postMessage({type:'done'});}catch(error){postMessage({type:'error',message:error.message||'生成を続けられませんでした。'});}};
