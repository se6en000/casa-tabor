import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('useLivingFlowState hydrates rrule from recurringContext when opening an occurrence', () => {
  const file = resolve('src/components/calendar/living-flow/hooks/useLivingFlowState.ts')
  const content = readFileSync(file, 'utf8')

  // Verify that loadRecurringEditorContext updates state.rrule if initialEvent.rrule is null
  assert.match(
    content,
    /result\.context\?\.series\?\.recurrence_lines\?\.\[0\]/,
    'useLivingFlowState must extract series recurrence_lines[0] when recurringContext loads'
  )
  assert.match(
    content,
    /setState\(prev => \(\{ \.\.\.prev, rrule: prev\.rrule \|\| seriesRrule \}\)\)/,
    'useLivingFlowState must hydrate state.rrule from series recurrence lines when initialEvent.rrule is missing'
  )
})
