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
It fingerprints the copied media and fonts, rewrites CSS and page references,
then fingerprints the final CSS. The lap snapshot is embedded in the versioned
layout script instead of fetched separately.
`dist/` is generated and is not committed. Any existing host serving `dist/`
must run the build after updating this repository.

```sh
npm test
npm run verify
```

Tests exercise newsletter validation, input limits, fixed recipients, the Mailchimp
and email transports, and delivery errors using mocks; they never send email.
Verification runs two builds, starting with no `dist/`, compares every output
file by SHA-256, checks stale-output removal, checks all page routes and local
asset references, content hashes, cache rules, and verifies that copied static
files are byte-identical.

The dependency lockfile and Node version are committed. Builds do not fetch
live business data or insert timestamps. Vite gives compiled JavaScript
content-based filenames; the post-build step fingerprints the rewritten CSS,
fonts, images and video under `/immutable/`. The Vite migration changes compiled bytes from the old
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
| `src/static/` | Original images, fonts, videos, favicon and JSON; `_headers` defines browser caching |
| `functions/api/newsletter.js` | Optional Pages adapter for the same newsletter handler |
| `scripts/pages.mjs` | Generates ignored `src/*.html` entries for Vite |
| `scripts/version-assets.mjs` | Fingerprints media and final CSS, then rewrites page references |
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
Cloudflare serves `/assets/*` and `/immutable/*` with a one-year `immutable`
browser cache policy. Their URLs change with their contents, so subsequent page
loads can use cached first-party assets without revalidation. HTML still
revalidates to discover updates. External analytics and embeds follow their own
cache policies.

The previous unversioned asset paths are still included for pages already open
when this change is deployed. Fresh builds include current content hashes; if a
later edit changes an asset, an old page kept open across deployments could
request its former hash after that file has left the new asset manifest. Retain
old hashes in future builds if supporting those long-lived pages is required.

Connect Workers Builds to this repository with these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | Read from `.node-version` |

Set the legacy newsletter secret described below before the first deployment.
Cloudflare Builds runs `npm run build` once, then deploys `dist/` with Wrangler.
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

`src/static/fastest-lap.json` is the committed snapshot bundled into the
versioned `/layout` script, so visiting the page does not fetch the JSON.
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

### Direct Mailchimp signup

The `mailchimp` transport adds a contact directly to Fast Lane Karting's Mailchimp
audience. It does not send a notification to the team, use AWS, or alter mail DNS.
Existing unsubscribed and bounced contacts are never resubscribed automatically.
An inactive contact or Mailchimp error returns an error instead of falsely
reporting a subscription. The browser never receives the Mailchimp API key;
Worker logs include neither the key nor submitted email addresses. Static
assets still bypass the Worker.

1. Ask the team which existing Mailchimp audience receives their manual imports,
   and find its ID under **Audience → More options → Audience settings → Audience ID**.
   Check whether that audience has required merge fields beyond email; the site
   collects only an email address.
2. Choose the subscription method: `single` immediately subscribes new contacts;
   `double` creates them as `pending` and sends Mailchimp's confirmation email.
   The site's `/confirm` page tells double opt-in signups to check their inbox.
   Review the signup wording and link to Fast Lane Karting's privacy information
   before using the audience for marketing.
3. In the team's Mailchimp account, create a dedicated **Marketing API key** named
   for this site. Store it in the Worker as the encrypted `MAILCHIMP_API_KEY`
   secret (`npx wrangler secret put MAILCHIMP_API_KEY` on an authenticated host).
   Do not paste it into source, `.env`, chat, or browser code. The Worker derives
   the Mailchimp data center from the suffix of the key.
4. Set `MAILCHIMP_AUDIENCE_ID` and `MAILCHIMP_OPT_IN` in `wrangler.jsonc` to the
   selected audience ID and `single` or `double`. Change `NEWSLETTER_TRANSPORT`
   to `mailchimp`. Replace `LEGACY_NEWSLETTER_API_KEY` with `MAILCHIMP_API_KEY`
   in `secrets.required` so deployments reject missing Mailchimp credentials.
   For a Pages deployment, apply equivalent variables and the encrypted secret
   to Pages project settings before deploying.
5. Add Cloudflare rate limiting to `POST /api/newsletter`, then build and deploy.
   Submit a controlled signup and verify the contact's **status** in the correct
   Mailchimp audience; for `double`, click the confirmation link and check that
   the status changes from `pending` to `subscribed`. Test an existing contact
   without changing their unsubscribe status. Only after this works, stop
   forwarding signup notifications and retire the AWS secret/service.

Mailchimp API failures return 502 from the Worker without sending anything to
AWS; the user sees the site's existing error page. The Mailchimp Marketing API
key can access the account, so keep it private and rotate it if exposed.

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
