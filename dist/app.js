'use strict';
(() => {
  const { parseDeck, faces, printItems, pages } = Kartenwerk;
  const $ = id => document.getElementById(id);
  let rows = [], controller = null, busy = false, printing = false, dirty = false;
  const live = new ScryfallLive({report: text => notice(text)});
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
  function setBusy(value) { busy = value; for (const id of ['deck', 'fallback', 'resolve', 'example', 'import']) $(id).disabled = value; $('progress').hidden = !value; $('print').disabled = value || dirty || !printItems(rows, $('backs').checked).length; }
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
              controller = new AbortController(); setBusy(true); render();
              const options = await live.editions(row, controller.signal);
              if (rows !== snapshot) return;
              row.options = options; row._editionsLoaded = true; render();
            } catch (error) { notice(error.name === 'AbortError' ? 'Laden der Editionen abgebrochen.' : error.message); }
            finally { controller = null; setBusy(false); render(); }
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
      await live.resolveAll(parsed.entries, $('fallback').checked, controller.signal,
        (index, row) => { rows[index] = row; completed++; $('progress-bar').value = completed; render(); },
        message => { $('progress-text').textContent = message; });
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
