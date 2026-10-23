// Validate persisted/imported key settings without trusting storage contents.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module'),{parseHTML}=require(process.argv[2]||'linkedom');
const source=fs.readFileSync('scripts/client-overrides/public/key-bindings.js','utf8');
function load(raw){const {window:w}=parseHTML('<html><head></head><body></body></html>');w.localStorage={getItem:()=>raw};w.window=w;vm.runInContext(source,vm.createContext(w));return w.NPKeyBindings;}
const api=load('invalid JSON'),binding={code:'KeyQ',shift:false,ctrl:false,alt:false};
assert(api,'Corrupt local storage cannot prevent keyboard startup');
const value={version:1,bindings:{'digit-100':[binding],undo:[{...binding,code:'KeyZ',ctrl:true}],up:[{...binding,code:'KeyW',shift:true}]}};
const result=api.validate(value);assert.equal(result['digit-100'][0].code,'KeyQ');binding.code='F5';assert.equal(result['digit-100'][0].code,'KeyQ','Validated settings do not retain mutable imported references');
for(const invalid of [null,{},[],{version:2,bindings:{}},{version:1,bindings:[]},{version:1,bindings:{unknown:[]}},{version:1,bindings:{'digit-101':[]}},{version:1,bindings:{up:'Q'}},{version:1,bindings:{up:[{code:'KeyQ'}]}},{version:1,bindings:{up:[{...binding,code:'Escape'}]}},{version:1,bindings:{up:[{...binding,code:'Tab'}]}},{version:1,bindings:{up:[binding]}},{version:1,bindings:{up:[{...binding,code:'KeyR',ctrl:true}]}},{version:1,bindings:{up:[{...binding,code:'KeyQ'}],down:[{...binding,code:'KeyQ'}]}}])assert.throws(()=>api.validate(invalid));
const backup=fs.readFileSync('scripts/client-overrides/lib/backup.ts','utf8'),ctx=vm.createContext({console,JSON,Number,Object,Array,Error});
vm.runInContext(stripTypeScriptTypes(backup).replace(/^export /gm,'')+'\nthis.validate=validateBackup;',ctx);
const legacy={format:'nanpure-website-backup-v1',data:{'np-daily-settings-v1':'{}'}},current={format:'nanpure-website-backup-v1',data:{'np-key-bindings-v1':JSON.stringify({version:1,bindings:result})}};
assert.equal(ctx.validate(legacy),legacy);assert.equal(ctx.validate(current),current);assert.throws(()=>ctx.validate({...current,data:{'np-key-bindings-v1':'invalid JSON'}}));
console.log('PASS key settings: corrupt storage, schema bounds, reserved/browser keys, duplicate assignments, modifiers, large digits, isolated imports and legacy/current backups');
