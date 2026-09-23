import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  assert.equal(first[filename], hash, `Static asset changed: ${filename}`)
}

for (const filename of pages) {
  const html = readFileSync(join(dist, filename), 'utf8')
  assert.ok(!html.includes('/css/style.styl'), `${filename} still references source styles.`)
  assert.ok(!/style\.css\?v=\d+/.test(html), `${filename} still has timestamp cache busting.`)
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]*)[^\"]*"/g)) {
    const pathname = decodeURIComponent(url).slice(1)
    const target = join(dist, pathname)
    assert.ok(existsSync(target) || existsSync(target + '.html'), `${filename} has a missing local asset or route: ${url}`)
  }
}

console.log(`Verified ${pages.length} pages and ${Object.keys(first).length} reproducible files; static assets are byte-identical.`)
