import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkReloadDue, isChunkLoadError, CHUNK_RELOAD_GAP_MS } from '../src/utils/lazyWithReload.ts'

test('a failed chunk reloads the page, at most once per gap — not once per session (the kiosk tab lives for days)', () => {
  const now = Date.UTC(2026, 8, 26, 23, 5)
  assert.equal(chunkReloadDue(null, now), true, 'never reloaded')
  assert.equal(chunkReloadDue(String(now - 5_000), now), false, 'just reloaded: no loop')
  assert.equal(chunkReloadDue(String(now - CHUNK_RELOAD_GAP_MS - 1), now), true, 'a later deploy recovers too')
  assert.equal(chunkReloadDue('1', now), true, 'the old "1" flag no longer blocks forever')
})

test('chunk-load failures are told apart from real crashes', () => {
  assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://casa-tabor.vercel.app/assets/WallRoot-BvQ0vWE8.js')), true)
  assert.equal(isChunkLoadError(new Error('Importing a module script failed.')), true)
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'id')")), false)
  assert.equal(isChunkLoadError(null), false)
})
