# Kartenwerk

Kostenlos deutsche **Magic: The Gathering-Proxies drucken und als PDF speichern** – direkt aus einer Deckliste, ohne Anmeldung.

**[Kartenwerk öffnen](https://kartenwerk.manuel-rumpfhuber.workers.dev/)** · [GitHub Actions / Deployment prüfen](https://github.com/SuperActionRumpfi/Kartenwerk/actions)

## Aktueller Stand – 25. November 2026

- **Keine mitgelieferte Kartendatenbank mehr.** Kartennamen werden direkt bei Scryfall gesucht. Katalogdateien, Generator und Katalogtests sind entfernt; regelmäßige Datenbank-Updates entfallen.
- **Deutsch zuerst:** mehrere Namen werden in einer gemeinsamen Suchanfrage abgefragt. Nur wenn keine deutsche Version gefunden wird und du es erlaubst, werden englische Ersatzkarten gesucht. Set-/Sammlernummern und mehrdeutige Token können zusätzliche Anfragen benötigen.
- **Lokale Schriftdateien:** DM Sans und Manrope werden mit der Website ausgeliefert. Die Google-Fonts-Importkette entfällt; das übrige Stylesheet und Drucklayout bleiben erhalten.
- **SEO:** deutsche Beschreibungen, Social-Media-Vorschauen, strukturierte Daten und sichtbare Hinweise zu Token, Emblemen, Editionen und PDF-Druck. Anleitung und FAQ stehen bereits im ursprünglichen HTML.
- **Nachvollziehbare Builds:** GitHub Actions ergänzt vor der Veröffentlichung `<!-- Kartenwerk build: COMMIT-SHA -->` im HTML-Quelltext.

## So benutzt du Kartenwerk

1. Deckliste einfügen oder eine Textdatei importieren. Englische und offizielle deutsche Namen sind möglich, eine Karte pro Zeile, höchstens 300 Karten pro Auftrag.
2. Bei Bedarf **„Englisch als Ersatz erlauben“** aktivieren. Ohne diese Option bleiben Karten ohne gefundenes deutsches Bild ungelöst.
3. **„Deutsche Karten finden“** anklicken und Bilder, Sprache und Editionen prüfen. Mit **„Weitere Editionen laden“** werden Alternativen bei Bedarf geladen.
4. Papiergröße auswählen und **„Drucken / PDF“** verwenden. Im Browser-Druckdialog **100 % / tatsächliche Größe**, dieselbe Papiergröße und keine Kopf-/Fußzeilen einstellen. Für eine Datei „Als PDF speichern“ wählen.

```text
1 Sol Ring
1 Befehlsturm
2 Robot (TPIP) 16
1 Treasure (TSPM) 7
1 Wrenn and Six Emblem
1 Teferi, Hero of Dominaria Emblem
1 Lightning Bolt (STA) 42
1 Forest (NEO) 291
```

Token und Planeswalker-Embleme müssen als eigene Zeilen angegeben werden; sie werden nicht automatisch aus den anderen Karten ergänzt. Gleichnamige Token können unterschiedliche Werte und Fähigkeiten haben: Set-Code und Sammlernummer verwenden und das Bild prüfen. Manche Token und Embleme benötigen englischen Ersatz. Ein Editionswunsch wird bevorzugt, sofern eine passende Druckversion in der gewünschten Sprache vorhanden ist; eine gewählte Alternative wird angezeigt.

Kartenseiten sind **63 × 88 mm** groß, mit bis zu neun Seiten auf A4 oder US Letter. Schnittlinien reichen über den ganzen Druckbogen. Rückseiten doppelseitiger Karten werden optional als zusätzliche Seiten zum Ausschneiden ausgegeben; es gibt keinen automatisch ausgerichteten Duplexdruck. Vor einem großen Auftrag einen Testausdruck nachmessen.

## Datensuche und Grenzen

Die Website enthält keine statische Kartenbibliothek und benötigt keinen Datenbank-Refresh. Neue Karten können gefunden werden, sobald Scryfall sie mit den erforderlichen Druck- und Bilddaten anbietet. Kartenwerk erzeugt keine Übersetzungen oder fehlenden Bilder.

Die Suche verarbeitet Antwortseiten vollständig, prüft spezifische Druckversionen und lässt mehrdeutige Namen nicht willkürlich auf eine andere Karte zeigen. Englische Ersatzabfragen betreffen nur bestätigte fehlende deutsche Treffer. Ein Verbindungsfehler wird nicht als fehlende Übersetzung behandelt.

Erfolgreiche Antworten werden **24 Stunden im Browser zwischengespeichert**; das ist ein Antwort-Cache, keine gepflegte Kartendatenbank. Zwischen Anfragen liegt eine Pause von einer Sekunde. Bei HTTP 429 wartet die Anwendung mindestens 30 Sekunden beziehungsweise länger entsprechend `Retry-After`. Suche und Editionsladen können abgebrochen werden. Verfügbarkeit und Geschwindigkeit hängen von Scryfall, dessen Limits und dem Laden der Kartenbilder ab.

**Scryfall-Hinweis:** Die [offizielle API-Richtlinie](https://scryfall.com/docs/api/rate-limits) sieht Bulk-Daten für schnelle Namensabfragen oder die Auflösung großer Mengen von Kartenbildern vor. Wenige kombinierte Anfragen sind keine Bulk-Data-Abfrage und belegen keine Ausnahme von dieser Richtlinie. Dieses Projekt hat keine besondere Freigabe von Scryfall. Bei steigender Nutzung müssen Last, Limits und die Architektur erneut bewertet werden.

Deckliste und Einstellungen werden lokal im Browser gespeichert. Die gesuchten Kartennamen werden an Scryfall gesendet; Kartenbilder kommen ebenfalls aus dem Internet. Frühere gespeicherte Decks und Druckeinstellungen bleiben unter derselben Website-Adresse erhalten. Die alte Katalog-Modus-Einstellung wird ignoriert.

## Updates und Veröffentlichung

Änderungen an Website, Tests, Skripten oder Deployment-Konfiguration auf **`main`** starten [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Pull Requests führen Prüfungen aus, veröffentlichen aber nicht. Reine README-Änderungen benötigen kein neues Deployment.

1. Der Workflow entfernt eventuell übrig gebliebene Katalogdateien aus seinem Checkout.
2. Er installiert die gesperrten Node-Abhängigkeiten und führt die Tests sowie einen Wrangler-Dry-Run aus.
3. Nur nach erfolgreichen Prüfungen ergänzt er den tatsächlichen Git-Commit als HTML-Kommentar und veröffentlicht den bestehenden Cloudflare Worker **`kartenwerk`**.

Es ist kein ZIP-Upload im Cloudflare-Dashboard und kein erneuter Datenbank-Upload erforderlich. Eine normale Veröffentlichung synchronisiert die statischen Website-Dateien über Wrangler; es gibt keinen Kartenkatalog mehr zu übertragen. Das bestehende Design, Standardbeispiel und die Druckfunktionen sind beizubehalten.

Die Repository-Secrets **`CLOUDFLARE_API_TOKEN`** und **`CLOUDFLARE_ACCOUNT_ID`** sind bereits für das Deployment vorgesehen. Werte gehören ausschließlich in GitHubs Secrets-Verwaltung, niemals in Quelltext, README oder Chat. Keine zweite automatische Cloudflare-Build-Pipeline parallel zu diesem GitHub-Workflow einrichten. Ausführliche Einrichtung: [GITHUB-SETUP.md](GITHUB-SETUP.md).

### Nach einem Update prüfen

- In GitHub Actions müssen **`checks` und `deploy` grün** sein. Bei einem Fehler den ersten fehlgeschlagenen Schritt öffnen; Warnungen allein erklären einen Fehler nicht.
- Website neu laden. Im HTML-Quelltext nach **`Kartenwerk build:`** suchen und den SHA mit dem veröffentlichten Git-Commit vergleichen.
- Ein Deck suchen, optional englischen Ersatz und weitere Editionen prüfen und einen Testdruck beziehungsweise eine PDF erstellen.
- Die Homepage, `robots.txt`, `sitemap.xml` und die Google-Verifikationsdatei müssen erreichbar bleiben. `/index.html` soll dauerhaft auf `/` umleiten. `/data/manifest.json` soll nach Entfernung des Katalogs **404** liefern.
- In Cloudflare sollte die Veröffentlichung über Wrangler/API-Token erkennbar sein. Observability ist in `wrangler.jsonc` aktiviert. Direkt ausgelieferte statische Dateien erzeugen dadurch nicht zwingend Worker-Aufruflogs.

Bei Problemen lässt sich in Cloudflares Deployment-Historie die vorherige Veröffentlichung wiederherstellen. Anschließend den fehlerhaften Code in GitHub korrigieren oder zurücksetzen, damit das nächste Deployment die Korrektur enthält. Worker und Hostname beibehalten.

## Google-Sichtbarkeit: umgesetzt und noch zu prüfen

Bereits umgesetzt: aussagekräftiger Seitentitel, deutsche Meta-Beschreibungen, Canonical auf die öffentliche Homepage, Social-Vorschau, strukturierte WebSite-/WebPage-/WebApplication-Daten, crawlbarer Haupttext mit Überschriften, Anleitung und FAQ, erlaubendes `robots.txt`, Sitemap, permanente Homepage-Weiterleitung und erhaltene Search-Console-Verifikationsdatei. Die Schriftdateien werden lokal geladen. Ein `meta keywords`-Tag ist keine sinnvolle Ergänzung für Google.

Folgende Schritte benötigen Zugriff auf die **Google Search Console**:

1. Die bestehende Property und die genaue Homepage-URL prüfen: `https://kartenwerk.manuel-rumpfhuber.workers.dev/`.
2. Die Sitemap `https://kartenwerk.manuel-rumpfhuber.workers.dev/sitemap.xml` einreichen beziehungsweise ihren Status kontrollieren.
3. In der URL-Prüfung **Live-URL testen** wählen. Im HTML der getesteten Seite nach Hauptüberschrift, Anleitung, FAQ und der Token-/Emblem-Erklärung suchen. So lässt sich prüfen, ob Google denselben wesentlichen Inhalt erhält wie Besucher.
4. Wenn die Seite erreichbar und indexierbar ist, einmal die Indexierung beantragen. Anschließend den Indexierungsbericht beobachten und konkrete Ausschlussgründe prüfen, statt wiederholt neue Anträge zu senden.
5. Nach der Veröffentlichung PageSpeed Insights erneut für Mobilgerät und Desktop messen. Die entfernte Google-Fonts-Kette ist eine technische Verbesserung; ein neuer Score wurde nicht nachgewiesen.

Relevante öffentliche Links und tatsächliche Nutzer können die Entdeckung unterstützen: etwa die Verlinkung in diesem README oder ein von den Moderatoren erlaubter Beitrag in einer passenden MTG-Community. Gruppenregeln beachten. Private Facebook-Gruppen sind kein verlässlicher Crawl-Pfad; auch öffentliche Facebook-Beiträge werden nicht garantiert indexiert. Keine gekauften Links oder massenhaften Werbeposts.

SEO verbessert Verständlichkeit und technische Zugänglichkeit. **Eine Google-Indexierung oder bestimmte Platzierung ist nicht garantiert.** Keine künstlichen Bewertungen, ungeeigneten Suchfunktionen oder Versprechen von FAQ-Rich-Results ergänzen.

## Lokal entwickeln

Node.js **24** verwenden:

```sh
npm ci
npm test
npm run deploy:check
```

`dist` mit einem statischen HTTP-Server öffnen; unter Windows kann `START-WINDOWS.cmd` mit installiertem Python verwendet werden. Python ist nur für diesen optionalen lokalen Server nötig, nicht für Suche, Tests oder Deployment. Nicht einfach `index.html` per Doppelklick öffnen. Technische Details: [DEVELOPMENT.md](DEVELOPMENT.md).

## Hinweise und Rechte

Unabhängiges Fanprojekt für private Testspiele, ohne Verbindung zu Wizards of the Coast oder Scryfall. Verwendung mit der Spielrunde absprechen; Ausdrucke ersetzen keine autorisierten Turnierkarten. Kartendaten und Bilder stammen von Scryfall, die Rechte verbleiben bei ihren Inhabern. Die lokal gelieferten Schriften enthalten ihre OFL-Lizenzen in `dist/fonts/`.
