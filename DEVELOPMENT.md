# Kartenwerk: German card catalogue

The website now matches English and German card names using a static catalogue generated from Scryfall bulk data. Normal catalogue searches do not call the Scryfall API. Images still load from Scryfall's image service. Live API lookup remains a selectable fallback.

## Put it on Cloudflare

Extract `kartenwerk-catalogue-site.zip` and upload **all its contents**, including `index.html`, JavaScript, CSS, and the complete `data` folder, as a new deployment of your existing website. Uploading only the HTML no longer suffices. The site requires static hosting only: no Functions, Worker server logic, database binding, API key, or paid storage service.

Existing deck lists in browser storage remain available at the same website origin. English fallback is opt-in. Cards with no usable German image are identified separately from catalogue loading failures. Editions are selected from catalogue data. A missing alias means it was absent from this catalogue snapshot, not proof the card does not exist.

The names index and a default-printing index are loaded once. Alternative editions are fetched only when requested, or when an input line specifies an edition. Up to four catalogue sections load concurrently. Completed cards appear progressively. The current names index is about 4.3 MiB and the default-printing index about 20.7 MiB uncompressed; hosting compression reduces transfer size. The full data directory is about 101 MiB uncompressed, but normal deck lookup does not download every file. Files carry a versioned path so browser caching cannot mix catalogue versions. Only metadata and image links are hosted, not card pictures. First-load performance depends on catalogue downloads and network speed.

## Local testing on Windows

Install Python 3 if needed, then double-click `START-WINDOWS.cmd` in the source package and open http://localhost:8000. For catalogue mode, open over HTTP rather than double-clicking an HTML file. The source package must contain the generated `dist/data` folder or you must build it first.

## Refresh the catalogue

Python 3.12 or newer, no extra packages:

```
python scripts/build_catalogue.py --output dist/data
```

This downloads Scryfall's `all_cards` export (currently hundreds of megabytes compressed) and streams it into a temporary SQLite database, retaining English/German paper cards, exact name mappings, usable printings, and image URLs. It supports compressed JSON Lines and older JSON arrays. The full export and temporary database are deleted after building. A failed build does not replace the previous manifest. Upload the refreshed site including its data directory afterwards. Avoid running the builder repeatedly; weekly refresh is enough for a playgroup.

To build from an already downloaded export:

```
python scripts/build_catalogue.py --input all-cards.jsonl.gz --output dist/data
```

`.github/workflows/catalogue.yml` provides a manual and weekly GitHub Actions build. If you put the source in your own GitHub repository, the run produces a `kartenwerk-website` artifact ready for upload. It does not automatically deploy to Cloudflare. No account or repository has been created by this work.

## Checks

```
python -m unittest discover -s tests -p "*_test.py"
node --test --test-isolation=none tests/core.test.cjs tests/catalogue.test.cjs tests/rate-limit.test.cjs
```

Independent fan project. Not endorsed by Wizards of the Coast or Scryfall. Users and hosts remain responsible for applicable usage terms and image rights.


## Search metadata (9 November 2026)

The initial HTML includes a descriptive title, summary, canonical URL, application structured data and a visible printing FAQ. robots.txt references sitemap.xml. Keep the Google verification HTML and social-preview.png in deployments. Change all absolute metadata and sitemap URLs together if moving hosts. See SEO-REVIEW.md in the source package for the comparison and limitations.


## Token and emblem examples (9 November 2026)

The bundled catalogue already contains Robot and other token printings. Lookup now uses an explicit set code and collector number to distinguish different token identities sharing a name. For example, `2 Robot (T40K) 23` selects the 3/3 Robot, while `1 Treasure (TSPM) 7` selects that Treasure printing. If a name remains ambiguous, the app asks for a set and number rather than choosing another token. English-only tokens/emblems require the English fallback checkbox. The optional live mode also checks explicit set/collector inputs before its name search.

The example button now demonstrates two simple cards, Robot and Treasure tokens, Wrenn and Six and Teferi emblems, Mystical Archive Lightning Bolt (STA 42), and a Kamigawa: Neon Dynasty land (NEO 291). Comments in the example explain each input. All eight entries (nine copies) resolve in the bundled catalogue with English fallback enabled. The card database snapshot itself has not been refreshed; these entries were already present.
