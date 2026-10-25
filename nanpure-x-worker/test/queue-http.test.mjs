import test from 'node:test';
import assert from 'node:assert/strict';
import {send} from '../../scripts/x-four/queue_http.mjs';
const url='https://nanpure-x-scheduler.puzzle-hub-4826.workers.dev';
test('queue transport sends authentication only to the fixed owner API',async()=>{let called=0;const r=await send({url:url+'/prepare',authorization:'Bearer unit-test',body:{date:'2026-10-26'}},async(u,init)=>{called++;assert.equal(u,url+'/prepare');assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer unit-test');assert.deepEqual(JSON.parse(init.body),{date:'2026-10-26'});return Response.json({ok:true})});assert.equal(called,1);assert.equal(r.status,200)});
test('queue transport rejects alternate hosts, credential URLs and unknown routes',async()=>{for(const u of ['https://other.invalid/state',url+'/publish',url+'/state?token=secret','https://name:secret@nanpure-x-scheduler.puzzle-hub-4826.workers.dev/state'])await assert.rejects(send({url:u,authorization:'Bearer unit-test'},()=>assert.fail('must not send')))});
test('queue transport keeps HTTP status without printing non-JSON error pages',async()=>{const r=await send({url:url+'/state',authorization:'Bearer unit-test'},async()=>new Response('provider HTML',{status:403}));assert.deepEqual(r,{status:403,data:null})});
