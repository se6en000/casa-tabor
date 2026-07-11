import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyEventTravelFollowUp,
  eventTravelDestination,
  formatEventTravelAnswer,
} from '../supabase/functions/_shared/assistant-event-travel.mjs'
import { answerGroundedEventFollowUp } from '../supabase/functions/_shared/assistant-conversation-grounding.mjs'

const event = {
  title: 'Owen 6th Birthday Party',
  start_time: '2026-07-11T16:30:00Z',
  end_time: '2026-07-11T18:30:00Z',
  location_name: 'Greenacres Bowl',
  address: '6126 Lake Worth Rd. Greenacres, FL 33463',
}

test('event travel follow-ups distinguish routes from ambiguous duration', () => {
  for (const text of ['How long will it take to get there?', 'How long is the drive?', 'When should we leave?']) {
    assert.equal(classifyEventTravelFollowUp(text), 'route', text)
  }
  assert.equal(classifyEventTravelFollowUp('How long will it take?'), 'ambiguous')
  assert.equal(classifyEventTravelFollowUp('How long is the party?'), null)
})

test('event travel destination prefers the authoritative calendar address', () => {
  assert.equal(eventTravelDestination(event), event.address)
  assert.equal(eventTravelDestination({ location_name: 'Greenacres Bowl' }), 'Greenacres Bowl')
  assert.equal(eventTravelDestination({}), null)
})

test('event travel answers expose route facts without inventing an address', () => {
  const answer = formatEventTravelAnswer(event, {
    found: true,
    drive_time_mins: 24,
    distance_miles: 12.3,
    traffic_delay_mins: 4,
    buffer_mins: 10,
    leave_by: '2026-07-11T15:56:00Z',
  }, () => '11:56 AM')
  assert.match(answer, /24 minutes/)
  assert.match(answer, /12.3 miles/)
  assert.match(answer, /leave by 11:56 AM/)
  assert.doesNotMatch(answer, /6606 Forest Hill/)
})

test('event duration follow-ups remain deterministic calendar answers', () => {
  assert.equal(answerGroundedEventFollowUp('How long is the party?', event), '"Owen 6th Birthday Party" lasts 2 hours.')
})
