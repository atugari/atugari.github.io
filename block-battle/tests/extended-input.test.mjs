import test from'node:test';import assert from'node:assert/strict';import{world}from'./client-world.mjs';
test('old controller settings upgrade without duplicate actions or overriding the new default',()=>{
 const old={l:'b14',r:'b15',d:'b13',u:'b0',z:'b1',x:'b0',c:'b2'},w=world({storage:{bbPad:JSON.stringify(old)}});
 assert.equal(w.run("bindings.pad.x[0]"),'b0');assert.notEqual(w.run("bindings.pad.u[0]"),'b0');
 assert.equal(w.run("new Set(Object.values(bindings.pad).flat()).size===Object.values(bindings.pad).flat().length"),true);
 const defaults=world({storage:{bbPad:JSON.stringify({...old,x:'b3'})}});assert.equal(defaults.run("bindings.pad.x[0]"),'b12');
});
test('pointer hold, simultaneous input, release outside and lost capture stop movement',async()=>{
 const w=world();await w.elements.get('solo').click();const l=w.touchButtons.find(b=>b.dataset.k==='l'),d=w.touchButtons.find(b=>b.dataset.k==='d');
 l.onpointerdown({preventDefault(){},pointerId:1});d.onpointerdown({preventDefault(){},pointerId:2});assert.equal(w.run('!!active.l&&!!active.d'),true);
 w.setTime(10150);w.run('loop(performance.now())');l.onpointerup();assert.equal(w.run('!!active.l'),false);assert.equal(w.run('!!active.d'),true);
 d.onpointercancel();assert.equal(w.run('Object.keys(active).length'),0);l.onpointerdown({preventDefault(){},pointerId:3});l.onlostpointercapture?.();assert.equal(w.run('Object.keys(active).length'),0);
});
test('keyboard repeats pause once, focus loss clears holds, hidden practice pauses and online play continues',async()=>{
 const w=world();await w.elements.get('solo').click();w.key('ArrowLeft');assert.equal(w.run('!!active.l'),true);w.events.blur();assert.equal(w.run('Object.keys(active).length'),0);
 w.key('KeyP');assert.equal(w.run('paused'),true);w.events.keydown({code:'KeyP',repeat:true,target:w.document.activeElement,preventDefault(){}});assert.equal(w.run('paused'),true);w.key('KeyP','keyup');w.key('KeyP');w.key('KeyP','keyup');assert.equal(w.run('paused'),false);
 w.document.hidden=true;w.events.visibilitychange();assert.equal(w.run('paused'),true);w.document.hidden=false;w.elements.get('controlback').click();assert.equal(w.run('paused'),false);
 w.run("session={id:'online'}");w.document.hidden=true;w.events.visibilitychange();w.elements.get('pause').click();assert.equal(w.run('paused'),false);
});
test('sound defaults off; enable, volume changes, disable and suspended-context resume work',async()=>{
 const notes=[],contexts=[];
 class AudioContext{constructor(){this.state='suspended';this.currentTime=0;this.destination={};contexts.push(this)}resume(){this.state='running'}createOscillator(){let o={frequency:{},connect(g){o.gain=g;return g},start(){},stop(){notes.push(o)}};return o}createGain(){let g={gain:{setValueAtTime(v){g.volume=v},exponentialRampToValueAtTime(){}},connect(){return g}};return g}}
 const w=world({globals:{window:{AudioContext}}});await w.elements.get('solo').click();assert.equal(contexts.length,0);w.elements.get('sound').click();assert.equal(contexts.length,1);assert.equal(contexts[0].state,'running');assert.ok(notes.length>0);
 w.document.getElementById('music').value='0';w.document.getElementById('se').value='0';w.run('loop(11000)');assert.equal(notes.at(-1).gain.volume,0);w.elements.get('sound').click();const n=notes.length;w.run("beep(400);loop(12000)");assert.equal(notes.length,n);
 contexts[0].state='suspended';w.elements.get('sound').click();assert.equal(contexts[0].state,'running');assert.equal(contexts.length,1);
});
