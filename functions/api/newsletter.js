import worker from '../../src/worker/index.mjs'

// Optional Pages deployment uses the same handler as Workers Static Assets.
export function onRequest({ request, env }) {
  return worker.fetch(request, env)
}
