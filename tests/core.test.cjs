const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDeck, faces, preferredPrinting, printItems, pages } = require('../dist/core.js');

test('imports common deck formats, German names and printing hints', () => {
  const deck = parseDeck('Commander\n1 Sol Ring (CMM) 396\n2x Blitzschlag\n3 x Forest\nSB: 1 Sonnenring\n# comment\n1 Fire // Ice');
  assert.deepEqual(deck.errors, []);
  assert.equal(deck.total, 8);
  assert.equal(deck.entries[0].set, 'cmm');
  assert.equal(deck.entries[0].collector, '396');
  assert.equal(deck.entries[1].quantity, 2);
  assert.equal(deck.entries[4].name, 'Fire // Ice');
});
test('merges repeated cards but preserves separate printing requests', () => {
  const deck = parseDeck('1 Forest\n2 forest\n1 Forest (M21) 274');
  assert.equal(deck.entries.length, 2);
  assert.equal(deck.entries[0].quantity, 3);
});
test('rejects zero, fractional, negative and excessive quantities', () => {
  for (const line of ['0 Forest', '-2 Forest', '1.5 Forest', '301 Forest', '200 Forest\n101 Island']) assert.ok(parseDeck(line).errors.length, line);
});
const front = { name: 'Test', printed_name: 'Test DE', image_uris: { png: 'https://example.test/front.png' } };
const german = { ...front, id: 'de1', lang: 'de', set: 'cmm', collector_number: '396' };
const back = { name: 'Back', image_uris: { png: 'https://example.test/back.png' } };
const double = { id: 'dfc', lang: 'de', card_faces: [front, back] };
test('prefers requested German edition and collector number', () => {
  const other = { ...german, id: 'de2', collector_number: '999' };
  assert.equal(preferredPrinting([other, german], { set: 'cmm', collector: '396' }).id, 'de1');
  assert.equal(preferredPrinting([], {}), null);
});
test('a printed split card stays one image; double-faced cards have two', () => {
  assert.equal(faces({ ...front, card_faces: [front, back] }).length, 1);
  assert.equal(faces(double).length, 2);
});
test('prints exact quantities, optional backs, and excludes unresolved cards', () => {
  const rows = [{ quantity: 2, options: [double], selected: 'dfc' }, { quantity: 4, options: [], selected: null }];
  assert.equal(printItems(rows, true).length, 4);
  assert.equal(printItems(rows, false).length, 2);
  assert.equal(printItems(rows, true)[1].url, back.image_uris.png);
});
test('paginates without an extra blank sheet', () => {
  assert.deepEqual(pages([]), []);
  assert.equal(pages(Array(9).fill(front)).length, 1);
  assert.deepEqual(pages(Array(19).fill(front)).map(page => page.length), [9, 9, 1]);
});
