#!/usr/bin/env node
// The live module stays in the runner's private temporary directory. Never
// print its source, excerpts, environment bindings, or parser diagnostics.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const EXPECTED_OLD_SHA256 = '369a2c961c4c6f9e80736ee8c8594d11b63ff01c5a8e4abc97662444a275de12';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const api = join(root, 'nanpure-api');
const requireApi = createRequire(join(api, 'package.json'));
const expectedBody = `{
  if (!vendingEnabled(env)) fail(503, '問題の受け取り機能は準備中です。');
  const now = Date.now();
  if (pathname === '/api/vending/admin') return admin(request, env, now);
  const expanded = catalogueEnabled(env);
  if (pathname === '/api/vending/worker') return worker(request, env.DB, now, expanded);
  return orders(request, env.DB, now, expanded);
}`;

class PatchError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const demand = (condition, code, message) => {
  if (!condition) throw new PatchError(code, message);
};
export const sha256 = value => createHash('sha256').update(value).digest('hex');

function parser() {
  demand(requireApi('acorn/package.json').version === '8.15.0',
    'DEPENDENCY_VERSION', 'The pinned Acorn version is required.');
  return requireApi('acorn');
}

function parse(source) {
  try { return parser().parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (error) {
    if (error instanceof PatchError) throw error;
    throw new PatchError('INVALID_MODULE', 'The module could not be parsed.');
  }
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

const unwrap = statement => statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
function topBindings(ast, name) {
  const found = [];
  for (const statement of ast.body) {
    const node = unwrap(statement);
    if (!node) continue;
    if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type) && node.id?.name === name) found.push(node);
    if (node.type === 'VariableDeclaration') for (const declaration of node.declarations)
      if (declaration.id.type === 'Identifier' && declaration.id.name === name) found.push(declaration.init);
  }
  return found;
}

function canonical(value, aliases = new Map()) {
  if (Array.isArray(value)) return value.map(child => canonical(child, aliases));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['start', 'end', 'raw', 'loc'].includes(key))
    .map(([key, child]) => [key,
      value.type === 'Identifier' && key === 'name' ? (aliases.get(child) || child)
        : value.type === 'VariableDeclaration' && key === 'kind' ? 'declaration'
          : canonical(child, aliases)]));
}

const identifiers = (nodes, expected) => nodes.length === expected.length &&
  nodes.every((node, index) => node.type === 'Identifier' && node.name === expected[index]);

function assertProblemClass(ast) {
  const candidates = [];
  walk(ast, node => {
    if (node.type === 'ClassDeclaration' && /^Problem\d*$/.test(node.id?.name || ''))
      candidates.push({ name: node.id.name, node });
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' &&
        /^Problem\d*$/.test(node.id.name) && node.init?.type === 'ClassExpression')
      candidates.push({ name: node.id.name, node: node.init });
  });
  demand(candidates.length === 1, 'PROBLEM_CLASS', 'Expected one legacy Problem class.');
  const { name, node } = candidates[0];
  demand(topBindings(ast, name).length === 1 && topBindings(ast, name)[0] === node,
    'PROBLEM_CLASS', 'The legacy Problem class must have one module-level binding.');
  const constructor = node.body.body[0];
  const expected = parse('class Expected extends Error { constructor(status,message){super(message);this.status=status;} }')
    .body[0].body.body[0];
  demand(node.superClass?.type === 'Identifier' && node.superClass.name === 'Error' &&
    node.body.body.length === 1 && JSON.stringify(canonical(constructor)) === JSON.stringify(canonical(expected)),
    'PROBLEM_CLASS', 'The legacy Problem constructor does not match the supported contract.');
  return name;
}

function assertFlag(binding, property) {
  const expression = binding?.body?.type === 'BlockStatement' && binding.body.body.length === 1 &&
    binding.body.body[0].type === 'ReturnStatement' ? binding.body.body[0].argument : binding?.body;
  return binding && identifiers(binding.params || [], ['env']) && !binding.async &&
    expression?.type === 'BinaryExpression' && expression.operator === '===' &&
    expression.left.type === 'MemberExpression' && !expression.left.computed &&
    expression.left.object.type === 'Identifier' && expression.left.object.name === 'env' &&
    expression.left.property.type === 'Identifier' && expression.left.property.name === property &&
    expression.right.type === 'Literal' && expression.right.value === '1';
}

function inspect(source) {
  const ast = parse(source);
  const functions = [];
  walk(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'vending') functions.push(node);
  });
  demand(functions.length === 1, 'VENDING_FUNCTION', 'Expected one legacy vending function.');
  const fn = functions[0];
  demand(topBindings(ast, 'vending').length === 1 && topBindings(ast, 'vending')[0] === fn &&
    fn.async && !fn.generator && identifiers(fn.params, ['request', 'env', 'pathname']),
    'VENDING_SIGNATURE', 'The legacy vending function signature is unsupported.');
  const problem = assertProblemClass(ast);
  const aliases = new Map(), targets = new Map();
  const bases = ['vendingEnabled', 'fail', 'admin', 'catalogueEnabled', 'worker', 'orders'];
  walk(fn.body, node => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return;
    const called = node.callee.name;
    const base = bases.find(name => new RegExp('^' + name + '\\d*$').test(called));
    demand(base && !targets.has(base), 'VENDING_BODY', 'The legacy vending call graph is unsupported.');
    aliases.set(called, base); targets.set(base, called);
  });
  const expected = parse('async function expected(request,env,pathname)' + expectedBody).body[0].body;
  demand(targets.size === bases.length &&
    JSON.stringify(canonical(fn.body, aliases)) === JSON.stringify(canonical(expected)),
    'VENDING_BODY', 'The legacy vending guards or routes do not match.');
  const bindings = new Map();
  for (const [base, called] of targets) {
    const declarations = topBindings(ast, called);
    demand(declarations.length === 1 && declarations[0], 'VENDING_BINDING', 'A legacy vending dependency is ambiguous.');
    bindings.set(base, declarations[0]);
  }
  demand(assertFlag(bindings.get('vendingEnabled'), 'VENDING_ENABLED') &&
    assertFlag(bindings.get('catalogueEnabled'), 'VENDING_CATALOGUE_ENABLED'),
    'FEATURE_GUARD', 'The legacy vending feature guards do not match.');
  for (const [name, parameters] of [['admin', 3], ['worker', 4], ['orders', 4]]) {
    const binding = bindings.get(name);
    demand(binding.type === 'FunctionDeclaration' && binding.async && binding.params.length === parameters,
      'VENDING_BINDING', 'A legacy route dependency does not match.');
  }
  const fail = bindings.get('fail');
  const expectedFail = parse('const expected=(status,message)=>{throw new ' + problem + '(status,message);};')
    .body[0].declarations[0].init;
  demand(identifiers(fail.params || [], ['status', 'message']) && !fail.async &&
    JSON.stringify(canonical(fail.body)) === JSON.stringify(canonical(expectedFail.body)),
    'PROBLEM_BRIDGE', 'The legacy error helper does not use the expected Problem class.');
  return { fn, problem };
}

// Pure structural rewriting is exported for synthetic tests. The production
// CLI always calls readPinnedWorker first and has no hash-override option.
export function patchWorkerSource(source, namespace = '__nanpureFleet_' + randomBytes(12).toString('hex')) {
  demand(/^__nanpureFleet_[a-f0-9]{24}$/.test(namespace) && !source.includes(namespace),
    'NAMESPACE_COLLISION', 'The dedicated import binding is invalid or already present.');
  demand(!source.startsWith('#!'), 'UNSUPPORTED_PREAMBLE', 'A worker module cannot have a hashbang preamble.');
  const { fn, problem } = inspect(source);
  const prefix = source.slice(0, fn.body.start), suffix = source.slice(fn.body.end);
  const oldBody = source.slice(fn.body.start, fn.body.end);
  const header = `import * as ${namespace} from "./fleet-vending.mjs";\n`;
  const body = `{
  try {
    return await ${namespace}.vending(request, env, pathname);
  } catch (error) {
    if (error instanceof ${namespace}.Problem) throw new ${problem}(error.status, error.message);
    throw error;
  }
}`;
  const output = header + prefix + body + suffix;
  parse(output);
  // Exact UTF-8 comparison: the only edits are this one function body and
  // the dedicated import. All outer gates, assets and other APIs are retained.
  const restored = output.slice(header.length, header.length + prefix.length) + oldBody +
    output.slice(header.length + prefix.length + body.length);
  demand(Buffer.from(restored).equals(Buffer.from(source)), 'OUTSIDE_CHANGED', 'Bytes outside the allowed edits changed.');
  assert.equal(output.slice(header.length, header.length + prefix.length), prefix);
  assert.equal(output.slice(-suffix.length || output.length), suffix);
  return { source: output, namespace, bodyStart: fn.body.start, bodyEnd: fn.body.end,
    headerBytes: Buffer.byteLength(header), originalSHA256: sha256(source), workerSHA256: sha256(output) };
}

export function readPinnedWorker(path) {
  const bytes = readFileSync(path);
  demand(sha256(bytes) === EXPECTED_OLD_SHA256, 'LEGACY_HASH', 'The live Worker hash does not match the reviewed version.');
  const source = bytes.toString('utf8');
  demand(Buffer.from(source).equals(bytes), 'INVALID_UTF8', 'The live Worker is not valid UTF-8.');
  return source;
}

export async function buildFleetModule() {
  demand(requireApi('esbuild/package.json').version === '0.25.10',
    'DEPENDENCY_VERSION', 'The pinned esbuild version is required.');
  const prepared = spawnSync(process.execPath, [join(api, 'scripts/prepare-vending-proof.mjs')],
    { cwd: api, encoding: 'utf8', stdio: 'pipe' });
  demand(prepared.status === 0, 'PREPARE_FAILED', 'Preparing the pinned verification engines failed.');
  let result;
  try {
    result = await requireApi('esbuild').build({
      absWorkingDir: root,
      stdin: { contents: 'export { vending } from "./nanpure-api/src/vending.js";\nexport { Problem } from "./nanpure-api/src/http.js";\n',
        resolveDir: root, sourcefile: 'fleet-vending-entry.mjs', loader: 'js' },
      bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
      charset: 'utf8', legalComments: 'none', minify: false, sourcemap: false,
      write: false, metafile: true, logLevel: 'silent'
    });
  } catch { throw new PatchError('BUILD_FAILED', 'Building the fleet module failed.'); }
  demand(result.outputFiles.length === 1 &&
    Object.values(result.metafile.outputs).every(output => output.imports.length === 0),
    'MODULE_IMPORTS', 'The fleet module must be self-contained.');
  const bytes = Buffer.from(result.outputFiles[0].contents), ast = parse(bytes.toString('utf8'));
  const exported = ast.body.filter(node => node.type === 'ExportNamedDeclaration')
    .flatMap(node => node.specifiers.map(specifier => specifier.exported.name)).sort();
  demand(JSON.stringify(exported) === '["Problem","vending"]',
    'MODULE_EXPORTS', 'The fleet module exports do not match the bridge contract.');
  return bytes;
}

async function main(args) {
  demand(args.length === 2 && !args.some(arg => arg.startsWith('--')),
    'USAGE', 'Use: patch-worker.mjs OLD_WORKER_JS OUTPUT_DIRECTORY');
  const input = resolve(args[0]), directory = resolve(args[1]);
  const entry = join(directory, 'worker.js'), fleet = join(directory, 'fleet-vending.mjs');
  demand(input !== entry && input !== fleet && !existsSync(entry) && !existsSync(fleet),
    'OUTPUT_EXISTS', 'Use a separate output directory without existing worker modules.');
  const source = readPinnedWorker(input);
  const patched = patchWorkerSource(source);
  const module = await buildFleetModule();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(fleet, module, { flag: 'wx', mode: 0o600 });
  writeFileSync(entry, patched.source, { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({ ok: true, originalSHA256: patched.originalSHA256,
    workerSHA256: patched.workerSHA256, fleetSHA256: sha256(module) }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    const known = error instanceof PatchError;
    process.stderr.write(JSON.stringify({ ok: false, code: known ? error.code : 'PATCH_FAILED',
      message: known ? error.message : 'Patching failed without logging module source or binding values.' }) + '\n');
    process.exitCode = 1;
  });
}
