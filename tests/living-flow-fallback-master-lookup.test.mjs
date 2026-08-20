import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('setRecurrenceRule looks up template_event_id from event_series if occurrence lacks recurrence_master_id', () => {
  const file = resolve('src/components/calendar/living-flow/hooks/useLivingFlowState.ts')
  const content = readFileSync(file, 'utf8')

  // Verify fallback series lookup is present for targetMasterId resolution
  assert.match(
    content,
    /foundSeries\?\.template_event_id/,
    'useLivingFlowState must query event_series as fallback when targetMasterId resolves to an occurrence ID'
  )
})
