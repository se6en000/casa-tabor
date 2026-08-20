import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sidecar = readFileSync(
  new URL('../src/components/calendar/living-flow/LivingFlowSidecar.tsx', import.meta.url),
  'utf8',
)
const stateHook = readFileSync(
  new URL('../src/components/calendar/living-flow/hooks/useLivingFlowState.ts', import.meta.url),
  'utf8',
)

test('event sheet uses a dedicated non-travel overview instead of the driver plan', () => {
  assert.match(sidecar, /isDrivingOuting/)
  assert.match(sidecar, /LivingReminderCard/)
  assert.match(stateHook, /isLikelyReminderOrHome/)
})

test('event location remains visible independently of travel classification', () => {
  assert.match(sidecar, /LivingVenueCard/)
  assert.match(stateHook, /setVenue/)
})
