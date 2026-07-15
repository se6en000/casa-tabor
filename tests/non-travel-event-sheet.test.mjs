import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('event sheet uses a dedicated non-travel overview instead of the driver plan', () => {
  assert.match(panel, /plan\.kind === 'travel' && !transportationPlan/)
  assert.match(panel, /showLocation = hasDestination \|\| mode === 'hosted'/)
  assert.match(panel, /showMeanwhile = planKind === 'travel'/)
  assert.match(panel, /<NonTravelEventBlock event=\{event\} plan=\{plan\} hasTransportation=\{Boolean\(transportationPlan\)\} \/>/)
  assert.match(panel, /<EventTransportationSection/)
  assert.match(panel, /Birthday at home/)
  assert.match(panel, /At-home coverage/)
  assert.match(panel, /Remote event/)
  assert.match(panel, /No location or transportation plan is attached/)
})

test('event location remains visible independently of travel classification', () => {
  assert.match(panel, /\{!reminder && showLocation && \(/)
  assert.match(panel, /transportationNeeded=\{Boolean\(transportationPlan\) \|\| planKind === 'travel'\}/)
})
