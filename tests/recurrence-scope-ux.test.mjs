import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildRecurrenceScopeChoices,
  recurrenceScopeDialogTitle,
  recurrenceScopeSubmitLabel,
} from '../src/lib/recurrenceScopePresentation.ts'

test('recurrence scope choices use explicit Outlook-style scope language', () => {
  const choices = buildRecurrenceScopeChoices({ operation: 'update' })

  assert.deepEqual(choices.map(({ label }) => label), [
    'Only this event',
    'This and following events',
    'Entire series',
  ])
  assert.match(choices[0].description, /this event only/)
  assert.match(choices[1].description, /all later events/)
  assert.match(choices[2].description, /past and future/)
})

test('recurrence scope presentation reports counts and preserved exceptions', () => {
  const choices = buildRecurrenceScopeChoices({
    operation: 'location',
    impacts: {
      future: { affectedCount: 7, preservedExceptionCount: 2 },
    },
  })

  assert.equal(choices[1].impact, '7 events · 2 one-off changes preserved')
  assert.equal(recurrenceScopeSubmitLabel('location', { affectedCount: 7 }), 'Change 7 events')
  assert.equal(recurrenceScopeSubmitLabel('update'), 'Update selected events')
})

test('recurrence delete language is destructive and specific', () => {
  assert.equal(recurrenceScopeDialogTitle('delete'), 'Delete recurring event')
  assert.equal(recurrenceScopeSubmitLabel('delete', { affectedCount: 1 }), 'Delete 1 event')

  const dialog = readFileSync(resolve('src/components/calendar/RecurrenceScopeDialog.tsx'), 'utf8')
  assert.match(dialog, /operation === 'delete' \? 'danger'/)
  assert.match(dialog, /Deleted events can be restored for 30 days/)
})

test('recurrence decision surface exposes sync, invitation, radio, and busy-state semantics', () => {
  const dialog = readFileSync(resolve('src/components/calendar/RecurrenceScopeDialog.tsx'), 'utf8')

  assert.match(dialog, /<fieldset/)
  assert.match(dialog, /<Radio/)
  assert.match(dialog, /Saves to Casa first, then syncs to/)
  assert.match(dialog, /Invitations are not sent from this step/)
  assert.match(dialog, /closeDisabled=\{loading\}/)
  assert.match(dialog, /closeOnEscape=\{!loading\}/)
  assert.match(dialog, /role="alert"/)
})
