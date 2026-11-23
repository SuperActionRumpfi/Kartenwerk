'use strict';
(() => {
  const { parseDeck, normalize, faces, preferredPrinting, printItems, pages } = Kartenwerk;
  const $ = id => document.getElementById(id);
  let rows = [], controller = null, busy = false, printing = false, dirty = false, lastRequest = 0;
  const cache = new Map();
  const catalogue = new KartenwerkCatalogue();
  const example = [
    '# Zwei einfache Karten: englischer und deutscher Name',
    '1 Sol Ring',
    '1 Befehlsturm',
    '',
    '# Token: Set + Nummer unterscheiden gleichnamige Varianten',
    '2 Robot (TPIP) 16',
    '1 Treasure (TSPM) 7',
    '',
    '# Planeswalker-Embleme separat hinzufügen',
    '1 Wrenn and Six Emblem',
    '1 Teferi, Hero of Dominaria Emblem',
    '',
    '# Sonderdruck und besonderes Land',
    '1 Lightning Bolt (STA) 42',
    '1 Forest (NEO) 291',
    '',
    '# Token und Embleme benötigen hier Englisch als Ersatz.'
  ].join('\n');
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function notice(message, success = false) { $('notice').textContent = message; $('notice').className = 'notice' + (success ? ' success' : ''); $('notice').hidden = !message; }
  function save() { try { localStorage.setItem('kartenwerk-deck', $('deck').value); localStorage.setItem('kartenwerk-settings', JSON.stringify({ fallback: $('fallback').checked, paper: $('paper').value, backs: $('backs').checked, guides: $('guides').checked })); } catch {} }
  function inputCount() { const { total } = parseDeck($('deck').value); $('input-count').textContent = `${total} ${total === 1 ? 'Karte' : 'Karten'}`; }
  function changed() { save(); inputCount(); dirty = true; if (rows.length) { $('print').disabled = true; notice('Die Liste oder Spracheinstellung wurde geändert. Bitte „Deutsche Karten finden“ erneut anklicken.'); } }
  function setBusy(value) { busy = value; for (const id of ['deck', 'fallback', 'resolve', 'example', 'import', 'lookup-mode']) $(id).disabled = value; $('progress').hidden = !value; $('print').disabled = value || dirty || !printItems(rows, $('backs').checked).length; }
  function delay(ms, signal) { return new Promise((resolve, reject) => { if (signal?.aborted) return reject(new DOMException('Abgebrochen', 'AbortError')); const stop = () => { clearTimeout(timer); reject(new DOMException('Abgebrochen', 'AbortError')); }; const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms); signal?.addEventListener('abort', stop, { once: true }); }); }
async function request(path, signal) {
  const url = "https://api.scryfall.com" + path;
  const sleep = typeof pause === "function" ? pause : delay;
  const report = text => {
    if (typeof status === "function") status(text);
    else if (typeof notice === "function") notice(text);
  };
  if (signal.aborted) throw new DOMException("Abgebrochen", "AbortError");
  if (cache.has(url)) return cache.get(url);

  for (let attempt = 0; attempt < 4; attempt++) {
    let until = request.nextAt || 0;
    try {
      until = Math.max(until, Number(localStorage.getItem("kartenwerk-api-pause")) || 0);
    } catch {}
    await sleep(Math.max(0, until - Date.now()), signal);
    const controller = new AbortController();
    const stop = () => controller.abort();
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) controller.abort();
    let timedOut = false, response;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
    } catch (error) {
      if (signal.aborted) throw new DOMException("Abgebrochen", "AbortError");
      throw new Error(timedOut
        ? "Scryfall antwortet nicht innerhalb von 20 Sekunden."
        : "Scryfall-Verbindung fehlgeschlagen: " + error.message);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      request.nextAt = Date.now() + 1000;
    }

    if (response.status === 429 || response.status >= 500) {
      const header = response.headers.get("Retry-After");
      let retryMs = 0;
      if (header !== null) {
        const seconds = Number(header);
        retryMs = Number.isFinite(seconds)
          ? seconds * 1000 : Date.parse(header) - Date.now();
      }
      const waitMs = Math.max(15000 * 2 ** attempt, retryMs || 0);
      request.nextAt = Date.now() + waitMs;
      try {
        localStorage.setItem("kartenwerk-api-pause", String(request.nextAt));
      } catch {}
      if (attempt === 3) {
        const error = new Error("Scryfall lehnt weitere Anfragen ab (HTTP " +
          response.status + "). Suche pausiert; Karten sind nicht als fehlend bestätigt. " +
          "Bitte später erneut versuchen.");
        error.rateLimited = true;
        throw error;
      }
      report("Scryfall meldet HTTP " + response.status + ". Die gesamte Suche " +
        "wartet mindestens " + Math.ceil(waitMs / 1000) + " Sekunden. " +
        "Danach wird dieselbe Anfrage wiederholt. Abbrechen bleibt möglich.");
      continue;
    }
    if (response.status === 404) {
      cache.set(url, null);
      return null;
    }
    if (!response.ok) throw new Error("Scryfall meldet HTTP " + response.status);
    const data = await response.json();
    cache.set(url, data);
    return data;
  }
}

  async function search(query, signal) {
    const data = await request(`/cards/search?${new URLSearchParams({ q: query, unique: 'prints', order: 'released', dir: 'desc' })}`, signal);
    return (data?.data || []).filter(card => faces(card).length);
  }
  async function resolve(entry, signal) {
    let canonical = null;
    if (entry.set && entry.collector) {
      const printing = await request(`/cards/${encodeURIComponent(entry.set)}/${encodeURIComponent(entry.collector)}`, signal);
      if (printing && [printing.name, printing.printed_name, ...(printing.card_faces || []).flatMap(face => [face.name, face.printed_name])].filter(Boolean).some(name => normalize(name) === normalize(entry.name))) canonical = printing;
    }
    if (!canonical) canonical = await request(`/cards/named?${new URLSearchParams({ exact: entry.name })}`, signal);
    if (!canonical) {
      const escaped = entry.name.replace(/["\\]/g, ' ');
      const candidates = await search(`lang:de game:paper "${escaped}"`, signal);
      canonical = candidates.find(card => [card.name, card.printed_name, ...(card.card_faces || []).flatMap(face => [face.name, face.printed_name])].filter(Boolean).some(name => normalize(name) === normalize(entry.name)));
      if (!canonical) return { ...entry, options: [], selected: null, error: 'Karte nicht gefunden. Namen und Schreibweise prüfen.' };
    }
    if (!canonical.oracle_id) return { ...entry, options: [], selected: null, error: 'Für diese Karte ist keine eindeutige Zuordnung verfügbar.' };
    let options = await search(`oracleid:${canonical.oracle_id} lang:de game:paper`, signal);
    let fallback = false;
    if (!options.length && $('fallback').checked) {
      options = await search(`oracleid:${canonical.oracle_id} lang:en game:paper`, signal);
      fallback = true;
    }
    const selected = preferredPrinting(options, entry);
    const mismatch = selected && entry.set && (selected.set !== entry.set || (entry.collector && selected.collector_number !== entry.collector));
    return { ...entry, options, selected: selected?.id || null, fallback, mismatch, error: selected ? null : 'Keine deutsche Druckversion mit Bild gefunden.' };
  }
  function cardFor(row) { return row.options.find(card => card.id === row.selected); }
  function render() {
    $('empty').hidden = rows.length > 0; $('results').hidden = rows.length === 0;
    $('results').replaceChildren();
    for (const row of rows) {
      const article = el('article', 'result-card'), card = cardFor(row);
      if (card) {
        const box = el('div', 'card-image'), img = el('img');
        img.src = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || faces(card)[0].url; img.alt = card.printed_name || card.name; img.loading = 'lazy';
        img.addEventListener('error', () => { box.replaceChildren(el('span', 'error-label', 'Bild nicht geladen. Bitte erneut suchen.')); });
        box.append(img, el('span', 'quantity', `${row.quantity}×`)); article.append(box);
        article.append(el('h3', '', card.printed_name || card.name));
        const meta = el('p', 'card-meta'); meta.append(el('span', `language${card.lang !== 'de' ? ' en' : ''}`, card.lang === 'de' ? '● Deutsch' : '● Englisch · Ersatz'), document.createTextNode(` · ${row.quantity}×`)); article.append(meta);
        const select = el('select'); select.setAttribute('aria-label', `Edition für ${row.name}`);
        for (const option of row.options) { const item = el('option', '', `${option.set.toUpperCase()} · ${option.set_name} #${option.collector_number}`); item.value = option.id; item.selected = row.selected === option.id; select.append(item); }
        select.disabled = busy || printing;
        select.addEventListener('change', () => { row.selected = select.value; row.mismatch = false; notice(''); render(); }); article.append(select);
        if (row._oracle && !row._editionsLoaded && !busy && !printing) {
          const more = el('button', 'retry-button', 'Weitere Editionen laden');
          more.type = 'button';
          more.addEventListener('click', async () => {
            more.disabled = true; more.textContent = 'Editionen laden …';
            const snapshot = rows;
            try {
              const options = await catalogue.editions(row, new AbortController().signal);
              if (rows !== snapshot) return;
              row.options = options; row._editionsLoaded = true; render();
            } catch (error) { more.disabled = false; more.textContent = 'Erneut versuchen'; notice(error.message); }
          });
          article.append(more);
        }
        if (row.mismatch) article.append(el('p', 'error-label', 'Gewünschte Edition nicht verfügbar. Alternative gewählt.'));
        if (faces(card).length > 1) article.append(el('p', 'card-meta', '↔ Doppelseitige Karte'));
      } else {
        article.append(el('div', 'card-missing', row.error || 'Wird gesucht …'), el('h3', '', `${row.quantity}× ${row.name}`));
      }
      $('results').append(article);
    }
    updateSummary();
  }
  function updateSummary() {
    const ready = rows.filter(row => cardFor(row)).reduce((sum, row) => sum + row.quantity, 0), total = rows.reduce((sum, row) => sum + row.quantity, 0);
    $('result-badge').textContent = total ? `${ready} von ${total} Karten gefunden` : 'Bereit, wenn du es bist';
    const items = printItems(rows, $('backs').checked);
    $('print-summary').textContent = items.length ? `${ready} Karten · ${items.length} Kartenseiten · ${Math.ceil(items.length / 9)} Druckbogen · 63 × 88 mm` : '9 Karten pro Seite. In Originalgröße und mit Schnittlinien.';
    $('print').disabled = busy || printing || dirty || !items.length;
  }
  $('deck').addEventListener('input', changed);
  $('fallback').addEventListener('change', changed);
  $('lookup-mode').addEventListener('change', changed);
  $('example').addEventListener('click', () => { if ($('deck').value.trim() && !confirm('Aktuelle Deckliste durch das Beispieldeck ersetzen?')) return; $('deck').value = example; changed(); $('deck').focus(); });
  $('import').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 100000) { notice('Bitte eine Textdatei mit höchstens 100 KB auswählen.'); event.target.value = ''; return; }
    if ($('deck').value.trim() && !confirm('Aktuelle Deckliste durch die Datei ersetzen?')) { event.target.value = ''; return; }
    try { $('deck').value = await file.text(); changed(); } catch { notice('Die Datei konnte nicht gelesen werden. Bitte eine Textdatei verwenden.'); }
    event.target.value = '';
  });
  $('cancel').addEventListener('click', () => controller?.abort());
  $('resolve').addEventListener('click', async () => {
    if (busy) return;
    const parsed = parseDeck($('deck').value);
    if (parsed.errors.length || !parsed.entries.length) { notice(parsed.errors.join('\n') || 'Bitte zuerst eine Deckliste einfügen oder das Beispieldeck laden.'); return; }
    controller = new AbortController(); dirty = false; rows = parsed.entries.map(entry => ({ ...entry, options: [], selected: null, error: 'Noch nicht gesucht.' })); notice(''); setBusy(true); render(); $('progress-bar').max = parsed.entries.length; $('progress-bar').value = 0;
    let completed = 0, stopped = false;
    try {
      if ($('lookup-mode').value === 'catalogue') {
        $('progress-text').textContent = 'Katalog laden und Deck zuordnen …';
        try {
          const manifest = await catalogue.resolveAll(parsed.entries, $('fallback').checked, controller.signal,
            (index, row) => { rows[index] = row; completed++; $('progress-bar').value = completed; render(); },
            (done, total) => { $('progress-text').textContent = `Katalogpakete: ${done} / ${total}`; });
          const date = manifest.source_updated_at || manifest.generated_at;
          $('catalogue-info').textContent = `Scryfall-Katalog vom ${new Date(date).toLocaleDateString('de-DE')}. Deutsche Druckversionen und erlaubte englische Ersatzkarten werden lokal zugeordnet.`;
        } catch (error) {
          if (error.name === 'AbortError') throw error;
          throw new Error('Katalog nicht vollständig verfügbar. Bitte die Website inklusive des erzeugten data-Ordners hochladen. Alternativ „Scryfall live · langsam“ wählen. Details: ' + error.message);
        }
      } else {
        for (const entry of parsed.entries) {
          $('progress-text').textContent = `${completed + 1} / ${parsed.entries.length} · ${entry.name}`;
          rows[completed] = await resolve(entry, controller.signal); completed++; $('progress-bar').value = completed; render();
        }
      }
    } catch (error) { stopped = true; notice(error.name === 'AbortError' ? `Suche abgebrochen. ${completed} von ${parsed.entries.length} Einträgen verarbeitet. Eine neue Suche beginnt mit der vollständigen Liste.` : error.message); }
    finally { controller = null; setBusy(false); render(); }
    if (!stopped) {
      const missing = rows.filter(row => !row.selected).reduce((sum, row) => sum + row.quantity, 0), english = rows.filter(row => row.fallback && row.selected).reduce((sum, row) => sum + row.quantity, 0);
      notice(missing ? `${missing} Karte(n) konnten nicht zugeordnet werden. Bitte Namen prüfen oder bei fehlenden deutschen Versionen Englisch als Ersatz erlauben. Beim Drucken kannst du diese Karten ausdrücklich überspringen.` : `Dein Deck ist bereit.${english ? ` ${english} Karte(n) verwenden einen englischen Ersatz.` : ' Alle Karten wurden auf Deutsch gefunden.'}`, !missing);
    }
  });
  for (const id of ['paper', 'backs', 'guides']) $(id).addEventListener('change', () => { save(); updateSummary(); });
  $('print').addEventListener('click', async () => {
    if (busy || printing || dirty) return;
    const missing = rows.filter(row => !cardFor(row)).reduce((sum, row) => sum + row.quantity, 0);
    if (missing && !confirm(`${missing} Karte(n) fehlen. Nur die gefundenen Karten drucken und fehlende Karten überspringen?`)) return;
    const items = printItems(rows, $('backs').checked); if (!items.length) return;
    printing = true; updateSummary(); $('print').textContent = 'Bilder werden geladen …'; notice('Die Druckbilder werden vorbereitet. Bitte dieses Fenster geöffnet lassen.');
    try {
      $('page-style').textContent = $('paper').value === 'letter' ? '@page { size: letter portrait; margin: 0; }' : '@page { size: A4 portrait; margin: 0; }';
      $('print-sheets').className = [ $('guides').checked ? 'cut-lines' : '', $('paper').value === 'letter' ? 'paper-letter' : '' ].filter(Boolean).join(' '); $('print-sheets').replaceChildren();
      const waiting = [];
      for (const page of pages(items)) {
        const sheet = el('div', 'print-sheet');
        for (const item of page) {
          const cell = el('div', 'print-cell'), img = el('img', 'print-image'); img.alt = item.name;
          waiting.push(new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Das Druckbild für „${item.name}“ braucht zu lange. Bitte erneut versuchen.`)), 45000);
            img.onload = () => { clearTimeout(timer); resolve(); }; img.onerror = () => { clearTimeout(timer); reject(new Error(`Das Druckbild für „${item.name}“ konnte nicht geladen werden. Bitte erneut versuchen.`)); }; img.src = item.url;
          }));
          cell.append(img); sheet.append(cell);
        }
        $('print-sheets').append(sheet);
      }
      await Promise.all(waiting);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      notice('Druckbogen bereit. Im Druckdialog 100 % / tatsächliche Größe wählen und Kopf- und Fußzeilen ausschalten.', true);
      window.print();
    } catch (error) { notice(error.message); $('print-sheets').replaceChildren(); }
    finally { printing = false; $('print').replaceChildren(document.createTextNode('Drucken / PDF '), el('span', '', '↗')); updateSummary(); }
  });
  $('deck').value = example;
  try {
    const savedDeck = localStorage.getItem('kartenwerk-deck');
    const legacyExample = '1 Sol Ring\n1 Command Tower\n1 Arcane Signet\n2 Lightning Bolt\n4 Forest';
    if (savedDeck && savedDeck.trim() && savedDeck.trim() !== legacyExample) $('deck').value = savedDeck;
    const settings = JSON.parse(localStorage.getItem('kartenwerk-settings') || 'null');
    if (settings) { $('fallback').checked = !!settings.fallback; $('paper').value = settings.paper === 'letter' ? 'letter' : 'a4'; $('backs').checked = settings.backs !== false; $('guides').checked = settings.guides !== false; }
  } catch {}
  inputCount();
})();
