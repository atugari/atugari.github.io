import {cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const pilot = fileURLToPath(new URL('.', import.meta.url));
const api = fileURLToPath(new URL('..', import.meta.url));
const source = fileURLToPath(new URL('../../nanpure/', import.meta.url));
const generated = join(pilot, '.generated');
const configFile = join(pilot, 'wrangler.generated.json');
const {NANPURE_PILOT_DB_ID: id, NANPURE_PILOT_OWNER_HASH: ownerHash} = process.env;
if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id || '')) {
  throw new Error('Set NANPURE_PILOT_DB_ID to the ID of the isolated nanpure-vending-pilot-db database.');
}
if (!/^[a-f0-9]{64}$/.test(ownerHash || '')) {
  throw new Error('Set NANPURE_PILOT_OWNER_HASH to the SHA-256 hash of the trial owner key.');
}
const production = JSON.parse(readFileSync(join(api, 'wrangler.jsonc'), 'utf8'));
if (production.d1_databases.some(db => db.database_id === id) || production.vars.OWNER_KEY_HASH === ownerHash) {
  throw new Error('Production database and credentials cannot be used for the trial.');
}

const version = JSON.parse(readFileSync(join(source, 'version.json'), 'utf8')).version;
if (!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version)) throw new Error('Invalid Nanpure notebook version.');
const notebook = `/nanpure/releases/${version}/notebook/index.html`;
const vend = join(generated, 'assets', 'nanpure', 'vending');
const releases = join(generated, 'assets', 'nanpure', 'releases');
const migrations = join(generated, 'migrations');
rmSync(configFile, {force: true});
rmSync(generated, {recursive: true, force: true});
mkdirSync(releases, {recursive: true});
mkdirSync(migrations, {recursive: true});
cpSync(join(source, 'vending'), vend, {recursive: true});
cpSync(join(source, 'releases', version), join(releases, version), {recursive: true});
cpSync(join(source, 'version.json'), join(generated, 'assets', 'nanpure', 'version.json'));

writeFileSync(join(vend, 'config.js'), 'export const serverOrigin = location.origin;\n');
const client = join(vend, 'api.js');
const apiClient = readFileSync(client, 'utf8');
if (!apiClient.includes("credentials: 'omit'")) throw new Error('Update the pilot copy of the vending API client.');
writeFileSync(client, apiClient.replace("credentials: 'omit'", "credentials: 'same-origin'"));

// Use a separate migration history so this database never contains production tables.
const application = readFileSync(join(api, 'migrations', '0002_cloudflare_application.sql'), 'utf8');
const rateLimits = application.split('\n').filter(line => /^CREATE (?:TABLE|INDEX) IF NOT EXISTS rate_/.test(line));
if (rateLimits.length !== 2) throw new Error('The vending rate limit schema changed.');
writeFileSync(join(migrations, '0001_rate_limits.sql'), rateLimits.join('\n') + '\n');
cpSync(join(pilot, 'session.sql'), join(migrations, '0002_pilot_sessions.sql'));
const apiMigrations = join(api, 'migrations');
for (const name of readdirSync(apiMigrations).filter(name => /^\d+_vending(?:_\w+)?\.sql$/.test(name))) {
  cpSync(join(apiMigrations, name), join(migrations, name));
}

writeFileSync(configFile, JSON.stringify({
  name: 'nanpure-vending-pilot',
  main: 'worker.js',
  compatibility_date: production.compatibility_date,
  workers_dev: true,
  preview_urls: false,
  assets: {directory: './.generated/assets', binding: 'ASSETS', html_handling: 'none', run_worker_first: true},
  d1_databases: [{binding: 'DB', database_name: 'nanpure-vending-pilot-db', database_id: id,
    migrations_dir: './.generated/migrations'}],
  vars: {VENDING_ENABLED: '1', OWNER_KEY_HASH: ownerHash, NOTEBOOK_PATH: notebook},
  triggers: {crons: ['17 15 * * *']}
}, null, 2) + '\n', {mode: 0o600});
console.log('Prepared the private trial Worker, notebook assets, and isolated D1 migrations.');
