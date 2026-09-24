import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = path.join(root, 'src/static')
const output = path.join(root, 'dist')
const urls = new Map()

function walk(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name)
    return entry.isDirectory() ? walk(path.join(directory, entry.name), relative) : [relative]
  })
}

function versionedPath(relative, bytes) {
  const { dir, name, ext } = path.posix.parse(relative)
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  return path.posix.join('immutable', dir, `${name}.${digest}${ext}`)
}

function emit(relative, bytes) {
  const versioned = versionedPath(relative, bytes)
  const destination = path.join(output, versioned)
  mkdirSync(path.dirname(destination), { recursive: true })
  writeFileSync(destination, bytes)
  urls.set(`/${relative}`, `/${versioned}`)
  return `/${versioned}`
}

function rewriteLocalUrls(content) {
  // A quote before / distinguishes local references from absolute external URLs.
  return content.replace(/(["'])\/(images|fonts|video|favicon\.ico|fastest-lap\.json)([^"'\s<>)]*)/g, (full, quote, segment, rest) => {
    const original = `/${segment}${rest}`
    const replacement = urls.get(original)
    if (!replacement) throw new Error(`Unknown local asset: ${original}`)
    return quote + replacement
  })
}

function rewriteCssUrls(content) {
  return content.replace(/url\((['"]?)(\/[^)'"\s]+)\1\)/g, (full, quote, original) => {
    const replacement = urls.get(original)
    if (!replacement) throw new Error(`Unknown CSS asset: ${original}`)
    return `url(${quote}${replacement}${quote})`
  })
}

if (!existsSync(path.join(output, 'index.html'))) throw new Error('Run vite build first')

// Vite fingerprints compiled JavaScript. Public media and fonts need their own
// content-addressed URLs; keep the original paths for pages already open during
// this first migration.
for (const relative of walk(source).filter(name => name !== '_headers')) {
  emit(relative, readFileSync(path.join(source, relative)))
}

// Vite's CSS initially contains public URLs. Rewriting them changes its bytes,
// so give the final CSS a hash of the *rewritten* content before updating HTML.
for (const relative of walk(path.join(output, 'assets')).filter(name => name.endsWith('.css'))) {
  const original = `/assets/${relative}`
  const css = rewriteCssUrls(readFileSync(path.join(output, original.slice(1)), 'utf8'))
  const versioned = emit(`styles/${relative.replace(/-[A-Za-z0-9_-]+\.css$/, '.css')}`, Buffer.from(css))
  urls.set(original, versioned)
  rmSync(path.join(output, original.slice(1)))
}

for (const relative of walk(output).filter(name => name.endsWith('.html'))) {
  const filename = path.join(output, relative)
  let html = rewriteLocalUrls(readFileSync(filename, 'utf8'))
  for (const [original, versioned] of urls) {
    if (original.startsWith('/assets/')) html = html.replaceAll(`"${original}"`, `"${versioned}"`)
  }
  writeFileSync(filename, html)
}

console.log(`Versioned ${urls.size} static assets; HTML remains revalidatable.`)
