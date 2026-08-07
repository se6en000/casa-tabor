import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)

test('event sheet uses a dedicated non-travel overview instead of the driver plan', () => {
  assert.match(panel, /plan && plan\.kind !== 'travel'/)
  assert.doesNotMatch(panel, /<PlanBlock/)
  assert.match(panel, /showLocation = hasDestination \|\| mode === 'hosted'/)
  assert.match(panel, /showMeanwhile = planKind === 'travel'/)
  assert.match(panel, /<NonTravelEventBlock event=\{event\} plan=\{plan\} hasTransportation=\{Boolean\(transportationPlan\)\} \/>/)
  assert.match(panel, /<EventTransportationSection/)
  assert.match(panel, /Birthday at home/)
  assert.match(panel, /At-home coverage/)
})

test('family coverage is collapsed by default with its time window summarized', () => {
  const meanwhileStart = panel.indexOf('{showMeanwhile && (')
  const meanwhileEnd = panel.indexOf('Reference (collapsible', meanwhileStart)
  const meanwhile = panel.slice(meanwhileStart, meanwhileEnd)

  assert.match(meanwhile, /<DisclosureSection/)
  assert.match(meanwhile, /title="Meanwhile, the rest of the family"/)
  assert.match(meanwhile, /summary=\{`\$\{format\(new Date\(event\.start_time\)/)
  assert.match(meanwhile, /defaultOpen=\{false\}/)
  assert.match(meanwhile, /coverageRows\.map/)
  assert.match(panel, /Remote event/)
  assert.match(panel, /No location or transportation plan is attached/)
})

test('event location remains visible independently of travel classification', () => {
  assert.match(panel, /\{!reminder && showLocation && \(/)
  assert.match(panel, /transportationNeeded=\{showTransportationSection\}/)
})
