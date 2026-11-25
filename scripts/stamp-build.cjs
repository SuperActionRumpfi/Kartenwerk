'use strict';
const fs = require('node:fs');
const path = require('node:path');
function stamp(html, sha) {
  if (!/^[a-f0-9]{40}$/i.test(sha || '')) throw new Error('Expected a full Git commit SHA in GITHUB_SHA.');
  const clean = html.replace(/<!-- Kartenwerk build: [^\r\n]*? -->\r?\n?/g, '');
  if (!/^<!doctype html>/i.test(clean)) throw new Error('Expected an HTML document beginning with <!doctype html>.');
  return clean.replace(/^(<!doctype html>\r?\n?)/i, '$1<!-- Kartenwerk build: ' + sha + ' -->\n');
}
if (require.main === module) {
  const target = path.join(__dirname, '../dist/index.html');
  fs.writeFileSync(target, stamp(fs.readFileSync(target, 'utf8'), process.env.GITHUB_SHA));
  console.log('Added Kartenwerk build marker for commit ' + process.env.GITHUB_SHA);
}
module.exports = { stamp };
