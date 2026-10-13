import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { siteOrigin } from './social-metadata.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = join(root, 'dist')

function snapshot(directory, prefix = '') {
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = prefix + entry.name
    const filename = join(directory, entry.name)
    return entry.isDirectory()
      ? Object.entries(snapshot(filename, name + '/'))
      : [[name, createHash('sha256').update(readFileSync(filename)).digest('hex')]]
  }))
}

function build() {
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: root,
    stdio: 'inherit'
  })
  execFileSync(process.execPath, [join(root, 'scripts/version-assets.mjs')], {
    cwd: root,
    stdio: 'inherit'
  })
}

// A clean checkout contains no dist. Both runs must produce identical bytes;
// the second must also remove stale output rather than accidentally retaining it.
rmSync(dist, { recursive: true, force: true })
build()
const first = snapshot(dist)
writeFileSync(join(dist, 'stale-build-output.txt'), 'This must be removed by the next build.')
build()
assert.deepEqual(snapshot(dist), first, 'Build output must be reproducible and clean stale files.')

const pages = readdirSync(join(root, 'src/pages')).filter(name => name.endsWith('.pug')).map(name => name.replace(/\.pug$/, '.html')).sort()
assert.deepEqual(Object.keys(first).filter(name => name.endsWith('.html')).sort(), pages)
assert.ok(first['404.html'], 'Cloudflare Pages needs a top-level 404.html.')
assert.ok(!Object.keys(first).some(name => name.endsWith('/index.html')), 'Named pages must be flat, slashless HTML entries.')

for (const [filename, hash] of Object.entries(snapshot(join(root, 'src/static')))) {
  if (filename === '_headers') continue
  assert.equal(first[filename], hash, `Static asset changed: ${filename}`)
}

const headers = readFileSync(join(dist, '_headers'), 'utf8')
for (const prefix of ['/assets/*', '/immutable/*']) {
  assert.ok(headers.includes(`${prefix}\n  Cache-Control: public, max-age=31536000, immutable`), `Missing immutable rule for ${prefix}`)
}

const assetUrl = /^\/(assets|immutable)\//
function metaContent(html, name) {
  const matches = [...html.matchAll(/<meta\s+(?:name|property)="([^"]+)"\s+content="([^"]*)"[^>]*>/g)]
    .filter(match => match[1] === name)
  assert.equal(matches.length, 1, `Expected one ${name} tag`)
  assert.ok(matches[0][2].trim(), `Empty ${name} tag`)
  return matches[0][2]
}
for (const relative of Object.keys(first).filter(name => name.startsWith('assets/'))) {
  assert.match(relative, /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.js$/, `Unversioned Vite output: ${relative}`)
}
for (const relative of Object.keys(first).filter(name => name.startsWith('immutable/'))) {
  const match = relative.match(/\.([a-f0-9]{16})\.[^.]+$/)
  assert.ok(match, `Immutable asset is missing a content hash: ${relative}`)
  assert.equal(first[relative].slice(0, 16), match[1], `Wrong hash in ${relative}`)
}

for (const filename of pages) {
  const html = readFileSync(join(dist, filename), 'utf8')
  assert.ok(!html.includes('fastlanekarting.amp.studio'), `${filename} still depends on the old image host.`)
  const title = metaContent(html, 'og:title')
  const description = metaContent(html, 'og:description')
  const documentTitle = html.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim()
  const titleText = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"')
  assert.equal(titleText(title), titleText(documentTitle), `${filename} has the wrong sharing title.`)
  assert.equal(metaContent(html, 'twitter:title'), title)
  assert.equal(metaContent(html, 'twitter:description'), description)
  assert.equal(description, metaContent(html, 'description'), `${filename} has inconsistent descriptions.`)
  assert.equal(metaContent(html, 'og:type'), 'website')
  assert.equal(metaContent(html, 'og:site_name'), 'Fast Lane Karting')
  assert.equal(metaContent(html, 'og:locale'), 'en_GB')
  assert.equal(metaContent(html, 'twitter:card'), 'summary_large_image')
  const image = new URL(metaContent(html, 'og:image'))
  assert.equal(image.origin, siteOrigin, `${filename} has an external sharing image.`)
  assert.match(image.pathname, /^\/immutable\/images\/.*\.[a-f0-9]{16}\.jpg$/)
  assert.ok(existsSync(join(dist, image.pathname.slice(1))), `${filename} has a missing sharing image.`)
  assert.equal(metaContent(html, 'twitter:image'), image.href)
  assert.equal(metaContent(html, 'twitter:image:alt'), metaContent(html, 'og:image:alt'))
  assert.equal(metaContent(html, 'og:image:type'), 'image/jpeg')
  assert.ok(Number(metaContent(html, 'og:image:width')) > 0)
  assert.ok(Number(metaContent(html, 'og:image:height')) > 0)
  if (filename === '404.html') {
    assert.ok(!html.includes('rel="canonical"'), 'The shared 404 page must not claim a canonical route.')
    assert.equal(metaContent(html, 'robots'), 'noindex')
  } else {
    const url = `${siteOrigin}${filename === 'index.html' ? '/' : `/${filename.slice(0, -5)}`}`
    assert.equal(metaContent(html, 'og:url'), url)
    const canonical = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)]
    assert.equal(canonical.length, 1, `${filename} needs one canonical URL.`)
    assert.equal(canonical[0][1], url)
  }
  if (filename === 'offers.html') {
    const source = readFileSync(join(root, 'src/pages/offers.pug'), 'utf8')
    assert.match(source, /block socialImage/, 'Offers needs its own campaign image override.')
    const selected = source.match(/meta\(property="og:image" content="([^"]+)"\)/)?.[1]
    assert.ok(selected, 'Offers must select a sharing image.')
    assert.equal(image.pathname.replace(/^\/immutable/, '').replace(/\.[a-f0-9]{16}(?=\.[^.]+$)/, ''), selected,
      'Offers sharing image must match the current campaign, not the default image.')
  }
  assert.ok(!html.includes('/css/style.styl'), `${filename} still references source styles.`)
  assert.ok(!/style\.css\?v=\d+/.test(html), `${filename} still has timestamp cache busting.`)
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]*)[^\"]*"/g)) {
    const pathname = decodeURIComponent(url).slice(1)
    const target = join(dist, pathname)
    assert.ok(existsSync(target) || existsSync(target + '.html'), `${filename} has a missing local asset or route: ${url}`)
    if (existsSync(target) && statSync(target).isFile()) assert.match(url, assetUrl, `${filename} requests an unversioned asset: ${url}`)
  }
  for (const [, url] of html.matchAll(/(?:poster|content)="(\/[^"#?]*)[^\"]*"/g)) {
    if (existsSync(join(dist, url.slice(1)))) assert.match(url, assetUrl, `${filename} requests an unversioned asset: ${url}`)
  }
}

for (const filename of Object.keys(first).filter(name => name.endsWith('.css'))) {
  const css = readFileSync(join(dist, filename), 'utf8')
  for (const [, url] of css.matchAll(/url\(['"]?(\/[^)'"\s]+)['"]?\)/g)) {
    assert.match(url, /^\/immutable\//, `${filename} references an unversioned asset: ${url}`)
    assert.ok(existsSync(join(dist, url.slice(1))), `Missing CSS asset: ${url}`)
  }
}
assert.ok(!readFileSync(join(dist, 'layout.html'), 'utf8').includes('/fastest-lap.json'), 'Lap JSON should be bundled with the page script.')
console.log(`Verified ${pages.length} pages and ${Object.keys(first).length} reproducible files with immutable assets and complete sharing metadata.`)
