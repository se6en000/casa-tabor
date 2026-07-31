import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAssistantEventHref,
  linkAssistantEventMentions,
  parseAssistantEventHref,
} from '../src/lib/assistantEventLinks.ts'

test('links unique appointment mentions in assistant text', () => {
  const text = 'Up next today: Edison Insurance Bill Payment at 9:00 AM.'
  const linked = linkAssistantEventMentions(text, [
    { id: 'evt-1', title: 'Edison Insurance Bill Payment' },
  ])

  assert.equal(
    linked,
    `Up next today: [Edison Insurance Bill Payment](${buildAssistantEventHref('evt-1')}) at 9:00 AM.`,
  )
})

test('preserves existing markdown links while linking appointments', () => {
  const text = 'Review [travel notes](https://example.com) before Dentist Appointment.'
  const linked = linkAssistantEventMentions(text, [
    { id: 'evt-2', title: 'Dentist Appointment' },
  ])

  assert.equal(
    linked,
    `Review [travel notes](https://example.com) before [Dentist Appointment](${buildAssistantEventHref('evt-2')}).`,
  )
})

test('uses the preferred event when duplicate titles exist', () => {
  const text = 'I found Physical Therapy on your schedule.'
  const linked = linkAssistantEventMentions(text, [
    { id: 'evt-a', title: 'Physical Therapy' },
    { id: 'evt-b', title: 'Physical Therapy' },
  ], { preferredEventId: 'evt-b' })

  assert.equal(
    linked,
    `I found [Physical Therapy](${buildAssistantEventHref('evt-b')}) on your schedule.`,
  )
})

test('parses assistant event hrefs', () => {
  assert.equal(parseAssistantEventHref('casa://event/evt-9'), 'evt-9')
  assert.equal(parseAssistantEventHref('https://example.com'), null)
})
