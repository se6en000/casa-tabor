import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/CalendarPage.tsx', import.meta.url), 'utf8')

test('the calendar header shows the shared last-synced indicator, using the design system muted-caption style', () => {
  assert.match(source, /import { useEventsLastSynced } from '\.\.\/hooks\/useEventsLastSynced'/)
  assert.match(source, /useEventsLastSynced\(\)/)
  const idx = source.indexOf('lastSyncedLabel &&')
  assert.ok(idx >= 0, 'last-synced indicator not rendered')
  const block = source.slice(idx, idx + 200)
  assert.match(block, /text-caption text-casa-muted/)
  assert.match(block, /aria-live="polite"/)
})
