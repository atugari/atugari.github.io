#!/usr/bin/env node
/**
 * Read-only audit/planner for the registered Nanpure collection -> vending refill.
 * This command never writes to D1 or the Worker. A stock snapshot is required
 * before it will calculate a 100-item top-up plan.
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { listProfiles } from '../../android/nanpure-vending-worker/prepare-engine.cjs';
import { cataloguePuzzleShape, fingerprintCataloguePuzzle } from '../src/shared/vending-catalogue.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../nanpure/collection');
const require = createRequire(import.meta.url);
require('../../nanpure/collection/compact-codec.js');
const codec = globalThis.NPCollectionCodec;
if (!codec?.restoreRecord) throw new Error('Collection codec could not be loaded.');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const profileKey = p => [p.kind, p.n, p.level, p.complexity ?? 0,
  p.multiShape || '', p.linkedShape || '', '', ''].join(':');
const idOf = n => 'P-' + String(n).padStart(6, '0');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? null; };
const limitConfig = Number(option('--limit-config') || 0);
const stockPath = option('--stock');
const existingPath = option('--existing');
const outputPath = option('--output');
const wantPlan = args.includes('--plan');
if (wantPlan && (!stockPath || !outputPath)) {
  throw new Error('--plan requires both --stock <snapshot.json> and --output <plan.json>.');
}
const stock = stockPath ? JSON.parse(readFileSync(resolve(stockPath), 'utf8')) : null;
const existing = existingPath ? JSON.parse(readFileSync(resolve(existingPath), 'utf8')) : { uids: [], digests: [] };
if (!Array.isArray(existing.uids) || !Array.isArray(existing.digests)) {
  throw new Error('Existing-stock snapshot must contain uids and digests arrays.');
}
if (stock && (!stock.profiles || typeof stock.profiles !== 'object')) {
  throw new Error('Stock snapshot must contain a profiles object keyed by exact vending profile.');
}

const catalogBytes = readFileSync(resolve(root, 'catalog.json'));
const catalog = JSON.parse(catalogBytes);
if (catalog.format !== 2 || !Array.isArray(catalog.configs)) throw new Error('Unsupported collection catalogue.');
const profiles = listProfiles().map(p => ({ ...p, profile: p.key }));
if (profiles.length !== 427) throw new Error('Expected the fixed 427-profile vending catalogue.');
const profileByKey = new Map(profiles.map(p => [p.profile, p]));
const configs = limitConfig > 0 ? catalog.configs.slice(0, limitConfig) : catalog.configs;

const seenUids = new Set(existing.uids);
const seenFingerprints = new Set(existing.digests);
const totals = {
  catalogTotal: catalog.total, configsChecked: 0, matchedConfigs: 0, unmatchedConfigs: 0,
  packsChecked: 0, recordsRead: 0, validRecords: 0, invalidRecords: 0,
  duplicateUids: 0, duplicateFingerprints: 0, uniqueCandidates: 0
};
const shelves = [];
const plan = [];
const errors = [];

for (const config of configs) {
  totals.configsChecked++;
  const profile = profileByKey.get(profileKey(config));
  if (!profile) {
    totals.unmatchedConfigs++;
    shelves.push({ cid: config.cid, profile: null, sourceCount: config.count, candidates: 0, status: 'no-profile-match' });
    continue;
  }
  totals.matchedConfigs++;
  const indexBytes = readFileSync(resolve(root, config.index.file));
  if (indexBytes.byteLength !== config.index.bytes || sha256(indexBytes) !== config.index.sha256) {
    throw new Error('Index integrity check failed: ' + config.cid);
  }
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (index.key !== config.key || !Array.isArray(index.packs) ||
      index.packs.reduce((sum, p) => sum + p.count, 0) !== config.count) {
    throw new Error('Index/catalogue mismatch: ' + config.cid);
  }

  const candidates = [];
  for (const descriptor of index.packs) {
    const encoded = readFileSync(resolve(root, descriptor.file), 'utf8').trim();
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.byteLength !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) {
      throw new Error('Pack integrity check failed: ' + config.cid + '/' + descriptor.file);
    }
    const payload = JSON.parse(gunzipSync(bytes).toString('utf8'));
    const rows = payload?.format === 'np-compact-v1'
      ? payload.records.map(codec.restoreRecord)
      : payload;
    if (!Array.isArray(rows) || rows.length !== descriptor.count) {
      throw new Error('Pack record count mismatch: ' + config.cid + '/' + descriptor.file);
    }
    totals.packsChecked++;
    for (let i = 0; i < rows.length; i++) {
      const record = rows[i];
      const expectedId = idOf(descriptor.first + i);
      if (record?.id !== expectedId || record?.key !== config.key || !record?.puzzle) {
        throw new Error('Pack record identity mismatch: ' + config.cid + '/' + expectedId);
      }
      totals.recordsRead++;
      const raw = record.puzzle;
      const normalized = cataloguePuzzleShape(raw, profile);
      if (!normalized || typeof raw.uid !== 'string') {
        totals.invalidRecords++;
        continue;
      }
      totals.validRecords++;
      if (seenUids.has(raw.uid)) { totals.duplicateUids++; continue; }
      seenUids.add(raw.uid);
      const digest = await fingerprintCataloguePuzzle(normalized);
      if (seenFingerprints.has(digest)) { totals.duplicateFingerprints++; continue; }
      seenFingerprints.add(digest);
      totals.uniqueCandidates++;
      candidates.push({
        digest, uid: raw.uid, id: raw.id, sourceId: record.id,
        sourceConfig: config.cid, sourcePack: descriptor.file,
        puzzle: {
          ...normalized,
          created: normalized.created ?? Date.now(),
          grid: normalized.puzzle.slice(),
          elapsed: 0, completed: false, notes: {},
          verification: {
            method: 'preverified-collection',
            sourceVerification: raw.verification ?? null,
            sourceRating: raw.rating ?? null,
            sourceCollectionRelease: catalog.release,
            sourceConfig: config.cid,
            sourceRecordId: record.id
          }
        }
      });
    }
  }

  const current = stock?.profiles?.[profile.profile];
  if (wantPlan && (!current || !Number.isInteger(current.available) || current.available < 0 ||
      !Number.isInteger(current.target) || current.target < 1 || current.target > 100 ||
      !Number.isInteger(current.waiting) || current.waiting < 0 ||
      !(current.expanded === true || current.expanded === false || current.expanded === 0 || current.expanded === 1))) {
    throw new Error('Stock snapshot lacks available/target/expanded values for ' + profile.profile);
  }
  // Only expanded shelves are raised to 100 by migration 0016. The six
  // original shelves retain their existing configured target.
  const target = wantPlan ? (current.expanded ? 100 : current.target) : null;
  const deficit = wantPlan ? Math.max(0, current.waiting + target - current.available) : 0;
  const selected = wantPlan ? candidates.slice(0, deficit) : [];
  if (wantPlan && selected.length !== deficit) {
    errors.push({ profile: profile.profile, deficit, candidates: candidates.length,
      reason: 'not-enough-unique-compatible-source-records' });
  }
  shelves.push({
    cid: config.cid, profile: profile.profile, sourceCount: config.count,
    candidates: candidates.length, ...(wantPlan ? { current: current.available, waiting: current.waiting, target, expanded: current.expanded, deficit, selected: selected.length } : {})
  });
  if (selected.length) plan.push(...selected.map(item => ({ profile: profile.profile, ...item })));
}

const report = { generatedAt: new Date().toISOString(), sourceRelease: catalog.release,
  readOnly: true, totals, shelves, errors,
  ...(wantPlan ? { expandedTarget: 100, plannedImports: plan.length, plan } : {}) };
const summary = { ...totals, expandedTarget: wantPlan ? 100 : null,
  plannedImports: wantPlan ? plan.length : null, shelvesWithErrors: errors.length };
console.log(JSON.stringify(summary, null, 2));
if (outputPath) writeFileSync(resolve(outputPath), JSON.stringify(report));
if (errors.length) process.exitCode = 2;
