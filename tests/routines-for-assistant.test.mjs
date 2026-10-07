import test from 'node:test'
import assert from 'node:assert/strict'
import { routinesSection } from '../supabase/functions/_shared/routines-for-assistant.mjs'
import { assessCalendarCreatePreflight } from '../supabase/functions/_shared/assistant-calendar-create-preflight.mjs'
import { buildFullAiSystem } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// The family's routines as saved on Oct 7 (Owen's school, then With Giselle; Liv picked up at the Tri-Rail).
const family = [{ id: 'owen', name: 'Owen' }, { id: 'liv', name: 'Liv' }, { id: 'emme', name: 'Emme' }]
const rows = (memberId, payload, days = [1, 2, 3, 4, 5]) => days.map((d) => ({ member_id: memberId, day_of_week: d, reason: JSON.stringify({ type: 'family_routine', enabled: true, ...payload }) }))
const rules = [
  ...rows('owen', { key: 'main', routineType: 'school', title: 'School Routine', venueName: 'Palm Beach Public Elementary School', startLocal: '07:35', endLocal: '14:00', dropoffDriverName: 'Jake', pickupDriverName: 'Giselle' }),
  ...rows('owen', { key: 'care-giselle', routineType: 'care', title: 'With Giselle', venueName: 'Giselle’s house', startLocal: '14:00', endLocal: '17:00', dropoffDriverName: '', pickupDriverName: 'Giselle' }),
  ...rows('liv', { key: 'main', routineType: 'school', title: 'School Routine', venueName: 'Bak Middle School of the Arts', startLocal: '08:00', endLocal: '15:30', dropoffDriverName: 'Kelly', pickupDriverName: 'Giselle', pickupVenueName: 'West Palm Beach Tri-Rail Station' }),
  ...rows('emme', { key: 'main', routineType: 'school', title: 'School Routine', venueName: 'Palm Beach Public Elementary School', startLocal: '07:35', endLocal: '14:00', dropoffDriverName: 'Jake', pickupDriverName: 'Giselle', dayOverrides: [{ dayOfWeek: 2, startLocal: '07:00', endLocal: '14:00', label: 'Early Beethoven Strings', enabled: true }] }),
  { member_id: 'owen', day_of_week: 1, start_local: '09:00', reason: 'not a routine' },
]

test('Alexa knows the routines: who, where, when, who drives — and who has Owen 2–5', () => {
  const s = routinesSection(rules, family, [{ member_id: 'owen', start_at: '2026-10-12T04:00:00Z', note: 'Columbus Day · Giselle has them' }, { member_id: 'liv', start_at: '2026-12-23T05:00:00Z', note: 'Day off' }])
  assert.match(s, /- Owen: School at Palm Beach Public Elementary School, Mon–Fri 7:35 AM–2 PM — Jake drops off, Giselle picks up/)
  assert.match(s, /- Owen: With Giselle at Giselle’s house, Mon–Fri 2 PM–5 PM — Giselle has Owen then and brings Owen home/)
  assert.match(s, /- Liv: School at Bak Middle School of the Arts, Mon–Fri 8 AM–3:30 PM — Kelly drops off, Giselle picks up at West Palm Beach Tri-Rail Station/)
  assert.match(s, /- Emme: .*; but Tue 7 AM–2 PM \(Early Beethoven Strings\)/)
  assert.match(s, /Days off ahead \(no routine that day\): Owen 2026-10-12 \(Columbus Day · Giselle has them\), Liv 2026-12-23$/m)
  assert.match(s, /is not a clash — don't warn about it/)
  assert.equal(routinesSection([], family), null)
})

test('the assistant’s prompt carries the routines', () => {
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], pending: null, onScreenIds: [], utcOffset: '-04:00', now: new Date('2026-10-07T15:40:00Z'), homeCity: 'West Palm Beach', routines: routinesSection(rules, family) })
  assert.match(system, /ROUTINES \(every week/)
})

test('saving: a school run’s calendar copy is no clash; a real appointment for the same person still is', () => {
  const at = (h) => `2026-10-08T${String(h).padStart(2, '0')}:00:00-04:00`
  const ev = (title, h) => ({ id: title, title, event_type: 'event', start_time: at(h), end_time: at(h + 1), event_members: [{ family_members: { name: 'Owen' } }] })
  const args = { title: 'Dentist', start: at(14), end: at(15), members: ['Owen'] }
  assert.equal(assessCalendarCreatePreflight([ev('Pick up Owen @ Palm Beach Public', 14)], args).status, 'clear')
  assert.equal(assessCalendarCreatePreflight([ev('Swim lesson', 14)], args).status, 'requires_confirmation')
})
