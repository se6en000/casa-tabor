import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')

test('event editor exposes a touch-friendly action that clears the complete location', () => {
  assert.match(source, /const clearLocation = \(\) => \{\s*setLocation\(''\)\s*setAddress\(''\)\s*setShowLocationSuggest\(false\)\s*markDirty\(\)\s*\}/)
  assert.match(source, /<IconButton[\s\S]*?aria-label="Clear location"[\s\S]*?onClick=\{clearLocation\}/)
})

test('location clear action is only shown when location data exists', () => {
  assert.match(source, /\{\(location \|\| address\) && \(\s*<FormSummaryCard[\s\S]*?onClick=\{clearLocation\}/)
})
