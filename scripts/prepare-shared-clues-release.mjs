import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildTranslationAssets} from './i18n/build-assets.mjs';
import {patchNotebookApp} from './i18n/patch-notebook.mjs';
import {announcementVersion, publicReleases} from './public-release-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const previous = '2026.11.05.100', version = '2026.11.05.101';
const oldBase = `/nanpure/releases/${previous}/`, base = `/nanpure/releases/${version}/`;
const oldRelease = path.join(root, oldBase), release = path.join(root, base);
const source = 'scripts/client-overrides/public/notebook';
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
  throw Error('Unexpected shared-clue release state.');
}
for (const file of walk(oldRelease)) {
  if (hash(fs.readFileSync(file)) !== manifest.files[relative(file)]) throw Error(`Changed release asset ${file}`);
}
fs.cpSync(oldRelease, release, {recursive: true});
const notebook = path.join(release, 'notebook');
const changed = ['app.js', 'mixed-multi.js'];
for (const name of changed) fs.copyFileSync(path.join(root, source, name), path.join(notebook, name));
patchNotebookApp(notebook);
const index = path.join(notebook, 'index.html');
const mixedTag = /(<script id="core-mixed-multi">)[\s\S]*?(<\/script>)/g;
const html = fs.readFileSync(index, 'utf8');
if (Array.from(html.matchAll(mixedTag)).length !== 1) throw Error('Missing mixed multi generation worker.');
fs.writeFileSync(index, html.replace(mixedTag, (_, start, end) => start + read(`${source}/mixed-multi.js`) + end));
for (const file of walk(release).filter(file => /\.(html|js|css)$/.test(file))) {
  const original = fs.readFileSync(file, 'utf8');
  const mapped = original.replaceAll(oldBase, base)
    .replace(/(["'(])\/(notebook|audio|themes)\//g, (_, q, folder) => q + base + folder + '/')
    .replace(/(["'(])\/(site-theme|site-audio|tap-aid|furigana|ui-text)\.(js|css)/g, (_, q, name, ext) => q + base + name + '.' + ext);
  if (mapped !== original) fs.writeFileSync(file, mapped);
}
const shellFile = path.join(release, 'shell/main.js');
const shell = fs.readFileSync(shellFile, 'utf8');
const versionMarker = `var ka="${previous}",wS=`;
if (shell.split(versionMarker).length !== 2) throw Error('Missing shell version marker.');
fs.writeFileSync(shellFile, shell.replace(versionMarker, `var ka="${version}",wS=`));
buildTranslationAssets(notebook, version, {previousDirectory: path.join(oldRelease, 'notebook')});
for (const file of walk(path.join(root, 'nanpure')).filter(file => file.endsWith('.html') && !file.includes('/releases/'))) {
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes(oldBase)) fs.writeFileSync(file, original.replaceAll(oldBase, base));
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
const sources = ['scripts/prepare-shared-clues-release.mjs', 'scripts/check-nanpure-mixed-multi.cjs',
  'scripts/fixtures/multi-v100-save.json', ...changed.map(name => `${source}/${name}`)];
manifest.sharedClues = {sources: Object.fromEntries(sources.map(name => [name, hash(read(name))]))};
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
  if (file.startsWith(release) || name in manifest.files && !name.startsWith('nanpure/releases/')) {
    manifest.files[name] = hash(fs.readFileSync(file));
  }
}
write('nanpure/release-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${version} and refreshed the affected asset and source pins.`);
