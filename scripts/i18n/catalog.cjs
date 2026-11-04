// Keep additions and corrections separate from the large established catalog.
// Build, audit and test consumers share this merged catalog.
module.exports = {
  ...require('./catalog.json'),
  ...require('./catalog-updates.json'),
  ...require('./catalog-release-33.json'),
  ...require('./catalog-seo-34.json'),
  ...require('./catalog-ranking-35.json'),
  ...require('./catalog-keyboard-36.json'),
  ...require('./catalog-smooth-37.json'),
  ...require('./catalog-keybindings-38.json'),
  ...require('./catalog-appearance-39.json'),
  ...require('./catalog-languages-40.json'),
  ...require('./catalog-audio-41.json'),
  ...require('./catalog-magic-42.json'),
  ...require('./catalog-magic-library-43.json'),
  ...require('./catalog-wado-44.cjs'),
};
// Additional languages are split by locale to keep updates reviewable.
// Visitors receive one generated language pack, never this combined catalog.
const fs=require('node:fs'),path=require('node:path');
for(const locale of Object.keys(require('./languages.json')).filter(code=>!['ja','en','zh-Hans','zh-Hant','ko','es','fr','de','pt'].includes(code))){
 const pack=JSON.parse(fs.readFileSync(path.join(__dirname,'additional',locale+'.json'),'utf8'));
 for(const [key,value]of Object.entries(pack)){
  if(!Object.hasOwn(module.exports,key))throw Error('Unknown translation source: '+key);
  module.exports[key][locale]=value;
 }
}
for(const [key,translations]of Object.entries(require('./additional-overrides.json'))){
 if(!Object.hasOwn(module.exports,key))throw Error('Unknown correction source: '+key);
 for(const [locale,value]of Object.entries(translations))if(Object.hasOwn(require('./languages.json'),locale))module.exports[key][locale]=value;
}

Object.assign(module.exports,require('./catalog-wado-45.cjs'));
Object.assign(module.exports,require('./catalog-achievements-52.json'));
Object.assign(module.exports,require('./catalog-cloud-57.cjs'));

Object.assign(module.exports,require('./catalog-cloud-retirement-58.cjs'));

Object.assign(module.exports,require('./catalog-cloud-notice-59.cjs'));
Object.assign(module.exports,require('./catalog-ofuse-membership-61.cjs'));
Object.assign(module.exports,require('./catalog-reading-70.cjs'));
Object.assign(module.exports,require('./catalog-connected-layout-71.cjs'));
require('./reading-aliases.cjs')(module.exports);
require('./wado-reading-70.cjs')(module.exports);

// Explicit native translations take priority over composed label aliases.
Object.assign(module.exports,require('./catalog-reading-70.cjs'));

Object.assign(module.exports,require('./catalog-pattern-share-78.cjs'));
Object.assign(module.exports,require('./catalog-pattern-mobile-79.cjs')(module.exports));
Object.assign(module.exports,require('./catalog-pattern-flow-80.cjs')(module.exports));
Object.assign(module.exports,require('./catalog-pattern-jobs-81.cjs')());
Object.assign(module.exports,require('./catalog-pattern-wording-82.cjs')(module.exports));
Object.assign(module.exports,require('./catalog-pattern-posting-83.cjs'));
Object.assign(module.exports,require('./catalog-pattern-drawing-83.cjs'));

Object.assign(module.exports,require('./catalog-ranking-auto-84.json'));
Object.assign(module.exports,require('./catalog-grouped-home-87.cjs'));

Object.assign(module.exports,require('./catalog-stepped-home-90.json'));

Object.assign(module.exports,require('./catalog-home-91.json'));

// The home labels specify Sudoku. Reuse the equivalent translations in other languages.
module.exports['ナンプレを作る'] = module.exports['問題を作る'];
module.exports['日替わりナンプレに挑戦する'] = module.exports['日替わり問題に挑戦する'];

Object.assign(module.exports,require('./catalog-home-93.json'));
Object.assign(module.exports,require('./catalog-home-94.json'));
Object.assign(module.exports,require('./catalog-home-95.json'));
