import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The wall's decisions (who drives, "Leaving now", dismissed "to decide") are one shared setting.
// Found 2026-09-27: other screens never re-read it — the kiosk kept showing old decisions until it
// reloaded. Every screen now re-checks it on a short interval and when it comes back into view.
const hook = readFileSync(new URL('../src/wall/useWallTripState.ts', import.meta.url), 'utf8')

test('every screen re-reads the decisions within 20 seconds, and on coming back into view', () => {
  assert.match(hook, /refetchInterval: TRIP_STATE_REFRESH_MS/)
  assert.match(hook, /const TRIP_STATE_REFRESH_MS = 20_000/)
  assert.match(hook, /refetchOnWindowFocus: true/)
})
