import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-23: the service worker previously handled push notifications ONLY --
// zero fetch/cache logic, so a cold load with no network failed completely
// (blank/error page), separate from and underneath the React Query IndexedDB
// data cache shipped earlier today. This is the app-shell half: caching the
// static, content-hashed JS/CSS so the shell itself can render offline.
//
// Correctness constraints (CLAUDE.md documents a real past incident: a
// mismatched __BUILD_ID__/version.json pairing caused every connected browser
// to reload-loop forever). This service worker must never recreate that class
// of bug via ITS OWN caching:
//   - Navigation requests (HTML) are NETWORK-FIRST, falling back to a cached
//     copy only on genuine fetch failure -- so useAppUpdater's polling and the
//     resulting reload always have a chance to fetch the real new deploy;
//     caching HTML cache-first would mean a reload during a live deploy could
//     keep re-serving the OLD shell indefinitely.
//   - Hashed static assets (/assets/*) are safe to cache-first BECAUSE Vite
//     content-hashes their filenames -- a given URL's bytes never change, so
//     there is no staleness risk, and a new deploy naturally produces new
//     URLs that simply miss the cache and get fetched fresh.
//   - version.json is NEVER cached by the service worker (network-only) --
//     it's the one thing useAppUpdater polls to detect a new deploy, and
//     vercel.json already marks it no-store at the HTTP layer for the same
//     reason.
//   - Cross-origin requests (Supabase REST/RPC/functions, the entire API
//     surface) and non-GET requests are explicitly passed through untouched --
//     the service worker must never intercept, cache, or otherwise interfere
//     with API traffic; React Query's own IndexedDB persister already owns
//     data-layer resilience at a more correct layer (respects query keys,
//     staleTime, etc).
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

test('a fetch handler exists (the previous service worker had none at all)', () => {
  assert.match(sw, /addEventListener\('fetch'/)
})

test('non-GET requests are passed through untouched, never cached', () => {
  const idx = sw.indexOf("addEventListener('fetch'")
  const block = sw.slice(idx, idx + 400)
  assert.match(block, /request\.method !== 'GET'/)
})

test('cross-origin requests (all Supabase API traffic) are never intercepted', () => {
  const idx = sw.indexOf("addEventListener('fetch'")
  const block = sw.slice(idx, idx + 600)
  assert.match(block, /self\.location\.origin/)
})

test('version.json is explicitly excluded from caching (network-only, so useAppUpdater always sees the real deploy)', () => {
  assert.match(sw, /version\.json/)
  const idx = sw.indexOf('version.json')
  const block = sw.slice(Math.max(0, idx - 200), idx + 100)
  assert.match(block, /return|network|skip/i)
})

test('navigation requests are network-first with a cache fallback, not cache-first', () => {
  assert.match(sw, /networkFirst|navigat/i)
  const navIdx = sw.search(/networkFirst|isNavigationRequest|mode === 'navigate'/)
  assert.ok(navIdx >= 0, 'no navigation-handling strategy found')
})

test('hashed static assets use cache-first (safe: Vite content-hashes these filenames)', () => {
  assert.match(sw, /cacheFirst|\/assets\//)
})

test('old cache generations are cleaned up on activate', () => {
  const idx = sw.indexOf("addEventListener('activate'")
  assert.ok(idx >= 0)
  const block = sw.slice(idx, idx + 500)
  assert.match(block, /caches\.keys\(\)/)
  assert.match(block, /caches\.delete\(/)
})

test('push notification handlers are unchanged (existing, working feature must not regress)', () => {
  assert.match(sw, /addEventListener\('push'/)
  assert.match(sw, /addEventListener\('notificationclick'/)
  assert.match(sw, /showNotification/)
})

test('service worker registration bypasses the HTTP cache when checking for SW updates', () => {
  const src = readFileSync(new URL('../src/hooks/usePushNotifications.ts', import.meta.url), 'utf8')
  const idx = src.indexOf("register('/sw.js'")
  assert.ok(idx >= 0)
  const block = src.slice(idx, idx + 150)
  assert.match(block, /updateViaCache:\s*'none'/)
})
