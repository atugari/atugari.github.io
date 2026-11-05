import {readFileSync, writeFileSync} from 'node:fs';

function addGuidanceTranslations(assets, catalog) {
  if (!assets || assets.load.advertisingGuidance) return;
  const loadBase = assets.load.bind(assets);
  const entries = Object.entries(catalog);
  const packs = new Map();
  function load(locale) {
    if (!Object.hasOwn(entries[0][1], locale)) return loadBase(locale);
    if (!packs.has(locale)) {
      const request = loadBase(locale).then(base => {
        const extra = Object.fromEntries(entries.map(([key, translations]) => [key, translations[locale]]));
        return Object.freeze({...base, ...extra});
      });
      packs.set(locale, request);
      request.catch(() => packs.delete(locale));
    }
    return packs.get(locale);
  }
  load.advertisingGuidance = true;
  assets.load = load;
}

const catalog = JSON.parse(readFileSync(new URL('./catalog-advertising.json', import.meta.url), 'utf8'));
const target = new URL('../../nanpure/assets/guidance-i18n-20261105.js', import.meta.url);
const source = '// Regenerate with node scripts/i18n/build-guidance-i18n.mjs\n'
  + '(' + addGuidanceTranslations.toString() + ')(window.NPTranslationAssets, ' + JSON.stringify(catalog) + ');\n';
writeFileSync(target, source);
