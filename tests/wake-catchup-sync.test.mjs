import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('src/App.tsx'), 'utf8')

test('AppShell hooks up wake and visibility catch-up sync for active queries', () => {
  assert.match(
    source,
    /wake-kiosk/,
    'must listen to wake-kiosk'
  )
  assert.match(
    source,
    /visibilitychange/,
    'must listen to visibilitychange for wake catch-up'
  )
  assert.match(
    source,
    /invalidateQueries\(\{\s*queryKey:\s*\['events'\]\s*\}\)/,
    'must invalidate events on wake catch-up'
  )
})
