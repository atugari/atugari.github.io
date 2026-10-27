import test from 'node:test';import assert from 'node:assert/strict';import{world}from'./client-world.mjs';
test('practice and resume focus the play area, with no manual scrolling',async()=>{
 const w=world();await w.elements.get('solo').click();assert.equal(w.document.activeElement.id,'play');assert.equal(w.scrolls.at(-1).id,'play');
 const x=w.run('piece.x');w.key('ArrowLeft');w.key('ArrowLeft','keyup');assert.equal(w.run('piece.x'),x-1);
 w.elements.get('controlopen').click();assert.equal(w.run('paused'),true);assert.equal(w.scrolls.at(-1).id,'controls');
 w.elements.get('controlback').click();assert.equal(w.run('paused'),false);assert.equal(w.document.activeElement.id,'play');assert.equal(w.scrolls.at(-1).id,'play');
});
test('keyboard remapping swaps conflicting actions, persists, and cancels safely',async()=>{
 const w=world();await w.elements.get('solo').click();w.run('spawn(5)');w.key('ArrowUp');w.key('ArrowUp','keyup');assert.equal(w.run('piece.r'),1);assert.equal(w.run('score'),0);
 w.elements.get('key-x').click();const before=w.run('JSON.stringify([score,piece])');w.key('ArrowUp');assert.equal(w.run('capture'),'');assert.equal(w.run('JSON.stringify([score,piece])'),before);assert.equal(w.storage.bbBindkey.includes('ArrowUp'),true);
 w.elements.get('pause').click();w.key('ArrowUp');w.key('ArrowUp','keyup');assert.ok(w.run('score')>0);assert.equal(w.run('board.some(r=>r.some(Boolean))'),true);
 const loaded=world({storage:w.storage});assert.equal(loaded.run("bindings.key.x[0]"),'ArrowUp');assert.equal(loaded.run("bindings.key.u[0]"),'Space');
 loaded.elements.get('key-l').click();loaded.key('Escape');assert.equal(loaded.run('capture'),'');assert.equal(loaded.run("bindings.key.l[0]"),'ArrowLeft');
 loaded.elements.get('keyreset').click();assert.equal(loaded.run("bindings.key.u[0]"),'ArrowUp');assert.equal(loaded.run("bindings.key.x[0]"),'Space');
 const input={tagName:'INPUT'};loaded.run('running=true');const old=loaded.run('piece.x');loaded.key('ArrowLeft','keydown',input);assert.equal(loaded.run('piece.x'),old);
});
test('controller up drops once; remapping waits for release and has no hidden stick fallback',async()=>{
 const pad={buttons:Array.from({length:16},()=>({pressed:false})),axes:[0,0]},w=world({pads:[pad]});await w.elements.get('solo').click();
 pad.buttons[12].pressed=true;w.run('gamepad(10000)');const score=w.run('score');assert.ok(score>0);w.run('gamepad(10020)');assert.equal(w.run('score'),score);pad.buttons[12].pressed=false;w.run('gamepad(10040)');
 w.elements.get('pad-x').click();w.run('gamepad(10060)');pad.buttons[0].pressed=true;w.run('gamepad(10080)');assert.equal(w.run("bindings.pad.x[0]"),'b0');assert.equal(w.run("bindings.pad.u[0]"),'b12');assert.equal(w.run('score'),score);assert.ok(w.storage.bbBindpad);
 w.elements.get('pause').click();w.run('gamepad(10100)');assert.equal(w.run('score'),score);pad.buttons[0].pressed=false;w.run('gamepad(10120)');pad.buttons[0].pressed=true;w.run('gamepad(10140)');assert.ok(w.run('score')>score);
 pad.buttons[0].pressed=false;w.run('gamepad(10160)');w.run("assign('pad','l','b4')");w.run('gamepad(10180)');pad.axes[0]=-1;const x=w.run('piece.x');w.run('gamepad(10200)');assert.equal(w.run('piece.x'),x);
 const loaded=world({storage:w.storage});assert.equal(loaded.run("bindings.pad.x[0]"),'b0');loaded.elements.get('padreset').click();assert.equal(loaded.run("bindings.pad.x[0]"),'b12');
});
