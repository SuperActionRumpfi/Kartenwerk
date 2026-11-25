# Kartenwerk development

Kartenwerk is a static browser application. There is no bundled card database, catalogue generator or catalogue refresh task. `dist/live.js` resolves names directly through the Scryfall API, using combined German-first searches and optional English fallback for missing German matches. Specific printing hints and ambiguous tokens are checked separately. All result pages are consumed; alternative editions load on demand.

Successful API responses are cached in the browser for 24 hours. This small response cache is not a maintained card database. Saved decks and print settings remain at the same origin; old lookup-mode preferences are ignored. Images still load from Scryfall. Network failures do not count as missing German cards.

Requests are spaced by one second; 429 responses trigger at least 30 seconds of backoff or the longer Retry-After value. Cancellation and request timeouts remain available. Scryfall's official guidance at https://scryfall.com/docs/api/rate-limits recommends bulk data for rapid card-name lookups or large image-resolution workloads; this implementation does not represent an exemption or approval from Scryfall.

## Run and check

Serve `dist` over HTTP (for example START-WINDOWS.cmd), or use your static server. Node.js 24: `npm ci`, `npm test`, `npm run deploy:check`. No Python or database build is required.

GitHub Actions runs `scripts/remove-catalogue.cjs` before checks and deployment so obsolete catalogue files left by additive browser uploads are excluded from deployment. It also removes retired catalogue tests from the runner. It does not commit deletions back to GitHub. Delete the paths listed in that script from the repository to finish source cleanup; previous Git history is retained.

The workflow stamps the actual GITHUB_SHA into an HTML comment before deploying the existing kartenwerk Worker. Local fonts, SEO text/metadata, the advanced sample, 63 × 88 mm sizing and full-sheet cutting guides are preserved.
