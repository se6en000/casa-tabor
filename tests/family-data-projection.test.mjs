import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFamilyDataProjection } from '../supabase/functions/_shared/family-data-projection.mjs'

test('event and reminder projections retain authoritative coordination details', () => {
  const row = {
    id: 'event-1',
    title: 'Owen therapy',
    description: 'Bring the signed progress form',
    start_time: '2026-08-10T14:00:00.000Z',
    end_time: '2026-08-10T15:00:00.000Z',
    event_type: 'event',
    status: 'confirmed',
    location_name: 'Hope Center',
    address: '123 Main St',
    updated_at: '2026-08-07T12:00:00.000Z',
    event_members: [{ family_members: { name: 'Owen' } }],
    event_enrichments: [{ category: 'medical', prep_notes: 'Arrive ten minutes early' }],
    event_checklist_items: [{ label: 'Progress form', checked: false }],
    event_action_items: [],
  }

  const projection = buildFamilyDataProjection('event', row)
  assert.equal(projection.title, 'Owen therapy')
  assert.equal(projection.category, 'medical')
  assert.match(projection.redacted_text, /Hope Center/)
  assert.match(projection.redacted_text, /Progress form/)
  assert.deepEqual(projection.entity_refs, ['Owen'])
})

test('dismissed, cancelled, unconfirmed, and inactive sources are excluded', () => {
  assert.equal(buildFamilyDataProjection('event', { id: 'e', status: 'cancelled' }), null)
  assert.equal(buildFamilyDataProjection('prep', { id: 'p', dismissed: true }), null)
  assert.equal(buildFamilyDataProjection('person', { id: 'c', confirmed: false }), null)
  assert.equal(buildFamilyDataProjection('relationship', { id: 'r', confirmed: false }), null)
  assert.equal(buildFamilyDataProjection('memory', { id: 'm', status: 'archived' }), null)
})

test('activity and directory projections avoid private notes and credentials', () => {
  const person = buildFamilyDataProjection('person', {
    id: 'contact-1',
    name: 'Coach Glen',
    relationship: 'coach',
    confirmed: true,
    notes: 'PIN: 1234',
    updated_at: '2026-08-07T12:00:00.000Z',
  })
  assert.match(person.redacted_text, /Coach Glen/)
  assert.doesNotMatch(person.redacted_text, /1234/)

  const activity = buildFamilyDataProjection('activity', {
    id: 'notice-1',
    title: 'School schedule changed',
    body: 'Monday pickup moved to 3 PM',
    created_at: '2026-08-07T12:00:00.000Z',
  })
  assert.match(activity.redacted_text, /pickup moved/)
})
