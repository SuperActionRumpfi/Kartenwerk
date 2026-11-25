# Connect Kartenwerk to GitHub deployments

Repository: https://github.com/SuperActionRumpfi/Kartenwerk
Existing Cloudflare Worker: `kartenwerk`
Live site: https://kartenwerk.manuel-rumpfhuber.workers.dev/

This package is repository source, not a Cloudflare dashboard-upload ZIP. Do not upload the repository ZIP through Cloudflare's static-file uploader.

## 1. Add the Cloudflare credentials to GitHub

1. In Cloudflare, open Workers & Pages > kartenwerk > Settings > Builds.
2. Use Create token under API token for external CI/CD. Restrict deployment access to this Worker if the dialog offers it. Alternatively use Cloudflare's Edit Cloudflare Workers token template, scoped to the account containing kartenwerk.
3. Copy the token directly into GitHub; do not put it in a file, README, screenshot or chat.
4. Open https://github.com/SuperActionRumpfi/Kartenwerk/settings/secrets/actions .
5. Choose New repository secret. Name: `CLOUDFLARE_API_TOKEN`. Value: the token.
6. Find the Cloudflare account ID in your account's Workers & Pages overview. Copy the account ID, not the Worker version ID or a zone ID.
7. Add a second repository secret named `CLOUDFLARE_ACCOUNT_ID` with that value.

## 2. Upload the repository files

1. Extract the repository ZIP locally.
2. Open https://github.com/SuperActionRumpfi/Kartenwerk .
3. Choose Add file > Upload files.
4. Drag the CONTENTS of the extracted folder into the upload area, preserving folders. The repository root must contain `wrangler.jsonc`, `package.json`, `package-lock.json`, `.github`, `dist`, `scripts` and `tests`. Do not nest everything inside another kartenwerk folder. Include dotfiles such as `.github` and `.gitignore`.
5. Commit to main. This updates the existing README with its current text plus deployment links.
6. If browser upload limits interfere, upload in batches, or use GitHub Desktop to clone the repository and commit the files. No catalogue files are needed.

## 3. Verify the first deployment

1. Open https://github.com/SuperActionRumpfi/Kartenwerk/actions .
2. Select Test and deploy Kartenwerk, then the newest run.
3. `checks` must pass before `deploy` runs. Pull requests run checks but never deploy.
4. The deployment uses the existing Worker name kartenwerk and the Cloudflare account ID secret. Confirm that the deployment output names the existing workers.dev address. There is no GitHub Pages site to enable.
5. Check homepage = 200; /index.html = 301 with Location /; robots.txt and sitemap.xml still load. In Cloudflare, confirm Observability is enabled after deployment.
6. If the first run happened before secrets were added, add the secrets and use Re-run all jobs, or Actions > Test and deploy Kartenwerk > Run workflow > main.

## Future updates

Commit site changes to main. GitHub runs tests, validates the Wrangler configuration and deploys automatically. Use a branch/pull request if you want checks before changing production. Do not also connect Cloudflare Builds to the same repository: choose this GitHub Actions workflow to avoid duplicate deployments.

`wrangler.jsonc` declares the static asset directory, HTML/missing-page handling, existing Worker name, and observability settings. `_redirects` supplies the permanent homepage redirect. The deployment workflow removes retired catalogue files from its checkout before tests and deployment. This does not commit deletions back to GitHub.

The site remains static-assets-only. Enabling Worker logs does not guarantee logs for directly served static assets. No extra Worker code is introduced to force request logging. This migration does not guarantee Google indexing.

## Local commands (optional)

Install Node.js 24, then run `npm ci`, `npm test`, and `npm run deploy:check`. To deploy from a local machine, run `npx wrangler login` then `npm run deploy`. Do not commit account credentials.

## Rollback

Use Cloudflare's deployment rollback/history for the previous version if needed. Do not delete the Worker or change the hostname. A manual static upload remains possible, but it may stop preserving the observability configuration; resume GitHub deployment to restore configuration consistency.
