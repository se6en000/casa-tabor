import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isQuantifiedCalendarDelete,
  shouldPreferCalendarOverGrocery,
} from '../supabase/functions/_shared/assistant-domain-arbitration.mjs'

test('explicit calendar context outranks generic grocery-add wording', () => {
  assert.equal(shouldPreferCalendarOverGrocery(
    'I need a parent conference Friday at 9 AM on the calendar.',
    { page: 'calendar' },
  ), true)
  assert.equal(shouldPreferCalendarOverGrocery(
    'Get rid of this appointment.',
    { page: 'calendar', activeEntityType: 'event' },
  ), true)
})

test('explicit grocery language remains grocery even from the calendar surface', () => {
  assert.equal(shouldPreferCalendarOverGrocery(
    'Add milk to the grocery list before tomorrow.',
    { page: 'calendar' },
  ), false)
  assert.equal(shouldPreferCalendarOverGrocery(
    'I need eggs.',
    { page: 'calendar' },
  ), false)
})

test('quantified calendar deletes are separated from single-target planning', () => {
  assert.equal(isQuantifiedCalendarDelete('Clear all dentist appointments from my schedule.'), true)
  assert.equal(isQuantifiedCalendarDelete('Remove each meeting from the calendar.'), true)
  assert.equal(isQuantifiedCalendarDelete('Remove the dentist appointment.'), false)
  assert.equal(isQuantifiedCalendarDelete('Remove every checked grocery item.'), false)
})
