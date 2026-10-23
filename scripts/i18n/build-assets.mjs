import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import catalog from './catalog.cjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
export const languageNames=JSON.parse(fs.readFileSync(path.join(directory,'languages.json'),'utf8'));
export const translationLocales=Object.keys(languageNames).filter(code=>code!=='ja');

// Keep this bootstrap small: a language is fetched only when it is requested.
// The reviewed catalog remains the single source for every generated pack.
function bootstrap(config) {
  const w = window;
  w.NPTranslations = w.NPTranslations || {};
  w.NPInlineMessages = config.inlineMessages;
  try {
    const parent = w.parent !== w && w.parent.NPTranslationAssets;
    if (parent && parent.version === config.version) {
      w.NPTranslationAssets = parent;
      return;
    }
  } catch (_) { /* A separately hosted frame cannot share its parent's cache. */ }
  const base = new URL('./i18n/', document.currentScript.src);
  const loaded = new Map(), pending = new Map();
  function load(locale) {
    if (locale === 'ja') return Promise.resolve({});
    if (!config.locales.includes(locale)) return Promise.reject(new Error('Unknown language'));
    if (loaded.has(locale)) return Promise.resolve(loaded.get(locale));
    if (pending.has(locale)) return pending.get(locale);
    const request = fetch(new URL(locale + '.json', base), {credentials:'same-origin',cache:'force-cache'})
      .then(response => {
        if (!response.ok) throw new Error('Translation download failed: ' + response.status);
        return response.json();
      })
      .then(pack => {
        if (!pack || Array.isArray(pack) || typeof pack !== 'object' || !Object.keys(pack).length || Object.values(pack).some(value => typeof value !== 'string')) throw new Error('Invalid translation pack');
        if(config.additions?.[locale])pack = Object.assign({}, pack, config.additions[locale]);
        loaded.set(locale, Object.freeze(pack));
        pending.delete(locale);
        return pack;
      }, error => {
        pending.delete(locale);
        throw error;
      });
    pending.set(locale, request);
    // Validation errors must also permit a retry.
    request.catch(() => pending.delete(locale));
    return request;
  }
  w.NPTranslationAssets = {version:config.version,names:config.names,load,has:locale=>locale==='ja'||loaded.has(locale),messages:config.messages};
}

export function buildTranslationAssets(outputDirectory, version, {previousDirectory} = {}) {
  const inlineMessages = JSON.parse(fs.readFileSync(path.join(directory,'inline-messages.json'),'utf8'));
  fs.mkdirSync(path.join(outputDirectory,'i18n'),{recursive:true});
  const bytes = {}, additions = {};
  for (const locale of translationLocales) {
    const pack = Object.fromEntries(Object.entries(catalog).map(([key,translations]) => {
      if (typeof translations[locale] !== 'string' || !translations[locale]) throw new Error('Missing '+locale+' translation: '+key);
      return [key,translations[locale]];
    }));
    const previousFile=previousDirectory && path.join(previousDirectory,'i18n',locale+'.json');
    let source;
    if(previousFile && fs.existsSync(previousFile)){
      const previous=JSON.parse(fs.readFileSync(previousFile,'utf8'));
      if(Object.keys(previous).some(key=>!Object.hasOwn(pack,key)))throw Error('Cannot reuse a pack with removed messages');
      additions[locale]=Object.fromEntries(Object.entries(pack).filter(([key,value])=>previous[key]!==value));
      source=fs.readFileSync(previousFile,'utf8');
    }else source=JSON.stringify(pack)+'\n';
    fs.writeFileSync(path.join(outputDirectory,'i18n',locale+'.json'),source);
    bytes[locale] = Buffer.byteLength(source);
  }
  const messages = Object.fromEntries(['読み込み中…','表示を読み込めませんでした。通信を確認して、もう一度お試しください。','もう一度読み込む'].map(key=>[key,{ja:key,...catalog[key]}]));
  const source = '('+bootstrap.toString()+')('+JSON.stringify({version,names:languageNames,locales:translationLocales,inlineMessages,messages,additions})+');\n';
  fs.writeFileSync(path.join(outputDirectory,'i18n-data.js'),source);
  return {bootstrapBytes:Buffer.byteLength(source),localeBytes:bytes};
}
