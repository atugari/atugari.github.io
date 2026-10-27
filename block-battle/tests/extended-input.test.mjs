import test from'node:test';import assert from'node:assert/strict';import{world}from'./client-world.mjs';
test('old controller settings upgrade without duplicate actions or overriding the new default',()=>{
 const old={l:'b14',r:'b15',d:'b13',u:'b0',z:'b1',x:'b0',c:'b2'},w=world({storage:{bbPad:JSON.stringify(old)}});
 assert.equal(w.run("bindings.pad.x[0]"),'b0');assert.notEqual(w.run("bindings.pad.u[0]"),'b0');
 assert.equal(w.run("new Set(Object.values(bindings.pad).flat()).size===Object.values(bindings.pad).flat().length"),true);
 const defaults=world({storage:{bbPad:JSON.stringify({...old,x:'b3'})}});assert.equal(defaults.run("bindings.pad.x[0]"),'b12');
});
test('pointer hold, simultaneous input, release outside and lost capture stop movement',async()=>{
 const w=world();await w.elements.get('solo').click();const l=w.touchButtons.find(b=>b.dataset.k==='l'),d=w.touchButtons.find(b=>b.dataset.k==='d');
 l.onpointerdown({preventDefault(){},pointerId:1});d.onpointerdown({preventDefault(){},pointerId:2});assert.equal(w.run('!!active.touch1&&!!active.touch2'),true);
 w.setTime(10150);w.run('loop(performance.now())');l.onpointerup({pointerId:1});assert.equal(w.run('!!active.touch1'),false);assert.equal(w.run('!!active.touch2'),true);
 d.onpointercancel({pointerId:2});assert.equal(w.run('Object.keys(active).length'),0);l.onpointerdown({preventDefault(){},pointerId:3});l.onlostpointercapture?.({pointerId:3});assert.equal(w.run('Object.keys(active).length'),0);
});
test('keyboard repeats pause once, focus loss clears holds, hidden practice pauses and online play continues',async()=>{
 const w=world();await w.elements.get('solo').click();w.key('ArrowLeft');assert.equal(w.run('!!active.l'),true);w.events.blur();assert.equal(w.run('Object.keys(active).length'),0);
 w.key('KeyP');assert.equal(w.run('paused'),true);w.events.keydown({code:'KeyP',repeat:true,target:w.document.activeElement,preventDefault(){}});assert.equal(w.run('paused'),true);w.key('KeyP','keyup');w.key('KeyP');w.key('KeyP','keyup');assert.equal(w.run('paused'),false);
 w.document.hidden=true;w.events.visibilitychange();assert.equal(w.run('paused'),true);w.document.hidden=false;w.elements.get('controlback').click();assert.equal(w.run('paused'),false);
 w.run("session={id:'online'}");w.document.hidden=true;w.events.visibilitychange();w.elements.get('pause').click();assert.equal(w.run('paused'),false);
});
test('sound starts on the first gesture, persists mute, controls volume and resumes after interruption',async()=>{
 const notes=[],contexts=[];let inClick=false;
 class AudioContext{constructor(){assert.equal(inClick,true,'audio creation must occur before the async practice handler yields');this.state='suspended';this.currentTime=0;this.destination={};contexts.push(this)}resume(){this.state='running';return Promise.resolve()}suspend(){this.state='suspended';return Promise.resolve()}createOscillator(){let o={frequency:{},connect(g){o.gain=g;return g},start(){},stop(){notes.push(o)}};return o}createGain(){let g={gain:{setValueAtTime(v){g.volume=v},exponentialRampToValueAtTime(){}},connect(){return g}};return g}}
 const w=world({globals:{window:{AudioContext}}});assert.equal(contexts.length,0);inClick=true;const started=w.elements.get('solo').click();inClick=false;await started;await Promise.resolve();assert.equal(contexts.length,1);assert.equal(contexts[0].state,'running');assert.ok(notes.length>0);assert.equal(w.elements.get('sound')['aria-pressed'],'true');
 w.document.getElementById('music').value='0';w.document.getElementById('se').value='0';const zero=notes.length;w.run('loop(11000)');assert.equal(notes.length,zero);w.elements.get('sound').click();assert.equal(w.storage.bbSound,'off');const n=notes.length;w.run("beep(400);loop(12000)");assert.equal(notes.length,n);assert.equal(contexts[0].state,'suspended');
 const muted=world({storage:w.storage,globals:{window:{AudioContext}}});await muted.elements.get('solo').click();assert.equal(contexts.length,1);assert.equal(muted.elements.get('sound').textContent,'音 OFF');
 w.elements.get('sound').click();await Promise.resolve();assert.equal(contexts[0].state,'running');assert.equal(contexts.length,1);assert.equal(w.storage.bbSound,'on');contexts[0].state='suspended';w.run("act('l')");await Promise.resolve();assert.equal(contexts[0].state,'running');
});
test('each rapid or overlapping touch drops exactly once, including late lost-capture and generated clicks',async()=>{
 const w=world();await w.elements.get('solo').click();const x=w.touchButtons.find(b=>b.dataset.k==='x');
 w.run('reset(1);running=true;let placements=0;const originalLock=lock;lock=()=>{placements++;originalLock();board=Array.from({length:H},()=>Array(W).fill(0));dead=false;running=true}');
 const event=id=>({preventDefault(){},pointerId:id});
 for(let i=0;i<100;i++){
  x.onpointerdown(event(i*2));x.onpointerdown(event(i*2+1));x.onpointerup(event(i*2));x.onlostpointercapture(event(i*2));
  x.onclick({detail:1,pointerType:'touch'});x.onclick({detail:0,pointerType:'touch'});x.onpointerup(event(i*2+1));
 }
 assert.equal(w.run('placements'),200);assert.equal(w.run('Object.keys(active).length'),0);
 x.onpointerdown(event(300));w.run('loop(15000)');assert.equal(w.run('placements'),201,'holding hard drop must not auto-drop the next piece');
 x.onclick({detail:0,pointerType:''});assert.equal(w.run('placements'),202,'assistive activation still works');
});
test('stale pointer release cannot cancel a newer hold; soft drop has its own fast repeat',async()=>{
 const w=world();await w.elements.get('solo').click();const d=w.touchButtons.find(b=>b.dataset.k==='d');
 const event=pointerId=>({pointerId,preventDefault(){}});d.onpointerdown(event(1));d.onpointerdown(event(2));d.onpointerup(event(1));d.onlostpointercapture(event(1));assert.equal(w.run('!!active.touch2'),true);
 d.onpointerup(event(2));w.run('reset(1);running=true;das=300;arr=120');const y=w.run('piece.y');d.onpointerdown(event(3));for(let t=10020;t<=10160;t+=20){w.setTime(t);w.run('loop(performance.now())')};assert.equal(w.run('piece.y'),y+9);d.onpointerup(event(3));assert.equal(w.run('Object.keys(active).length'),0);
});
