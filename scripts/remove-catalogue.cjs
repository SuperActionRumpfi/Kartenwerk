'use strict';
// Remove retired files left by additive GitHub browser uploads, before tests/deployment.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const retired = ['dist/data', 'dist/catalogue.js', 'scripts/build_catalogue.py', 'tests/catalogue.test.cjs', 'tests/catalogue_test.py', '.github/workflows/catalogue.yml'];
for (const item of retired) fs.rmSync(path.join(root, item), {recursive: true, force: true});
console.log('Retired catalogue files removed from checkout.');
