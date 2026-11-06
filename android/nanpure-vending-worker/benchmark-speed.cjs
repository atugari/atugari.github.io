'use strict';

// Read-only engine benchmark; report destination is configurable.
// Run from the Android app folder, or pass --app /path/to/nanpure-vending-worker.
// Usage: node benchmark-speed.cjs [suite|prefix|complete|parallel|verify]
//        [--app DIR] [--out REPORT.json] [--apk-engine EXTRACTED_ENGINE.js]
// Environment alternatives: NANPURE_REFILL_BENCH_APP, NANPURE_REFILL_BENCH_OUT,
// NANPURE_REFILL_BENCH_APK_ENGINE. With no APK, the published 0.2.2 SHA is checked.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');

function option(name) {
  const at = process.argv.indexOf('--' + name);
  if (at === -1) return undefined;
  const value = process.argv[at + 1];
  if (!value || value.startsWith('--')) throw Error('Missing value for --' + name);
  return value;
}
const sourceRoot = path.resolve(option('app') || process.env.NANPURE_REFILL_BENCH_APP || __dirname);
const apkEngine = option('apk-engine') || process.env.NANPURE_REFILL_BENCH_APK_ENGINE;
const baselineSHA256 = 'e9fc54cc9396e046580c51e8c41de1308a9d18ceb5f56c3c98e0976a94dcae45';
const roundSHA256 = '69b200ad3e3036e30461e438b33f3f73a2fe0e7bf18797fe801ae82c6e00d85c';
const bridgeSHA256 = '18d5f5d7122eae6e2f7571571b1ff904853de02db5772060aabfa0c8fa5a0bf5';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const rounded = value => Math.round(value * 1000) / 1000;
const median = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const i = sorted.length >> 1;
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};

function loadInputs() {
  const prepare = require(path.join(sourceRoot, 'prepare-engine.cjs'));
  const base = prepare.loadReleaseEngine({optimized: false});
  const improved = prepare.loadReleaseEngine({optimized: true});
  const profiles = prepare.listProfiles(base);
  assert.equal(JSON.stringify(prepare.listProfiles(improved)), JSON.stringify(profiles));
  const suffix = 'const REFILL_PROFILES = ' + JSON.stringify(profiles) + ';\n';
  const baseline = base + suffix, candidate = improved + suffix;
  assert.equal(sha(baseline), baselineSHA256, 'baseline matches engine shipped in 0.2.2 APK');
  if (apkEngine) assert.equal(baseline, fs.readFileSync(path.resolve(apkEngine), 'utf8'), 'optional APK byte comparison');
  const round = fs.readFileSync(path.join(sourceRoot, 'src/main/assets/round.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(sourceRoot, 'src/main/assets/bridge.js'), 'utf8');
  assert.equal(sha(round), roundSHA256, 'original APK Worker path retained');
  assert.equal(sha(bridge), bridgeSHA256, 'original APK bridge path retained');
  return {baseline, candidate, round, bridge, metadata: {
    baselineSHA256: sha(baseline), candidateSHA256: sha(candidate),
    solverSHA256: sha(fs.readFileSync(path.join(sourceRoot, 'engine-overrides/unique-solver.js'))),
    roundSHA256: sha(round), bridgeSHA256: sha(bridge),
    profiles: profiles.length, profileSHA256: sha(JSON.stringify(profiles)),
    node: process.version, platform: process.platform, architecture: process.arch,
    cpu: os.cpus()[0]?.model, availableParallelism: os.availableParallelism(),
    cgroupCPU: (() => {try {return fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim();} catch {return null;}})(),
    note: 'Desktop Node/V8; these are not Xperia/Android WebView timing measurements.',
  }};
}

function contextFor(engine) {
  const context = vm.createContext({performance});
  context.self = context;
  vm.runInContext(engine, context, {filename: 'refill-engine.js', timeout: 5000});
  return context;
}

function singleWork(job) {
  const c = contextFor(job.engine);
  const logicName = job.level === 18 ? 'NanpureResolutionLogic' : 'NanpureMasterLogic';
  const generatorName = job.level === 18 ? 'NanpureResolution' : 'NanpureMaster';
  const probeHash = crypto.createHash('sha256'), solveHash = crypto.createHash('sha256');
  const stats = {probes: 0, solves: 0, certifies: 0, starts: 0, uniqueMs: 0, solveMs: 0, certifyMs: 0,
    largestUniqueMs: 0, largestSolveMs: 0};
  const originals = {
    unique: c.Nanpure.hasUniqueSolution,
    solve: c[logicName].solve,
    certify: c[logicName].certify,
  };
  c.Nanpure.hasUniqueSolution = function(grid) {
    const start = performance.now(), value = originals.unique(grid), ms = performance.now() - start;
    stats.uniqueMs += ms; stats.probes++; stats.largestUniqueMs = Math.max(stats.largestUniqueMs, ms);
    probeHash.update(grid.flat().join('') + ':' + value + '\n');
    return value;
  };
  c[logicName].solve = function(info, grid, level, trace) {
    const start = performance.now(), result = originals.solve(info, grid, level, trace), ms = performance.now() - start;
    stats.solveMs += ms; stats.solves++; stats.largestSolveMs = Math.max(stats.largestSolveMs, ms);
    solveHash.update(JSON.stringify([grid, level, !!trace, result]) + '\n');
    return result;
  };
  c[logicName].certify = function(...args) {
    const start = performance.now();
    try {return originals.certify(...args);} finally {stats.certifies++; stats.certifyMs += performance.now() - start;}
  };
  const stop = Object.assign(new Error('PREFIX_COMPLETE'), {code: 'PREFIX_COMPLETE'});
  const start = performance.now();
  const progress = () => {
    stats.starts++;
    parentPort.postMessage({type: 'progress', elapsedMs: performance.now() - start, starts: stats.starts});
    if (job.prefixStarts && stats.starts > job.prefixStarts) throw stop;
  };
  let puzzle, status, error;
  try {
    puzzle = c[generatorName].generate(job.seed, progress, {budgetMs: job.prefixStarts ? 3600000 : job.budgetMs});
    status = 'generated';
  } catch (e) {
    status = e === stop ? 'prefix' : e.code === 'NP_SEARCH_EXHAUSTED' ? 'exhausted' : 'error';
    error = e === stop ? undefined : {code: e.code, message: e.message};
  }
  const elapsedMs = performance.now() - start;
  const result = {
    mode: job.mode, level: job.level, seed: job.seed, repetition: job.repetition,
    prefixStarts: job.prefixStarts || null, budgetMs: job.prefixStarts ? null : job.budgetMs,
    hardTimeoutMs: job.hardTimeoutMs, workerTimeoutIncludingStartupMs: job.hardTimeoutMs + 5000,
    status, elapsedMs: rounded(elapsedMs), error,
    fastUniqueVersion: c.Nanpure.fastUniqueVersion || 0,
    ...Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, key.endsWith('Ms') ? rounded(value) : value])),
    probeHash: probeHash.digest('hex'), solveHash: solveHash.digest('hex'),
  };
  if (puzzle) {
    const info = c[logicName].info(9);
    const proofValid = originals.certify(info, puzzle.puzzle, puzzle.logicProof);
    const grid = Array.from({length: 9}, (_, r) => puzzle.puzzle.slice(r * 9, r * 9 + 9));
    const unique = originals.unique(grid);
    result.completed = {
      id: puzzle.id, puzzleHash: sha(JSON.stringify(puzzle)),
      grid: puzzle.puzzle.join(''), solution: puzzle.solution.join(''),
      proofHash: sha(JSON.stringify(puzzle.logicProof)),
      rating: puzzle.rating, verification: puzzle.verification,
      proofVerified: proofValid, unique,
    };
    assert.equal(puzzle.rating.level, job.level);
    assert.equal(puzzle.rating.noGuess, true);
    assert.equal(puzzle.rating.unique, true);
    assert.equal(proofValid, true);
    assert.equal(unique, true);
  }
  return result;
}

function roundWorker(job) {
  const c = vm.createContext({performance, postMessage: data => parentPort.postMessage({type: 'reply', data})});
  c.self = c;
  c.importScripts = name => {
    assert.equal(name, 'engine.js');
    vm.runInContext(job.engine, c, {filename: 'refill-engine.js'});
  };
  vm.runInContext(job.round, c, {filename: 'round.js'});
  let generatedIds = 0;
  c.Nanpure.randomId = () => {
    generatedIds++;
    // Each lane uses the same deterministic valid ID across both variants.
    return job.seed;
  };
  parentPort.postMessage({type: 'ready', lane: job.lane, seed: job.seed, fastUniqueVersion: c.Nanpure.fastUniqueVersion || 0});
  parentPort.on('message', data => {
    const start = performance.now();
    c.onmessage({data});
    parentPort.postMessage({type: 'completedRound', elapsedMs: performance.now() - start, generatedIds});
  });
}

async function bounded(job) {
  return new Promise(resolve => {
    const worker = new Worker(__filename, {workerData: {operation: 'single', ...job}});
    let done = false, progress, timer;
    const finish = result => {
      if (done) return; done = true; clearTimeout(timer);
      worker.terminate().then(() => resolve(result));
    };
    timer = setTimeout(() => finish({mode: job.mode, level: job.level, seed: job.seed, repetition: job.repetition,
      status: 'hard-timeout', budgetMs: job.budgetMs, prefixStarts: job.prefixStarts || null,
      hardTimeoutMs: job.hardTimeoutMs, lastProgress: progress}), job.hardTimeoutMs + 5000);
    worker.on('message', message => {
      if (message.type === 'progress') progress = message;
      if (message.type === 'result') finish(message.result);
    });
    worker.on('error', e => finish({mode: job.mode, level: job.level, seed: job.seed, status: 'error', error: e.stack}));
  });
}

function sameWork(a, b) {
  const comparable = ['prefix', 'generated'].includes(a.status) && a.status === b.status;
  return {
    comparable,
    candidateSequenceIdentical: comparable && a.probes === b.probes && a.probeHash === b.probeHash,
    logicalWorkIdentical: comparable && a.solves === b.solves && a.solveHash === b.solveHash,
    finalPuzzleIdentical: a.completed && b.completed ? a.completed.puzzleHash === b.completed.puzzleHash : null,
    proofIdentical: a.completed && b.completed ? a.completed.proofHash === b.completed.proofHash : null,
  };
}

function summarizePairs(pairs) {
  return {pairs: pairs.length,
    identicalWorkPairs: pairs.filter(pair => pair.checks.candidateSequenceIdentical && pair.checks.logicalWorkIdentical).length,
    baselineMedianMs: median(pairs.map(p => p.baseline.elapsedMs).filter(Number.isFinite)),
    candidateMedianMs: median(pairs.map(p => p.candidate.elapsedMs).filter(Number.isFinite)),
    baselineCompleted: pairs.filter(p => p.baseline.status === 'generated').length,
    candidateCompleted: pairs.filter(p => p.candidate.status === 'generated').length,
    completedPairMedianBaselineMs: median(pairs.filter(p => p.checks.finalPuzzleIdentical).map(p => p.baseline.elapsedMs)),
    completedPairMedianCandidateMs: median(pairs.filter(p => p.checks.finalPuzzleIdentical).map(p => p.candidate.elapsedMs)),
    note: 'The general medians are workload/slice durations. Only completedPairMedian* denotes completed-puzzle generation time.',
  };
}

async function pairRun(inputs, job) {
  const results = {};
  const order = job.repetition % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
  for (const mode of order) {
    console.log(JSON.stringify({event: 'start', mode, ...job}));
    results[mode] = await bounded({...job, mode, engine: inputs[mode]});
    console.log(JSON.stringify({event: 'done', mode, level: job.level, seed: job.seed,
      repetition: job.repetition, status: results[mode].status, elapsedMs: results[mode].elapsedMs,
      probes: results[mode].probes, solves: results[mode].solves}));
  }
  const checks = sameWork(results.baseline, results.candidate);
  if (checks.comparable) {
    assert.equal(checks.candidateSequenceIdentical, true, 'same candidate sequence and exact results');
    assert.equal(checks.logicalWorkIdentical, true, 'same logical inputs and outputs');
    if (checks.finalPuzzleIdentical !== null) assert.equal(checks.finalPuzzleIdentical, true, 'identical generated object including difficulty and proof');
  }
  return {...results, checks};
}

async function benchmarkParallel(inputs, mode, options = {}) {
  const seeds = ['Xperi', 'aBc12', 'Aud18', 'Audit', 'A2asR', 'AJWkl', 'Bench', 'Fast3'];
  const budgetMs = options.budgetMs || 15000;
  const laneCount = options.lanes || 8;
  const workers = [], readiness = [], records = [], timers = new Set();
  let done;
  const completed = new Promise(resolve => {done = resolve;});
  const start = performance.now();
  class BrowserWorkerAdapter {
    constructor(url) {
      assert.equal(url, 'round.js');
      this.lane = workers.length; this.seed = seeds[this.lane]; this.terminated = false;
      this.worker = new Worker(__filename, {workerData: {operation: 'round', engine: inputs[mode], round: inputs.round,
        lane: this.lane, seed: this.seed}});
      workers.push(this);
      this.worker.on('message', message => {
        if (message.type === 'ready') readiness.push(message);
        else if (message.type === 'reply') this.onmessage?.({data: message.data});
      });
      this.worker.on('error', error => {this.error = error.message;this.onerror?.(error);});
    }
    postMessage(message) {this.request = message;this.worker.postMessage(message);}
    terminate() {this.terminated = true;return this.worker.terminate();}
  }
  const page = vm.createContext({Worker: BrowserWorkerAdapter,
    setTimeout(callback, delay) {const t = setTimeout(() => {timers.delete(t);callback();}, delay);timers.add(t);return t;},
    clearTimeout(t) {timers.delete(t);clearTimeout(t);},
    RefillBridge: {
      record(id, json) {records.push({id, result: JSON.parse(json)});return true;},
      finish(id, json) {done({id, result: JSON.parse(json), elapsedMs: rounded(performance.now() - start)});},
    },
  });
  page.window = page;
  vm.runInContext(inputs.bridge, page, {filename: 'bridge.js'});
  page.runRefillRound(1, 'normal:9:18:0::::', budgetMs, laneCount);
  const outcome = await completed;
  const workerDetails = workers.map(w => ({lane: w.lane, seed: w.seed, request: w.request, terminatedByBridge: w.terminated, error: w.error}));
  await Promise.all(workers.map(w => w.worker.terminate()));
  for (const timer of timers) clearTimeout(timer);
  const puzzle = outcome.result.puzzle;
  if (puzzle) {
    const check = contextFor(inputs.candidate);
    assert.equal(check.NPGenerationMatches(puzzle, {kind: 'normal', n: 9, level: 18}), true);
    assert.equal(check.NP.validate(puzzle), true);
    assert.equal(check.NanpureResolutionLogic.certify(check.NanpureResolutionLogic.info(9), puzzle.puzzle, puzzle.logicProof), true);
    outcome.result = {profile: outcome.result.profile, generated: true, id: puzzle.id,
      grid: puzzle.puzzle.join(''), solution: puzzle.solution.join(''), rating: puzzle.rating,
      proofHash: sha(JSON.stringify(puzzle.logicProof)), proofVerified: true};
  }
  return {mode, laneCount, budgetMs, seeds: seeds.slice(0, laneCount), ...outcome, readiness, workerDetails,
    scope: 'Original bridge.js -> original round.js -> complete engine in 8 real Node worker threads. Native Android/WebView/JNI/network/storage are not exercised.'};
}

async function main() {
  const task = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'suite';
  assert.ok(['suite', 'prefix', 'complete', 'parallel', 'verify'].includes(task), 'unknown benchmark task');
  const inputs = loadInputs();
  const file = path.resolve(option('out') || process.env.NANPURE_REFILL_BENCH_OUT || path.join(process.cwd(), task + '-results.json'));
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const report = {createdAt: new Date().toISOString(), task, metadata: inputs.metadata, runs: {}, notes: [
    'No application sources or APK contents were modified by this benchmark.',
    'A new V8 Worker/isolate is used for every single-case run; engine loading is outside generation timing.',
    'Baseline/candidate ordering alternates. Timed runs instrument the same candidate and logic hashes in both variants.',
    'No network requests, server reservations, uploads, or Android database writes are made.',
  ]};
  const save = () => fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  save();
  if (task === 'prefix' || task === 'suite') {
    for (const level of [16, 18]) {
      const cases = report.runs['prefix-l' + level] = {pairs: []};
      for (let repetition = 1; repetition <= 3; repetition++) {
        cases.pairs.push(await pairRun(inputs, {level, seed: 'aBc12', repetition, prefixStarts: 5, hardTimeoutMs: 30000}));
        cases.summary = summarizePairs(cases.pairs);save();
      }
    }
  }
  if (task === 'complete' || task === 'suite') {
    for (const level of [18, 16]) {
      const cases = report.runs['complete-l' + level] = {pairs: []};
      for (let repetition = 1; repetition <= 3; repetition++) {
        const seed = level === 18 ? 'Xperi' : ['A2asR', 'Aud16', 'Xperi'][repetition - 1];
        cases.pairs.push(await pairRun(inputs, {level, seed, repetition, budgetMs: level === 18 ? 30000 : 15000,
          hardTimeoutMs: level === 18 ? 35000 : 20000}));
        cases.summary = summarizePairs(cases.pairs);save();
      }
    }
  }
  if (task === 'parallel' || task === 'suite') {
    for (const mode of ['baseline', 'candidate']) {
      console.log(JSON.stringify({event: 'parallel-start', mode}));
      report.runs['parallel-' + mode] = await benchmarkParallel(inputs, mode);
      console.log(JSON.stringify({event: 'parallel-done', mode, elapsedMs: report.runs['parallel-' + mode].elapsedMs,
        result: report.runs['parallel-' + mode].result}));
      save();
    }
  }
  report.finishedAt = new Date().toISOString();save();
  console.log(JSON.stringify({event: 'finished', file}));
}

if (isMainThread) main().catch(e => {console.error(e.stack);process.exitCode = 1;});
else if (workerData.operation === 'round') roundWorker(workerData);
else {
  try {parentPort.postMessage({type: 'result', result: singleWork(workerData)});}
  catch (e) {parentPort.postMessage({type: 'result', result: {mode: workerData.mode, level: workerData.level, seed: workerData.seed,
    status: 'error', error: {code: e.code, message: e.message, stack: e.stack}}});}
  parentPort.close();
}
