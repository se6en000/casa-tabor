import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('event sheet uses a dedicated non-travel overview instead of the driver plan', () => {
  assert.match(panel, /plan\.kind === 'travel'/)
  assert.match(panel, /showTravelLocation = planKind === 'travel'/)
  assert.match(panel, /showMeanwhile = planKind === 'travel'/)
  assert.match(panel, /<NonTravelEventBlock event=\{event\} plan=\{plan\} \/>/)
  assert.match(panel, /Birthday at home/)
  assert.match(panel, /At-home coverage/)
  assert.match(panel, /Remote event/)
  assert.match(panel, /No location or transportation plan is attached/)
})
