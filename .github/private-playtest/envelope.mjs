// Private deployment transport. Game files and invite values stay encrypted in Git.
// Only the existing trusted Actions runner derives the recipient private key.
import {createHash,createPrivateKey,createPublicKey,diffieHellman,generateKeyPairSync,hkdfSync,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {resolve,relative,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const INFO=Buffer.from('private-playtest-deployment/v1');
const AAD=Buffer.from('private-playtest/v1/account/3fb1db1d33caddf96fec77fac7d571e6');
const digest=b=>createHash('sha256').update(b).digest('hex');
const pub=k=>createPublicKey(k).export({format:'der',type:'spki'}).toString('base64');
export function recipientPrivate(token){
 if(typeof token!=='string'||token.length<20)throw Error('The existing deployment credential is required.');
 const seed=createHash('sha256').update(INFO).update('\0recipient\0').update(token).digest();
 return createPrivateKey({format:'der',type:'pkcs8',key:Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'),seed])});
}
export const recipientPublic=token=>pub(recipientPrivate(token));
export function seal(bytes,recipient){
 const target=createPublicKey({key:Buffer.from(recipient,'base64'),format:'der',type:'spki'});
 if(target.asymmetricKeyType!=='x25519')throw Error('Invalid deployment public key.');
 const ephemeral=generateKeyPairSync('x25519'),salt=randomBytes(32),iv=randomBytes(12);
 const shared=diffieHellman({privateKey:ephemeral.privateKey,publicKey:target});
 const key=hkdfSync('sha256',shared,salt,INFO,32),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(AAD);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return {ciphertext,manifest:{version:1,recipient,ephemeral:ephemeral.publicKey.export({format:'der',type:'spki'}).toString('base64'),salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),bytes:ciphertext.length,sha256:digest(ciphertext)}};
}
export function open(ciphertext,manifest,token){
 if(manifest.version!==1||manifest.recipient!==recipientPublic(token)||ciphertext.length!==manifest.bytes||digest(ciphertext)!==manifest.sha256)throw Error('Deployment envelope integrity or recipient check failed.');
 const ephemeral=createPublicKey({key:Buffer.from(manifest.ephemeral,'base64'),format:'der',type:'spki'});
 const shared=diffieHellman({privateKey:recipientPrivate(token),publicKey:ephemeral});
 const key=hkdfSync('sha256',shared,Buffer.from(manifest.salt,'base64'),INFO,32),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(manifest.iv,'base64'));decipher.setAAD(AAD);decipher.setAuthTag(Buffer.from(manifest.tag,'base64'));
 return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
}
export function safePath(path){
 if(typeof path!=='string'||path.length>240||path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))return false;
 return /^(site\/|src\/|test\/|scripts\/)/.test(path)||['package.json','package-lock.json','wrangler.jsonc','README.md','.gitignore','.secrets/worker-secrets.json','.secrets/check-code'].includes(path);
}
export function pack(folder){
 const files=[];
 function walk(dir){for(const name of readdirSync(dir).sort()){
  if(['node_modules','.wrangler','.git','dist'].includes(name)||name.startsWith('.dev.vars')||name.startsWith('.env'))continue;
  const path=resolve(dir,name),rel=relative(folder,path).split(sep).join('/'),stat=statSync(path);
  if(stat.isDirectory())walk(path);else if(safePath(rel)){const data=readFileSync(path);files.push({path:rel,data:data.toString('base64')});}
 }}walk(folder);return gzipSync(JSON.stringify({files}),{level:9});
}
export function unpack(bytes,folder){
 const data=JSON.parse(gunzipSync(bytes,{maxOutputLength:64*1024*1024}).toString('utf8'));
 if(!Array.isArray(data.files)||data.files.length>200)throw Error('Invalid private package.');
 const names=new Set();
 for(const f of data.files){if(!safePath(f.path)||names.has(f.path)||typeof f.data!=='string')throw Error('Invalid private package path.');names.add(f.path);const target=resolve(folder,f.path);if(!target.startsWith(resolve(folder)+sep))throw Error('Invalid private package path.');mkdirSync(dirname(target),{recursive:true,mode:0o700});writeFileSync(target,Buffer.from(f.data,'base64'),{mode:0o600});}
 const config=JSON.parse(readFileSync(resolve(folder,'wrangler.jsonc'),'utf8'));
 if(config.name!=='private-playtest'||config.assets?.run_worker_first!==true||config.d1_databases||config.routes)throw Error('Private deployment isolation check failed.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,arg,out]=process.argv.slice(2);
 if(command==='public-key')console.log('PLAYTEST_RECIPIENT='+recipientPublic(process.env.CLOUDFLARE_API_TOKEN));
 else if(command==='seal'){
  const folder=resolve(arg),recipient=readFileSync(out,'utf8').trim(),destination=dirname(fileURLToPath(import.meta.url));
  const result=seal(pack(folder),recipient),chunks=[];
  for(let i=0;i<result.ciphertext.length;i+=262144){const data=result.ciphertext.subarray(i,i+262144),name='payload-'+String(chunks.length).padStart(3,'0')+'.bin';writeFileSync(resolve(destination,name),data);chunks.push({path:name,bytes:data.length,sha256:digest(data)});}
  writeFileSync(resolve(destination,'payload.json'),JSON.stringify({...result.manifest,chunks},null,2)+'\n');console.log(JSON.stringify({encryptedBytes:result.ciphertext.length,chunks:chunks.length}));
 }else if(command==='open'){
  const manifest=JSON.parse(readFileSync(arg,'utf8'));if(!Array.isArray(manifest.chunks)||manifest.chunks.length>100)throw Error('Invalid encrypted package.');
  const chunks=manifest.chunks.map(v=>{if(!/^payload-\d{3}\.bin$/.test(v.path))throw Error('Invalid chunk path.');const bytes=readFileSync(resolve(dirname(arg),v.path));if(bytes.length!==v.bytes||digest(bytes)!==v.sha256)throw Error('Encrypted chunk integrity check failed.');return bytes;});
  unpack(open(Buffer.concat(chunks),manifest,process.env.CLOUDFLARE_API_TOKEN),resolve(out));console.log('Private deployment package verified.');
 }else throw Error('Expected public-key, seal, or open.');
}
