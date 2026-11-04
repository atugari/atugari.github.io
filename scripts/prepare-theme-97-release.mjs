import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {announcementVersion, publicReleases} from './public-release-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const previous = '2026.11.04.96', version = '2026.11.04.97';
const oldBase = `/nanpure/releases/${previous}/`, base = `/nanpure/releases/${version}/`;
const oldRelease = path.join(root, oldBase), release = path.join(root, base);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const write = (name, value) => fs.writeFileSync(path.join(root, name), value);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const relative = file => path.relative(root, file);
const manifest = JSON.parse(read('nanpure/release-manifest.json'));
const notes = JSON.parse(read('scripts/release-notes.json'));
if (manifest.version !== previous || notes[0]?.version !== version || fs.existsSync(release)) {
  throw Error('Unexpected theme release state.');
}
for (const file of walk(oldRelease)) {
  if (hash(fs.readFileSync(file)) !== manifest.files[relative(file)]) throw Error(`Changed release asset ${file}`);
}
fs.cpSync(oldRelease, release, {recursive: true});
for (const name of ['home-layout.css', 'themes/accessible.css', 'notebook/pattern.css']) {
  fs.copyFileSync(path.join(root, 'scripts/client-overrides/public', name), path.join(release, name));
}
const runtime = path.join(release, 'site-theme.js');
const oldRuntime = fs.readFileSync(runtime, 'utf8');
const bootstrap = oldRuntime.indexOf('\n\n(()=>{const base=');
if (bootstrap < 0 || !oldRuntime.slice(bootstrap).includes('site-layout.js')) throw Error('Missing layout bootstrap.');
fs.writeFileSync(runtime, read('scripts/client-overrides/public/site-theme.js') + oldRuntime.slice(bootstrap));

const notebook = path.join(release, 'notebook/app.js');
const oldNotebook = fs.readFileSync(notebook, 'utf8');
const illustration = /<span class="pattern-launch-icon" aria-hidden="true"><svg[^]*?<\/svg><\/span>/g;
if (Array.from(oldNotebook.matchAll(illustration)).length !== 1) throw Error('Unexpected pattern illustration markup.');
fs.writeFileSync(notebook, oldNotebook.replace(illustration, ''));
for (const file of walk(release).filter(file => /\.(html|js|css)$/.test(file))) {
  const old = fs.readFileSync(file, 'utf8');
  if (old.includes(oldBase)) fs.writeFileSync(file, old.replaceAll(oldBase, base));
}
const shellFile = path.join(release, 'shell/main.js');
const shell = fs.readFileSync(shellFile, 'utf8');
const versionMarker = `var ka="${previous}",wS=`;
if (shell.split(versionMarker).length !== 2) throw Error('Missing shell version marker.');
fs.writeFileSync(shellFile, shell.replace(versionMarker, `var ka="${version}",wS=`));
buildTranslationAssets(path.join(release, 'notebook'), version, {previousDirectory: path.join(oldRelease, 'notebook')});

for (const file of walk(path.join(root, 'nanpure')).filter(file => file.endsWith('.html') && !file.includes('/releases/'))) {
  const old = fs.readFileSync(file, 'utf8');
  if (old.includes(oldBase)) fs.writeFileSync(file, old.replaceAll(oldBase, base));
}
const audio = path.join(root, 'nanpure-audio', version);
fs.cpSync(path.join(root, 'nanpure-audio', previous), audio, {recursive: true});
const audioIndex = path.join(audio, 'index.json');
fs.writeFileSync(audioIndex, JSON.stringify({...JSON.parse(fs.readFileSync(audioIndex, 'utf8')), version}, null, 2) + '\n');

const overrides = path.join(root, 'scripts/client-overrides');
const info = {
  ...JSON.parse(read('nanpure/version.json')), version, announcementVersion: announcementVersion(notes),
  clientOverridesSha256: hash(walk(overrides).sort().map(file => path.relative(overrides, file) + '\0' + fs.readFileSync(file)).join('\0')),
  baseRelease: previous
};
const sources = ['scripts/prepare-theme-97-release.mjs', 'scripts/client-overrides/public/home-layout.css',
  'scripts/client-overrides/public/site-theme.js', 'scripts/client-overrides/public/themes/accessible.css',
  'scripts/client-overrides/public/notebook/app.js', 'scripts/client-overrides/public/notebook/pattern.css'];
manifest.themeContinuity = {sources: Object.fromEntries(sources.map(name => [name, hash(read(name))]))};
for (const record of Object.values(manifest)) {
  for (const file of Object.keys(record?.sources || {})) {
    if (fs.existsSync(path.join(root, file))) record.sources[file] = hash(read(file));
  }
}
Object.assign(manifest, info, {base});
write('nanpure/version.json', JSON.stringify(info));
write('nanpure-version.json', JSON.stringify({version}));
write('nanpure/releases.json', JSON.stringify({version, announcementVersion: info.announcementVersion, releases: publicReleases(notes)}, null, 2) + '\n');
for (const file of walk(path.join(root, 'nanpure'))) {
  const name = relative(file);
  if (name in manifest.files || file.startsWith(release) || name.startsWith('nanpure/assets/')) {
    manifest.files[name] = hash(fs.readFileSync(file));
  }
}
write('nanpure/release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${version} and refreshed the affected asset and source pins.`);
