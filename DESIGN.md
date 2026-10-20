# datapage-builder design (v1)

A hosted wizard at `datapages.github.io/datapage-builder` that takes a user from a CSV to a published datapage built from the [`datapages/datapage`](https://github.com/datapages/datapage) template.

## Scope

**v1:** create a new datapage from one CSV file (one Redivis table). Nothing else.

**Deferred to v2:**
- dataset and variable metadata (description, labels)
- moving the homepage and about-page fields into YAML
- uploading images and a logo
- a preview of the plots
- updating an existing datapage
- datasets that aren't public (they'd need a build token as a repo secret)

**Out of scope:**
- scheduled rebuilds
- gallery PRs
- private repos

## Wizard steps

| # | Step | How |
|---|---|---|
| 1 | Connect accounts | **GitHub:** OAuth App owned by the `datapages` org, scope `repo read:org`, with PKCE. A popup goes through GitHub's web flow, `callback/` posts the code back, and a Cloudflare Worker exchanges it (see [Architecture](#architecture)). **Redivis:** OAuth with PKCE in a popup, no backend or registered client (see [Redivis auth](#redivis-auth)). |
| 2 | Upload data | Pick the owner (the user or an organization; both go through `user()`), name the dataset, choose the CSV. The app calls the REST API directly (see [Redivis upload](#redivis-upload)). It warns about large files (see [Size warning](#size-warning)). |
| 3 | Create repo | `POST /repos/datapages/datapage/generate`, public, `include_all_branches: false`. The user picks the owner (themselves or one of their orgs) and the repo name. The app then waits until the repo's contents exist and turns on Pages with `build_type: workflow`. No secret is needed: the dataset is public, and the template reads it anonymously (see [Build access](#build-access)). |
| 4 | Customize | A form, committed as a single commit through the git trees API, which triggers the build. Fields: `_quarto.yml` (title, `redivis` block), `_config.yml` (numerical and categorical vars, defaults, suggested from variable metadata using the same heuristic as `_plot-prep.qmd`), `index.qmd` (title, subtitle, description), `about.qmd` (links, citation pulled from a DOI as CSL-JSON), `theme.scss` (`$primary`). |
| 5 | Publish | Poll the workflow run for the customization commit and link to its logs, with a button to re-run failed jobs. On success, show the Pages URL, set it as the repo homepage, and list next steps (replace the template images, document the dataset on Redivis, develop locally with `renv::restore()` + `quarto preview`). |

Every step can be re-run safely and first checks whether it's already done. Progress (repo, dataset, finished steps) is saved in localStorage so the wizard can resume. Tokens are kept only in sessionStorage.

### Redivis auth

`levante-datapage` signs in through the `redivis` npm package (v0.3.10). Its browser flow (`src/common/auth.js`) works like this:
1. Open a popup to `https://redivis.com/oauth/authorize` with PKCE S256 and `redirect_uri=urn:ietf:wg:oauth:2.0:oob:auto`.
2. Redivis posts `{code, state}` back to the opener with `postMessage` (the opener checks that the message comes from `redivis.com`).
3. The page exchanges the code at `https://redivis.com/oauth/token`, which allows cross-origin requests from any origin.

Because the redirect is out-of-band, no redirect URI has to be registered, and it works from any origin. The package hardcodes `scope=data.data`, which can't create datasets. So we reimplement the same flow, about 80 lines, with `scope=data.edit`.

Tested from a localhost page on 2026-10-20. The token response has `access_token`, `token_type`, `expires_in` (57600 s, i.e. 16 h) and `expires_at`. There's no refresh token. `GET /users/me` returns the username.

### Redivis upload

The JS client has no table creation or upload yet (`Upload.js` is a TODO), so these steps call REST directly. Tested from the browser on 2026-10-20:
1. Create the dataset: `POST /users/:owner/datasets` with `{name, publicAccessLevel: "data"}`. The new dataset already has a `next` version, and the response includes its `uri` (`/datasets/owner.name:id:next`).
2. Create the table: `POST {datasetUri}/tables` with `{name, uploadMergeStrategy: "append", isFileIndex: false}`.
3. Upload. Two ways work:
   - **Resumable temp upload (default):**
     - `POST {tableUri}/tempUploads` with `{tempUploads: [{size, name, resumable: true}]}`.
     - `POST` the returned url with `x-upload-content-length` and `x-goog-resumable: start`. The url is on `redivis.com/_tempStorageProxy`, which accepts cross-origin requests and exposes `Location`.
     - `PUT` chunks to `Location`.
     - `POST {tableUri}/uploads` with `{name, type: "delimited", hasHeaderRow: true, tempUploadId}`.
     - This has no size cap and shows progress. It's what the Python client does.
   - **Multipart:** `POST {tableUri}/uploads` with form parts `metadata` (a Blob of type `application/json`) and `data` (the file). It must stay under 100 MB. Sending `metadata` as a plain string field gives a 500.
4. Poll `GET {uploadUri}` until `status` is `completed` or `failed`, then show `errorMessage`. The penguins file took about 10 s.
5. Release: `POST /datasets/:owner.name/versions/next/release`. It fails with "version is currently invalid" if any table is empty, so a failed upload has to be retried or fixed before releasing.

**Browser limitation:** `/api/v1` doesn't return `Access-Control-Allow-Methods`, so browsers only allow GET and POST (the PUT to the temp-storage proxy is fine). The wizard can't DELETE or PATCH. It can't remove a dataset or table after a failure, so it should validate the CSV before creating anything, and reuse an existing dataset or table on retry.

### Build access

The site is built by the template's GitHub Action. As of `datapages/datapage@6194fbe` it reads public data anonymously:
- `redivis-r` 0.13.1 sends requests without auth when it has no credentials.
- `numDistinct` is computed from the data, because the variable statistics endpoint requires a token.
- An empty `REDIVIS_API_TOKEN` is unset.

So the wizard doesn't need a build token or a repo secret, provided the dataset is public at the data level and released.

### Size warning

`_load-data.qmd` puts the whole table into the page HTML through `ojs_define`. For reference, the 344-row penguins table makes a 93 KB `index.html`, and the 567-row mb4 table makes 515 KB. The scatter plot draws one SVG element per row, and it gets sluggish somewhere in the tens of thousands of rows. Starting thresholds, set as constants so they can be tuned:
- warn above **50,000 rows or 10 MB**
- warn more strongly above **250,000 rows or 50 MB**

## Architecture

- **Static SPA:** Vite + Svelte, deployed to GitHub Pages by an Action in this repo.
- **Libraries:**
  - Octokit for GitHub
  - `yaml` to edit YAML without losing comments
  - Papa Parse to read a sample of the CSV and count its rows before uploading
- **Core step library (TypeScript):** separate from the UI, so the same steps can also run from a small CLI for testing.
- **Cloudflare Worker (`worker/` in this repo):**
  - Its only job is the GitHub OAuth code exchange: `POST {code}` → `POST github.com/login/oauth/access_token` with the client ID and secret → return the token.
  - It allows cross-origin requests only from `https://datapages.github.io` (plus localhost while developing).
  - It stores nothing.
  - The client secret is a Worker secret.
  - It's needed because GitHub's token endpoints don't accept cross-origin requests.
- **GitHub OAuth App:** registered under the `datapages` org, with callback URL `https://datapages.github.io/datapage-builder/callback`. A second app for localhost development.

## Template changes (`datapages/datapage`)

- `dbfbd22`: the publish workflow sets its own `permissions:` and deploys with `actions/upload-pages-artifact` + `actions/deploy-pages`. This removes the "Read and write permissions" step and the "Include all branches" step.
- `6194fbe`: public data is read anonymously (see [Build access](#build-access)). The README now asks for a token only for datasets that aren't public.

## Open items

Things to check in the first end-to-end run:
1. Release works when the dataset has exactly one non-empty table. The test dataset had an empty table, which blocked release.
2. Uploads over 8 MiB, which go through the multi-chunk path of the resumable upload. Only single-chunk uploads were tested. It depends on the temp-storage proxy returning `308` with a readable `Range` header.
3. Whether creating a repo from the template triggers a build of the untouched template right away, which could fail before Pages is turned on. The wizard only watches the run for its own commit, so this would just add noise.
4. Timing of the template `generate` call, plus how long the first build takes (renv installs from scratch).
