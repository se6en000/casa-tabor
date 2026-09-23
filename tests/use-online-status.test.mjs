import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-23: the app had an 'online' event listener (App.tsx) but only used
// it to trigger a version-check side effect -- nothing ever told a household
// member "you're offline", so a real outage looked identical to the app just
// being slow or broken. This is a small, dedicated, reusable hook for that.
const source = readFileSync(new URL('../src/hooks/useOnlineStatus.ts', import.meta.url), 'utf8')

test('reads the real initial state from navigator.onLine, not assuming online', () => {
  assert.match(source, /navigator\.onLine/)
})

test('subscribes to both online and offline browser events and cleans up on unmount', () => {
  assert.match(source, /addEventListener\('online'/)
  assert.match(source, /addEventListener\('offline'/)
  assert.match(source, /removeEventListener\('online'/)
  assert.match(source, /removeEventListener\('offline'/)
})
