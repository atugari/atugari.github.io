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
};
