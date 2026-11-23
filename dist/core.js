(function (root) {
  'use strict';
  const MAX_CARDS = 300;
  const normalize = value => value.normalize('NFC').trim().toLocaleLowerCase('de');
  function parseDeck(text) {
    const entries = [], errors = [];
    let total = 0;
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      let line = raw.trim();
      if (!line || /^(#|\/\/)/.test(line) || /^(deck|mainboard|sideboard|commander|companion|maybeboard|deckliste|hauptdeck|commanders|sideboard:|commander:)$/i.test(line)) continue;
      line = line.replace(/^SB:\s*/i, '');
      const count = line.match(/^(\d+)\s*x?\s+(.+)$/i) || line.match(/^(\d+)x\s*(.+)$/i);
      let quantity = count ? Number(count[1]) : 1;
      line = count ? count[2] : line;
      line = line.replace(/\s+\*[FE]\*\s*$/i, '').replace(/\s+\[[^\]]*\]\s*$/, '').replace(/\s+#.*$/, '').trim();
      let set = null, collector = null;
      const printing = line.match(/\s+\(([a-z0-9]{2,8})\)(?:\s+([a-z0-9★-]+))?\s*$/i);
      if (printing) { set = printing[1].toLowerCase(); collector = printing[2] || null; line = line.slice(0, printing.index).trim(); }
      if (!line || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CARDS || /^[-+]?\d+(?:\.\d+)?\s/.test(line)) {
        errors.push(`Zeile ${index + 1}: Bitte eine Anzahl von 1 bis ${MAX_CARDS} und einen Kartennamen angeben.`); continue;
      }
      total += quantity;
      const key = [normalize(line), set || '', collector || ''].join('|');
      const existing = entries.find(entry => entry.key === key);
      if (existing) existing.quantity += quantity;
      else entries.push({ key, name: line, quantity, set, collector, line: index + 1 });
    }
    if (total > MAX_CARDS) errors.push(`Bitte höchstens ${MAX_CARDS} Karten pro Druckauftrag verwenden (aktuell ${total}).`);
    return { entries, total, errors };
  }
  function faces(card) {
    if (card.image_uris) return [{ name: card.printed_name || card.name, url: card.image_uris.png || card.image_uris.large || card.image_uris.normal }];
    return (card.card_faces || []).filter(face => face.image_uris).map(face => ({ name: face.printed_name || face.name, url: face.image_uris.png || face.image_uris.large || face.image_uris.normal }));
  }
  function preferredPrinting(cards, entry) {
    const usable = cards.filter(card => faces(card).length && card.lang === cards[0]?.lang);
    return usable.find(card => card.set === entry.set && (!entry.collector || card.collector_number === entry.collector)) || usable.find(card => card.set === entry.set) || usable[0] || null;
  }
  function printItems(rows, includeBacks) {
    return rows.flatMap(row => {
      const card = row.options?.find(option => option.id === row.selected);
      if (!card) return [];
      const images = faces(card);
      return Array.from({ length: row.quantity }, () => includeBacks ? images : images.slice(0, 1)).flat();
    });
  }
  function pages(items) {
    const output = [];
    for (let index = 0; index < items.length; index += 9) output.push(items.slice(index, index + 9));
    return output;
  }
  const api = { MAX_CARDS, normalize, parseDeck, faces, preferredPrinting, printItems, pages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Kartenwerk = api;
})(globalThis);
