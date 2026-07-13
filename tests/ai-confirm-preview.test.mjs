import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCreatePreviewCopy,
  buildDeletePreviewCopy,
  buildUpdatePreviewCopy,
} from '../src/utils/aiConfirmPreview.ts'

const event = {
  title: 'Dentist appointment',
  start_time: '2026-07-14T20:00:00-04:00',
  end_time: '2026-07-14T21:00:00-04:00',
  all_day: false,
}

test('update preview explains the current and new time', () => {
  const preview = buildUpdatePreviewCopy({ id: 'event-1', start: '2026-07-14T16:00:00-04:00', end: '2026-07-14T17:00:00-04:00' }, event)
  assert.equal(preview.heading, 'Move "Dentist appointment"')
  assert.equal(preview.currentSpan, 'Tue, Jul 14 · 8:00 PM – 9:00 PM')
  assert.equal(preview.nextSpan, 'Tue, Jul 14 · 4:00 PM – 5:00 PM')
})

test('delete preview names the event and says what happens', () => {
  const preview = buildDeletePreviewCopy(event, { id: 'event-1' })
  assert.equal(preview.heading, 'Delete "Dentist appointment"')
  assert.match(preview.when ?? '', /8:00 PM/)
  assert.match(preview.note, /removes it from your calendar/)
})

test('create preview names the new event and date', () => {
  const preview = buildCreatePreviewCopy({
    title: 'Team lunch',
    start: '2026-07-16T12:00:00-04:00',
    end: '2026-07-16T13:00:00-04:00',
    location: 'The Square',
    members: ['Jake', 'Kelly'],
  })
  assert.equal(preview.heading, 'Create "Team lunch"')
  assert.equal(preview.when, 'Thu, Jul 16 · 12:00 PM – 1:00 PM')
  assert.deepEqual(preview.details, ['Location: The Square', 'Guests: Jake, Kelly'])
})
