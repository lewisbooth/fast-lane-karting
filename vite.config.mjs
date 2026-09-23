import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import autoprefixer from 'autoprefixer'
import { pagesDir, renderPages, sourceDir } from './scripts/pages.mjs'

const projectDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ command, isPreview }) => ({
  root: sourceDir,
  publicDir: resolve(sourceDir, 'static'),
  appType: 'mpa',
  css: {
    postcss: { plugins: [autoprefixer({ overrideBrowserslist: ['last 3 versions'] })] }
  },
  build: {
    outDir: resolve(projectDir, 'dist'),
    emptyOutDir: true,
    rolldownOptions: { input: isPreview ? {} : renderPages({ production: command === 'build' }) }
  },
  plugins: [{
    name: 'pug-pages',
    configureServer(server) {
      server.watcher.add(pagesDir)
      const update = (_event, filename) => {
        if (!filename.startsWith(pagesDir + sep) || !filename.endsWith('.pug')) return
        try {
          renderPages({ production: false })
          server.ws.send({ type: 'full-reload' })
        } catch (error) {
          server.config.logger.error(error.message)
          server.ws.send({ type: 'error', err: { message: error.message, stack: error.stack } })
        }
      }
      server.watcher.on('all', update)
      server.httpServer?.once('close', () => server.watcher.off('all', update))
    }
  }]
}))
