const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const buildRoot=path.resolve(process.argv[2]||'.');
const manifest=JSON.parse(fs.readFileSync('nanpure/release-manifest.json')),meta=JSON.parse(fs.readFileSync('nanpure/version.json'));
assert.equal(manifest.version,meta.version);assert.equal(JSON.parse(fs.readFileSync('nanpure-version.json')).version,meta.version);
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [file,pin] of Object.entries(manifest.files)){const built=path.join(buildRoot,file);assert(fs.existsSync(built),'Missing release asset: '+file);assert.equal(digest(built),pin,'Changed release asset: '+file);}
for(const entry of Object.values(manifest))if(entry?.sources)for(const [file,pin] of Object.entries(entry.sources))assert.equal(digest(file),pin,'Changed source: '+file);
assert.equal(digest(path.join('nanpure/releases',meta.version,'notebook/generation-assist.js')),digest('scripts/client-overrides/public/notebook/generation-assist.js'));
console.log('PASS release integrity: '+Object.keys(manifest.files).length+' pinned assets, recorded sources and active assistance client');
