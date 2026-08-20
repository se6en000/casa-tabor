import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('setRecurrenceRule targets master template event and series ID for occurrences', () => {
  const file = resolve('src/components/calendar/living-flow/hooks/useLivingFlowState.ts')
  const content = readFileSync(file, 'utf8')

  // Verify targetMasterId is used in event_series query
  assert.match(
    content,
    /template_event_id\.eq\.\$\{targetMasterId\}/,
    'setRecurrenceRule must target targetMasterId in event_series query instead of currentEvent.id'
  )

  // Verify triggerGoogleEventSync uses targetMasterId
  assert.match(
    content,
    /triggerGoogleEventSync\(supabase, targetMasterId\)/,
    'setRecurrenceRule must pass targetMasterId to triggerGoogleEventSync instead of currentEvent.id'
  )
})
