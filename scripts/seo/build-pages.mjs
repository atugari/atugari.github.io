// Rebuild stable search pages independently of the immutable game releases.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildSearchPages} from './build-seo.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifestPath=path.join(repo,'nanpure/release-manifest.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Refuse to conceal an unrelated modification by recalculating every file hash.
for(const [name,expected] of Object.entries(manifest.files)){
  if(hash(fs.readFileSync(path.join(repo,name)))!==expected)throw Error('Existing release file changed: '+name);
}
const files=buildSearchPages(repo,manifest.version,manifest.base);
for(const file of files)manifest.files[path.relative(repo,file)]=hash(fs.readFileSync(file));
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log('Built',files.length,'stable search files; game release',manifest.version,'preserved');
