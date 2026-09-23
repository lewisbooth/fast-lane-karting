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
npm run verify
```

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
| `src/static/` | Files copied unchanged: images, fonts, videos, favicon, JSON and legacy vendor assets |
| `scripts/pages.mjs` | Generates ignored `src/*.html` entries for Vite |
| `scripts/verify-build.mjs` | Reproducible-build and output-integrity checks |

Edit the Pug templates, not the generated `src/*.html` files. Add a new named
page directly under `src/pages/`; the build discovers it automatically.
`index.pug` is the home page, and `404.pug` is the styled Cloudflare error page.

## Cloudflare Pages

Connect this GitHub repository as a **Pages** project using Git integration.
`wrangler.jsonc` is Pages-specific; it is not a Workers Static Assets config.

| Setting | Value |
| --- | --- |
| Production branch | `main` after the default branch is renamed |
| Framework preset | None |
| Root directory | Repository root |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Build environment variable | `SKIP_DEPENDENCY_INSTALL=1` |
| Node version | Read from `.node-version` |

Pages serves `offers.html` as `/offers`, and `404.html` handles unknown routes.
There is no SPA catch-all or server process. No deployment or DNS change is
performed by the build.

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
The newsletter form still calls the existing AWS endpoint; its later migration
to a Worker is separate from this static-site build change. Verify the existing
endpoint's CORS settings when testing on a `pages.dev` preview domain.
