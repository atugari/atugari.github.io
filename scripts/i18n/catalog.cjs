// Keep additions and corrections separate from the large established catalog.
// Build, audit and test consumers share this merged catalog.
module.exports = {
  ...require('./catalog.json'),
  ...require('./catalog-updates.json'),
};
