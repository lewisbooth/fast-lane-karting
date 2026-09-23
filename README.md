# Fast Lane Karting

Static website for https://www.fastlanekarting.co.uk, built with Vite, Pug and Stylus.

## Development

Use the Node version in `.node-version` (24.19.0), then:

```sh
npm ci
npm run dev
```

Vite serves the site with CSS hot updates and reloads when Pug templates change.
Named routes such as `/offers` and `/contact` work in development and production.

## Build and verify

```sh
npm ci
npm run build
npm run preview
```

`npm run build` creates a complete `dist/` from source, removing old output first.
`dist/` is generated and is not committed. Any existing host serving `dist/`
must run the build after updating this repository.

```sh
npm test
npm run verify
```

Tests exercise newsletter validation, input limits, fixed recipients, both email
transports and delivery errors using mocks; they never send email.
Verification runs two builds, starting with no `dist/`, compares every output
file by SHA-256, checks stale-output removal, checks all page routes and local
asset references, and verifies that copied static files are byte-identical.

The dependency lockfile and Node version are committed. Builds do not fetch
live business data or insert timestamps. Vite gives compiled CSS and JavaScript
content-based filenames. The Vite migration changes compiled bytes from the old
Gulp output while preserving the existing page content, styling and behaviour.
The browser target is Vite's modern-browser default; the previous ES5/IE11
transpilation is no longer part of the build.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/pages/*.pug` | Page templates; `offers.pug` becomes `dist/offers.html` |
| `src/pages/_partials/` | Shared layout, navigation and footer |
| `src/css/` | Stylus styles and partials |
| `src/js/` | Browser modules; `site.js` loads shared behaviour |
| `src/js/vendor/` | Existing vendored instant-navigation script |
| `src/worker/index.mjs` | Newsletter API and Worker asset fallback |
| `src/static/` | Files copied unchanged: images, fonts, videos, favicon, JSON and legacy vendor assets |
| `functions/api/newsletter.js` | Optional Pages adapter for the same newsletter handler |
| `scripts/pages.mjs` | Generates ignored `src/*.html` entries for Vite |
| `scripts/verify-build.mjs` | Reproducible-build and output-integrity checks |

Edit the Pug templates, not the generated `src/*.html` files. Add a new named
page directly under `src/pages/`; the build discovers it automatically.
`index.pug` is the home page, and `404.pug` is the styled Cloudflare error page.

## Cloudflare Workers deployment

The primary target is the existing `fast-lane-karting` Worker:
https://fast-lane-karting.lewis-02c.workers.dev

`wrangler.jsonc` serves `dist/` as Static Assets, using slashless named routes
and the styled `404.html` for missing pages. Only `/api/*` runs the Worker first;
other requests are served as static assets. `/offers/` and `/offers.html`
redirect to `/offers`. No custom-domain or DNS changes are included.

Connect Workers Builds to this repository with these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | Read from `.node-version` |

Set the legacy newsletter secret described below before the first deployment.
After an authenticated `npm ci`, `npm run deploy` builds and deploys manually.
For the complete site and API locally, run `npm run dev:worker`. Plain
`npm run dev` and `npm run preview` serve only the Vite frontend, so they cannot
process signup submissions.

## Optional Cloudflare Pages deployment

Connect this GitHub repository as a **Pages** project using Git integration.
The separate `wrangler.pages.jsonc` contains Pages settings. For Pages Git
integration, use the build command below to select it as the default config in
the isolated build checkout; the repository's default remains Workers.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Root directory | Repository root |
| Build command | `cp wrangler.pages.jsonc wrangler.jsonc && npm ci && npm run build` |
| Build output directory | `dist` |
| Build environment variable | `SKIP_DEPENDENCY_INSTALL=1` |
| Node version | Read from `.node-version` |

Pages serves `offers.html` as `/offers`, and `404.html` handles unknown routes.
The `functions/` adapter runs the same newsletter API. For a manual Pages
deployment use `npm run deploy:pages`. Neither host uses an SPA catch-all or a
server process. No deployment or DNS change is performed by `npm run build`.

The two videos remain below Pages' 25 MiB per-file limit. If replacing either
with a larger video, reduce its size or host it separately.

## Fastest-lap data

`src/static/fastest-lap.json` is the committed snapshot used on `/layout`.
To update it deliberately, set `SHEET_ID` and `API_KEY` in the repository-root
`.env` file or the environment, then run:

```sh
npm run update:fastest-lap
npm run build
```

Commit the changed JSON to make the next deployment use it. This command is
never called by the build, so Google Sheets access is not required to deploy.

## External integrations

Booking, race timing, maps and the track tour retain their existing providers.

## Newsletter delivery

The browser submits JSON to same-origin `POST /api/newsletter`. The Worker
accepts only a bounded email request, rejects cross-origin browser requests,
checks delivery status, and returns success only when the selected provider
accepts the request. Failed requests go to the existing `/error` page. The
recipient is server-controlled; a submitted `to` field cannot change it.

**Current transport: `legacy`.** Cloudflare's sending domain and destination
are not verified yet, so the Worker temporarily submits to the existing AWS
service. That service retains its existing recipient and gateway throttling.
Configure the existing gateway API key as the Worker secret
`LEGACY_NEWSLETTER_API_KEY` with `npx wrangler secret put
LEGACY_NEWSLETTER_API_KEY`, or in the dashboard under Variables and Secrets.
For Pages, use the same named encrypted secret in the Pages project settings.
For local Worker development, place it in ignored `.dev.vars`. The browser
bundle and tracked configs contain neither that value nor AWS credentials.
This transitional deployment does not yet remove SES.

The native Cloudflare email handler is implemented and covered by mocked tests.
It sends a notification to `lewis@amp.studio`, matching the connected Gmail
account, with the existing subject and body format and the signup address as
Reply-To. It does not email the person signing up or send newsletter campaigns.

To finish the Cloudflare email cutover:

1. Activate the sending domain on Cloudflare DNS and onboard it to Email Service.
   Verify `lewis@amp.studio` as an Email Routing destination when using the
   verified-destination sending option.
2. Set `NEWSLETTER_FROM` to an address on that onboarded domain and add this
   binding to the deployment's Wrangler config:

   ```json
   "send_email": [{ "name": "EMAIL", "destination_address": "lewis@amp.studio" }]
   ```

3. Set `NEWSLETTER_TRANSPORT` to `cloudflare`, redeploy, and delete the
   `LEGACY_NEWSLETTER_API_KEY` secret. Add a Cloudflare rate-limiting rule
   for `POST /api/newsletter` before removing the legacy gateway's protection.
4. Submit one controlled signup and confirm the notification reaches Gmail.

Native email errors return an error response; they never retry through AWS.
Keep the optional Pages config in sync if switching hosting targets.
