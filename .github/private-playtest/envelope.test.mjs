import test from 'node:test';
import assert from 'node:assert/strict';
import {recipientPublic,seal,open,safePath} from './envelope.mjs';
test('only the existing deployment credential opens an authenticated encrypted package',()=>{
 const token='test-only-credential-for-private-deployment',bytes=Buffer.from('private files and invite settings'),sealed=seal(bytes,recipientPublic(token));
 assert.deepEqual(open(sealed.ciphertext,sealed.manifest,token),bytes);
 assert.equal(sealed.ciphertext.includes(bytes),false);
 assert.throws(()=>open(sealed.ciphertext,sealed.manifest,token+'wrong'));
 const changed=Buffer.from(sealed.ciphertext);changed[0]^=1;assert.throws(()=>open(changed,sealed.manifest,token));
 assert.throws(()=>open(sealed.ciphertext,{...sealed.manifest,tag:Buffer.alloc(16).toString('base64')},token));
});
test('package extraction cannot escape the private folder or replace unrelated server configuration',()=>{
 for(const path of ['/etc/passwd','../outside','src/../../outside','site/./foo','site/../foo','site\\foo','site//foo','other-project/index.js','.secrets/招待コード.json'])assert.equal(safePath(path),false,path);
 for(const path of ['site/arena/index.html','src/index.js','wrangler.jsonc','.secrets/worker-secrets.json'])assert.equal(safePath(path),true,path);
});
