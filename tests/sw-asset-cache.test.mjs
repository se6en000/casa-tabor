import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Runs the real public/sw.js in a fake service-worker scope. Found 2026-09-25: during a
// deploy the server answered a new script URL with the HTML page (200); the worker cached
// it as the script, cache-first, and the kiosk stayed blank until a cache-bypassing reload.

function loadWorker(fetchImpl) {
  const listeners = {}
  const stores = new Map()
  const caches = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)
      return {
        match: async (req) => store.get(typeof req === 'string' ? req : req.url)?.clone(),
        put: async (req, res) => { store.set(typeof req === 'string' ? req : req.url, res) },
        delete: async (req) => store.delete(typeof req === 'string' ? req : req.url),
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  }
  const self = { addEventListener: (type, fn) => { listeners[type] = fn }, location: { origin: 'https://casa.test' }, skipWaiting() {}, clients: { claim: async () => {} }, registration: {} }
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch: fetchImpl, URL, Response, Request, Headers, console })
  const fetchAsset = async (path) => {
    let responded
    listeners.fetch({ request: new Request(`https://casa.test${path}`), respondWith: (p) => { responded = p } })
    return responded
  }
  return { fetchAsset, stores, listeners }
}

const js = () => new Response('export default 1', { status: 200, headers: { 'content-type': 'application/javascript' } })
const html = () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })

test('an HTML answer for a script URL is passed through but never cached', async () => {
  let serve = html
  const sw = loadWorker(async () => serve())
  const first = await sw.fetchAsset('/assets/index-abc.js')
  assert.match(first.headers.get('content-type'), /text\/html/)
  serve = js // the deploy finishes
  const second = await sw.fetchAsset('/assets/index-abc.js')
  assert.match(second.headers.get('content-type'), /javascript/)
})

test('a script is cached once it arrives as a script', async () => {
  let calls = 0
  const sw = loadWorker(async () => { calls += 1; return js() })
  await sw.fetchAsset('/assets/app-1.js')
  await sw.fetchAsset('/assets/app-1.js')
  assert.equal(calls, 1)
})

test('an HTML entry already in the cache (from an older worker) is dropped and fetched fresh', async () => {
  const sw = loadWorker(async () => js())
  const [name] = await (async () => { await sw.fetchAsset('/assets/warm.js'); return [...sw.stores.keys()] })()
  const store = sw.stores.get(name)
  store.set('https://casa.test/assets/index-bad.js', html())
  const res = await sw.fetchAsset('/assets/index-bad.js')
  assert.match(res.headers.get('content-type'), /javascript/)
})

test('the cache name moved past v1, so activating deletes the poisoned kiosk cache', () => {
  assert.doesNotMatch(readFileSync('public/sw.js', 'utf8'), /const CACHE_NAME = 'casa-tabor-shell-v1'/)
})
