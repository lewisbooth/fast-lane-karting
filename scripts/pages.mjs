import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pug from 'pug'

export const sourceDir = fileURLToPath(new URL('../src/', import.meta.url))
export const pagesDir = resolve(sourceDir, 'pages')

// Vite consumes real HTML entries. These ignored intermediates are generated
// from Pug before Vite starts; only src/pages is edited or committed.
export function renderPages({ production }) {
  const templates = readdirSync(pagesDir).filter(name => name.endsWith('.pug')).sort()
  const rendered = templates.map(name => ({
    name: name.replace(/\.pug$/, '.html'),
    html: pug.renderFile(resolve(pagesDir, name), { production })
  }))

  // Compile everything before replacing intermediates, so a template error
  // fails the build without leaving a mixture of old and new HTML.
  const names = new Set(rendered.map(page => page.name))
  for (const name of readdirSync(sourceDir).filter(name => name.endsWith('.html') && !names.has(name))) {
    rmSync(resolve(sourceDir, name), { force: true })
  }
  return Object.fromEntries(rendered.map(({ name, html }) => {
    const filename = resolve(sourceDir, name)
    if (!existsSync(filename) || readFileSync(filename, 'utf8') !== html) {
      const temporary = `${filename}.${process.pid}.tmp`
      writeFileSync(temporary, html)
      renameSync(temporary, filename)
    }
    return [basename(name, '.html'), filename]
  }))
}
