'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

module.exports=async function checkReplay({all,A,root,domPath}){
 const {StepReplay}=await import('../nanpure/learn/replay.mjs');
 const record=all.find(p=>p.routes.some(r=>r.status==='solved'&&r.steps.some(s=>s.cuts.length))),route=record.routes.find(r=>r.status==='solved'),replay=new StepReplay(route);
 assert.equal(replay.applied,0);replay.flip();assert.equal(replay.applied,1);replay.flip();assert.equal(replay.applied,0);
 replay.seek(route.steps.length);assert.ok(replay.done);assert.equal(replay.advance(),false);assert.equal(replay.applied,route.steps.length);
 replay.previous();assert.equal(replay.at,route.steps.length-1);assert.equal(replay.after,false);
 for(const at of [7,2,route.steps.length-1,0]){replay.seek(at);assert.equal(replay.applied,at);replay.flip();assert.equal(replay.applied,at+1);}
 replay.seek(-9);assert.equal(replay.at,0);replay.seek(Infinity);assert.ok(replay.done);replay.seek('bad');assert.equal(replay.at,0);
 let advances=0;while(replay.advance())advances++;assert.equal(advances,route.steps.length*2);assert.ok(replay.done);

 // Export the real route through a recorder double. Every subtitle must fit.
 const texts=[],ctx={font:'',measureText(text){return{width:Array.from(text).length*Number(this.font.match(/(\d+)px/)?.[1]||48)};},fillText(text,x,y){texts.push({text,x,y,font:this.font});}};
 for(const name of ['save','restore','fillRect','beginPath','moveTo','lineTo','stroke'])ctx[name]=()=>{};
 let stopped=false;
 const canvas={width:0,height:0,getContext:()=>ctx,captureStream:()=>({getTracks:()=>[{stop(){stopped=true;}}]})};
 class Recorder{
  static isTypeSupported(){return true;}
  constructor(){this.state='inactive';}
  start(){this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['video'])});this.onstop();});}
 }
 const context={NPLabAnalyzer:A,document:{createElement:()=>canvas,documentElement:{}},MediaRecorder:Recorder,Blob,queueMicrotask,setTimeout(fn){queueMicrotask(fn);return 1;},clearTimeout(){}};
 context.globalThis=context;vm.runInNewContext(fs.readFileSync(path.join(root,'nanpure/learn/render.js'),'utf8'),context);
 const blob=await context.NPLabRender.video(record,route,{stepMs:1,titleMs:0});assert.ok(blob.size);assert.equal(canvas.width,1080);assert.ok(stopped);
 const captions=texts.filter(t=>t.x===36);assert.ok(captions.length>route.steps.length);assert.ok(captions.every(t=>t.font==='48px system-ui,sans-serif'&&t.y<canvas.height-20));
 const long='長い説明を省略せず最後の文字まで表示する。'.repeat(40),parts=context.NPLabRender.lines(ctx,long,1008);assert.equal(parts.join(''),long);assert.ok(parts.length>4);
 const controller=new AbortController();controller.abort();stopped=false;await assert.rejects(context.NPLabRender.video(record,route,{signal:controller.signal}),/中断/);assert.ok(stopped);

 if(domPath){
  const {parseHTML}=require(domPath),themeSource=fs.readFileSync(path.join(root,'nanpure/releases/2026.11.03.85/site-theme.js'),'utf8');
  for(const page of ['nanpure/learn/index.html','nanpure/collection/index.html']){
   const html=fs.readFileSync(path.join(root,page),'utf8'),{document}=parseHTML(html),listeners={},saved=new Map([['np-site-theme-v1',JSON.stringify({theme:'lounge'})]]);
   assert.ok(document.querySelector('script[src$="site-theme.js"]'));assert.ok(document.querySelector('link[href*="secondary-theme.css"]'));
   const window={addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent(){}};
   vm.runInNewContext(themeSource,{window,parent:window,document,localStorage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},Event:class{constructor(type){this.type=type;}},requestAnimationFrame(){}});
   assert.equal(document.documentElement.dataset.siteTheme,'lounge');window.NPSiteTheme.set('color');assert.equal(JSON.parse(saved.get('np-site-theme-v1')).theme,'color');assert.equal(document.documentElement.dataset.siteTheme,'color');
   saved.set('np-site-theme-v1',JSON.stringify({theme:'notebook'}));listeners.storage({key:'np-site-theme-v1'});assert.equal(document.documentElement.dataset.siteTheme,'notebook');assert.equal(window.NPSiteTheme.set('unknown'),false);
  }
 }
};
