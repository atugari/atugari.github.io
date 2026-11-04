#!/usr/bin/env node
// Execute the actual module entrypoints with synthetic bindings. No source,
// body text, credential, SQL, URL, or exception diagnostic is logged.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = 'https://nanpure-vending-pilot.puzzle-hub-4826.workers.dev';
const ownerHash = createHash('sha256').update('a'.repeat(64)).digest('hex');
const body = JSON.stringify({ action: 'enroll', enrollmentKey: '1'.repeat(64),
  token: '2'.repeat(64), name: 'Synthetic Xperia' });
let stage = 'inputs', networkAttempted = false;
const probes = [];

function fakeEnvironment() {
  const state = { databaseTouched: false, assetsTouched: false, databaseWriteAttempted: false };
  const deniedWrite = () => {
    state.databaseWriteAttempted = true;
    throw new Error('Synthetic database rejects writes');
  };
  const DB = {
    prepare() {
      state.databaseTouched = true;
      const statement = {
        bind() { return statement; },
        async first() { return null; },
        async all() { return { results: [], success: true, meta: { changes: 0 } }; },
        async run() { return deniedWrite(); }
      };
      return statement;
    },
    async batch() { return deniedWrite(); },
    async exec() { return deniedWrite(); }
  };
  return { state, env: {
    DB,
    ASSETS: { async fetch() { state.assetsTouched = true; return new Response('synthetic asset', { status: 404 }); } },
    OWNER_KEY_HASH: ownerHash,
    VENDING_ENABLED: '1',
    VENDING_CATALOGUE_ENABLED: '1',
    VENDING_PUBLIC_PLAY: '1',
    NOTEBOOK_PATH: '/nanpure/releases/2026.11.04.95/notebook/index.html'
  } };
}

async function probe(entrypoint, version, scenario, requestOrigin) {
  const { state, env } = fakeEnvironment(), pending = [];
  const record = { stage: version + '.' + scenario, completed: false, status: null,
    bytes: 0, json: false, enrollmentInvalid: false,
    databaseTouched: false, assetsTouched: false, databaseWriteAttempted: false, backgroundFailed: false };
  let bytes = Buffer.alloc(0);
  try {
    const response = await entrypoint.fetch(new Request(origin + '/api/vending/worker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(requestOrigin && { Origin: requestOrigin }) },
      body
    }), env, { waitUntil(promise) { pending.push(Promise.resolve(promise)); }, passThroughOnException() {} });
    if (!(response instanceof Response)) throw new Error('Expected a Response');
    record.status = response.status;
    bytes = Buffer.from(await response.arrayBuffer());
    record.bytes = bytes.length;
    try {
      const data = JSON.parse(bytes.toString('utf8'));
      record.json = data !== null && typeof data === 'object' && !Array.isArray(data);
      record.enrollmentInvalid = record.json && data.code === 'enrollment_invalid';
    } catch { /* A non-JSON gate response is recorded without its contents. */ }
    record.completed = true;
  } catch { /* Exception messages can contain module source; never forward them. */ }
  const settled = await Promise.allSettled(pending);
  record.backgroundFailed = settled.some(result => result.status === 'rejected');
  Object.assign(record, state);
  probes.push(record);
  return { record, bytes };
}

function report(ok, flags = {}) {
  process.stdout.write(JSON.stringify({ stage, ok, networkAttempted, ...flags, probes }) + '\n');
  if (!ok) process.exitCode = 1;
}

async function main(args) {
  if (args.length !== 2 || args.some(arg => arg.startsWith('--')) || resolve(args[0]) === resolve(args[1])) {
    report(false); return;
  }
  const originalFetch = globalThis.fetch, originalConsole = globalThis.console;
  const quiet = Object.create(originalConsole);
  for (const method of ['log', 'info', 'debug', 'warn', 'error', 'dir', 'table', 'trace']) quiet[method] = () => {};
  globalThis.console = quiet;
  globalThis.fetch = async () => {
    networkAttempted = true;
    throw new Error('Network disabled for module rehearsal');
  };
  let flags;
  try {
    stage = 'import_old';
    const old = (await import(pathToFileURL(resolve(args[0])).href)).default;
    if (typeof old?.fetch !== 'function') throw new Error('Missing entrypoint');
    stage = 'import_patched';
    const patched = (await import(pathToFileURL(resolve(args[1])).href)).default;
    if (typeof patched?.fetch !== 'function') throw new Error('Missing entrypoint');
    const results = new Map();
    for (const [scenario, requestOrigin] of [
      ['native_no_origin', null], ['same_origin', origin], ['wrong_origin', 'https://untrusted.invalid']
    ]) {
      for (const [version, entrypoint] of [['old', old], ['patched', patched]]) {
        stage = version + '.' + scenario;
        results.set(stage, await probe(entrypoint, version, scenario, requestOrigin));
      }
    }
    stage = 'compare';
    const reached = scenario => {
      const r = results.get('patched.' + scenario).record;
      return r.completed && r.status === 403 && r.json && r.enrollmentInvalid &&
        r.databaseTouched && !r.assetsTouched && !r.databaseWriteAttempted && !r.backgroundFailed;
    };
    const previousWrong = results.get('old.wrong_origin'), patchedWrong = results.get('patched.wrong_origin');
    const originBlocked = result => result.record.completed && result.record.status === 403 &&
      !result.record.enrollmentInvalid;
    const legacyBaseline = ['old.native_no_origin', 'old.same_origin'].every(key => {
      const r = results.get(key).record;
      return r.completed && r.status === 403 && !r.enrollmentInvalid;
    });
    flags = { legacyBaseline, nativeNoOrigin: reached('native_no_origin'), sameOrigin: reached('same_origin'),
      wrongOriginPreserved: originBlocked(previousWrong) && originBlocked(patchedWrong) &&
        previousWrong.record.databaseTouched === patchedWrong.record.databaseTouched &&
        previousWrong.record.assetsTouched === patchedWrong.record.assetsTouched &&
        previousWrong.bytes.equals(patchedWrong.bytes) };
    const allCompleted = probes.every(r => r.completed && !r.databaseWriteAttempted && !r.backgroundFailed);
    const ok = allCompleted && !networkAttempted && Object.values(flags).every(Boolean);
    stage = ok ? 'complete' : 'compare';
    report(ok, flags);
  } catch { report(false, flags); }
  finally { globalThis.fetch = originalFetch; globalThis.console = originalConsole; }
}

await main(process.argv.slice(2));
