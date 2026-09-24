import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
console.log(`Verified ${pages.length} pages and ${Object.keys(first).length} reproducible files with immutable asset references.`)
