# datapage-builder

A web app that walks people through making a [datapage](https://github.com/datapages/datapage): it creates a GitHub repo from the datapage template, uploads their CSV to Redivis as a public dataset (or uses an existing Redivis table), lets them describe the variables, customizes the repo, and publishes it on GitHub Pages. See [DESIGN.md](DESIGN.md) for how it works.

It's a static site (Vite + Svelte) served from `datapages.github.io/datapage-builder`. The only server-side piece is a small Cloudflare Worker in [`worker/`](worker/) that does the two things a browser can't: it exchanges GitHub OAuth codes for tokens (GitHub requires a client secret and doesn't allow it from the browser), and it relays variable metadata updates to Redivis (Redivis's API doesn't allow PATCH from browsers). It stores nothing. Redivis sign-in happens entirely in the browser.

## Setup

These steps only have to be done once.

### 1. Register GitHub OAuth Apps

Under the `datapages` org's Settings > Developer settings > OAuth Apps, create two apps:

| | Production | Development |
|---|---|---|
| Application name | Datapage Builder | Datapage Builder (dev) |
| Homepage URL | `https://datapages.github.io/datapage-builder/` | `http://localhost:5173/datapage-builder/` |
| Authorization callback URL | `https://datapages.github.io/datapage-builder/callback/` | `http://localhost:5173/datapage-builder/callback/` |

For each, note the client ID and generate a client secret.

### 2. Deploy the Worker

```sh
npx wrangler login
# put the production client ID in worker/wrangler.toml under [vars], then:
npx wrangler secret put GITHUB_CLIENT_SECRET --config worker/wrangler.toml
npm run deploy:worker
```

Note the Worker's URL (e.g. `https://datapage-builder-auth.<account>.workers.dev`).

### 3. Configure this repo

- Settings > Secrets and variables > Actions > **Variables**: add `GITHUB_CLIENT_ID` (production client ID) and `TOKEN_EXCHANGE_URL` (the Worker URL plus `/token`).
- Settings > Pages: set the source to "GitHub Actions".

Pushing to `main` then tests, builds, and deploys the site.

## Development

```sh
npm install
cp worker/.dev.vars.example worker/.dev.vars   # fill in the dev OAuth App's ID and secret
cp .env.example .env.development.local          # fill in the dev client ID
npm run dev:worker                              # token exchange on http://localhost:8787
npm run dev                                     # app on http://localhost:5173/datapage-builder/
```

`npm test` runs the unit tests (template customization, CSV checks, variable suggestions, DOI lookup, the Worker), and `npm run check` type-checks.

## Layout

- `src/lib/`: everything that isn't UI
  - `auth/`: GitHub and Redivis sign-in popups
  - `redivis.ts`, `github.ts`: API clients for each wizard step
  - `csv.ts`: checks the CSV in the browser before anything is uploaded
  - `variables.ts`: suggests which variables to plot
  - `customize.ts`: edits the template's files for the new datapage
  - `state.svelte.ts`: wizard progress, saved in localStorage
- `src/steps/`: one component per wizard step
- `callback/`: the page GitHub redirects the sign-in popup to
- `worker/`: the Worker (GitHub token exchange and the Redivis metadata relay)
- `tests/fixtures/`: copies of the template files the customization tests run against. Update them when the template changes.
