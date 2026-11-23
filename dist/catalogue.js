(function(root) {
  'use strict';
  class Catalogue {
    constructor(base = './data/') {
      this.base = base; this.documents = new Map();
    }
    async json(path, signal) {
      if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      if (this.documents.has(path)) return this.documents.get(path);
      const response = await fetch(this.base + path, {signal, cache: path === 'manifest.json' ? 'no-cache' : 'default'});
      if (!response.ok) throw new Error(`Katalogdatei konnte nicht geladen werden (${response.status}).`);
      const data = await response.json();
      if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      this.documents.set(path, data); return data;
    }
    async open(signal) {
      // Recheck the tiny manifest once per scan; versioned data stays cached.
      this.documents.delete('manifest.json');
      const manifest = await this.json('manifest.json', signal);
      if (manifest.schema !== 1 || manifest.shards !== 64 || !/^[a-f0-9]{16}$/.test(manifest.version)) throw new Error('Nicht unterstütztes Katalogformat.');
      const names = await this.json(manifest.version + '/names.json', signal);
      return {manifest, names};
    }
    async editions(row, signal) {
      const bucket = Catalogue.bucket(row._oracle);
      const groups = await this.json(`${row._catalogueVersion}/${String(bucket).padStart(2, '0')}.json`, signal);
      return (groups[row._oracle] || []).filter(card => card.lang === (row.fallback ? 'en' : 'de'));
    }
    static bucket(oracle) {
      return Array.from(oracle).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 64;
    }
    async resolveAll(entries, allowEnglish, signal, onRow, onProgress) {
      const {manifest, names} = await this.open(signal);
      const defaults = manifest.defaults ? await this.json(manifest.version + '/defaults.json', signal) : null;
      const result = (entry, oracle, cards, expanded) => {
        let options = cards.filter(card => card.lang === 'de');
        const fallback = !options.length && allowEnglish;
        if (fallback) options = cards.filter(card => card.lang === 'en');
        const selected = Kartenwerk.preferredPrinting(options, entry);
        return {...entry, options, selected: selected?.id || null, fallback: !!fallback, state: selected ? 'ready' : 'missing', _oracle: oracle, _catalogueVersion: manifest.version, _editionsLoaded: expanded, mismatch: !!(selected && entry.set && (selected.set !== entry.set || (entry.collector && selected.collector_number !== entry.collector))), error: selected ? null : allowEnglish ? 'Keine deutsche oder englische Papierdruckversion mit verfügbarem Bild im Katalog.' : 'Keine deutsche Papierdruckversion mit verfügbarem Bild im Katalog.'};
      };
      const jobs = new Map();
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        let ids = Object.prototype.hasOwnProperty.call(names, Kartenwerk.normalize(entry.name)) ? names[Kartenwerk.normalize(entry.name)] : [];
        // Tokens often share a name but have different rules and oracle IDs.
        // Resolve an explicit printing across every identity before name ranking.
        if (ids.length > 1 && entry.set) {
          const matching = [];
          for (const id of ids) {
            const bucket = Catalogue.bucket(id);
            const groups = await this.json(`${manifest.version}/${String(bucket).padStart(2, '0')}.json`, signal);
            if ((groups[id] || []).some(card => card.set === entry.set && (!entry.collector || card.collector_number === entry.collector))) matching.push(id);
          }
          if (matching.length) ids = matching;
          else {
            onRow(index, {...entry, options: [], selected: null, state: 'missing', error: 'Keine eindeutige Druckversion für diesen Namen und diese Set-Angabe gefunden. Set-Code und Sammlernummer prüfen.'});
            continue;
          }
        }
        if (ids.length > 1 && defaults && !entry.set) {
          const key = Kartenwerk.normalize(entry.name);
          const exact = ids.filter(id => defaults[id] && [defaults[id].name, defaults[id].printed_name].filter(Boolean).some(name => Kartenwerk.normalize(name) === key));
          if (exact.length) ids = exact;
        }
        if (ids.length !== 1) {
          onRow(index, {...entry, options: [], selected: null, state: 'missing', error: ids.length ? 'Name ist mehrdeutig (z. B. verschiedene Token). Bitte Set-Code und Sammlernummer ergänzen, etwa Robot (T40K) 23.' : 'Nicht im Katalog gefunden. Schreibweise prüfen; neue Karten benötigen ein Katalogupdate.'});
          continue;
        }
        if (defaults && !entry.set) {
          onRow(index, result(entry, ids[0], defaults[ids[0]] ? [defaults[ids[0]]] : [], false));
          continue;
        }
        const bucket = Catalogue.bucket(ids[0]);
        if (!jobs.has(bucket)) jobs.set(bucket, []);
        jobs.get(bucket).push({index, entry, oracle: ids[0]});
      }
      const queue = [...jobs]; let done = 0;
      const worker = async () => {
        while (queue.length) {
          if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
          const [bucket, targets] = queue.shift();
          const groups = await this.json(`${manifest.version}/${String(bucket).padStart(2, '0')}.json`, signal);
          for (const {index, entry, oracle} of targets) {
            const cards = groups[oracle] || [];
            onRow(index, result(entry, oracle, cards, true));
          }
          done++; onProgress?.(done, jobs.size);
        }
      };
      const results = await Promise.allSettled(Array.from({length: Math.min(4, jobs.size)}, worker));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      return manifest;
    }
  }
  root.KartenwerkCatalogue = Catalogue;
  if (typeof module !== 'undefined' && module.exports) module.exports = Catalogue;
})(globalThis);
