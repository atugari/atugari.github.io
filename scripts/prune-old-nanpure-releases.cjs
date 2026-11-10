'use strict';
// Prune old Nanpure releases out of the assembled Pages artifact (_site).
//
// Invoked from scripts/enhance-nanpure.py while the site is assembled (the
// workflow file itself cannot be changed through the API, so the hook lives
// here instead). Only the assembled _site is pruned, never the repository.
//
// Why this exists: every Nanpure release is a full copy (~30MB) and the repo
// keeps all of them, so the assembled site grew past 2GB and the GitHub Pages
// deployment started timing out ("Timeout reached, aborting!"). Pages sites
// are meant to stay around 1GB, so only the newest releases plus the ones
// the site and its checks still need are published.
//
// Keep set:
//  - the 10 newest releases (the current one is generated during the build)
//  - pinned older releases that are still referenced somewhere:
//      2026.10.23.43  CI i18n-delta check baseline (and export-nanpure's
//                      previousDirectory for translation assets)
//      2026.10.23.44  CI wado check baseline (old engine + data)
//      2026.10.27.62  CI wado-review check baseline
//      2026.10.27.65  collection player links to its wado/shirupure/
//                      tenbin/crossword pages
//      2026.11.01.72  CI pattern-math check baseline
//      2026.11.02.83  share.html loads its notebook/i18n files
//      2026.11.03.85  secondary-theme.css and the learn page load its
//                      theme files and logical-hints.js
// The release manifest (nanpure/release-manifest.json) lists only kept
// releases, so the integrity check stays consistent with the pruned site.
// Old releases stay in the repository and in Git history; nothing here
// deletes them from the repo, only from the published artifact.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const KEEP_LATEST = 10;
const PINNED = new Set([
  '2026.10.23.43',
  '2026.10.23.44',
  '2026.10.27.62',
  '2026.10.27.65',
  '2026.11.01.72',
  '2026.11.02.83',
  '2026.11.03.85',
]);

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function listVersions(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(e.name))
    .map((e) => e.name)
    .sort(compareVersions);
}

function removeDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
  const root = path.resolve(process.argv[2] || '_site');
  const releasesDir = path.join(root, 'nanpure', 'releases');
  const audioDir = path.join(root, 'nanpure-audio');
  const versions = listVersions(releasesDir);
  assert(versions.length > 0, 'No Nanpure releases found in ' + releasesDir);
  const latest = new Set(versions.slice(-KEEP_LATEST));
  const keep = new Set([...latest, ...PINNED]);
  for (const pinned of PINNED) {
    assert(keep.has(pinned) && versions.includes(pinned),
      'Pinned release is missing from the assembled site: ' + pinned);
  }
  const removed = versions.filter((v) => !keep.has(v));
  for (const version of removed) {
    removeDir(path.join(releasesDir, version));
    removeDir(path.join(audioDir, version));
  }
  console.log(`Pruned Nanpure releases in ${root}: kept ${keep.size} versions `
    + `(${[...keep].sort(compareVersions).join(', ')}), `
    + `removed ${removed.length} old versions.`);
}

main();
