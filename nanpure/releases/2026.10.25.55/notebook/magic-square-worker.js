'use strict';
importScripts('magic-square-engine.js');
onmessage=({data})=>{
 try{
  const {n,blankStyle,seed,count}=data||{};
  if(!Number.isInteger(count)||count<1||count>10||!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('MAGIC_COUNT');
  for(let index=0;index<count;index++){
   const puzzle=NPMagicSquare.generate({n,blankStyle,seed:(seed+Math.imul(index,0x9e3779b9))>>>0});
   postMessage({type:'puzzle',puzzle,index,total:count});
  }
  postMessage({type:'done'});
 }catch{postMessage({type:'error'});}
};
