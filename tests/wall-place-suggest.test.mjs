import test from 'node:test'
import assert from 'node:assert/strict'
import { placeSuggestions, placeList, guessKind, titleKey } from '../src/wall/placeSuggest.ts'

// Canvas row 23 (Jake, 2026-10-01, approved): a place in fewer taps — suggestions before typing, one list as you type.
const now = new Date(2026, 8, 30, 20, 0)
const ev = (id, title, day, location_name, address = `${location_name} address`, members = ['liv']) => ({
  id, title, start_time: new Date(2026, 8, day, 17, 0).toISOString(), location_name, address, members: members.map((m) => ({ family_member_id: m })),
})
const events = [
  ev('h1', 'Huskies practice', 2, 'Lake Lytal Park'),
  ev('h2', 'Huskies practice', 9, 'Lake Lytal Park'),
  ev('h3', 'Huskies practice', 16, 'Seminole Palms Park'),
  ev('h4', 'Huskies practice', 23, 'Lake Lytal Park'),
  ev('d1', 'Dentist · Liv', 25, 'Palm Beach Pediatric Dentistry'),
  ev('x1', 'Dinner', 28, 'Home', ''),
  ev('future', 'Huskies practice', 30 + 7, 'Somewhere Else'),
  ev('old', 'Book club', 1, 'The Harrisons'),
]
const routines = [
  { memberId: 'liv', venueName: 'Bak Middle School', venueAddress: '1501 Avenue U', enabled: true },
  { memberId: 'owen', venueName: 'Palm Beach Public', venueAddress: '235 Hibiscus St', enabled: true },
]

test('before typing: where this event went before (most often first), their places, recent ones — no repeats, never Home', () => {
  const s = placeSuggestions({ title: 'Huskies practice', eventId: 'new', memberIds: ['liv'], events, routines, now })
  assert.deepEqual(s.before.map((o) => [o.name, o.tag]), [['Lake Lytal Park', '3 TIMES'], ['Seminole Palms Park', 'LAST TIME']])
  assert.deepEqual(s.theirs.map((o) => o.name), ['Bak Middle School'])
  assert.deepEqual(s.recent.map((o) => o.name), ['Palm Beach Pediatric Dentistry', 'The Harrisons'])
})

test('a titled series matches on the part before the colon', () => {
  assert.equal(titleKey('Softball: Huskies @ Wellington Knights'), titleKey('Softball: Huskies vs. Jupiter'))
  const s = placeSuggestions({ title: 'Softball: Huskies @ Knights', memberIds: [], routines: [], now, events: [ev('s1', 'Softball: Huskies vs Jupiter', 20, 'Commons Park')] })
  assert.deepEqual(s.before.map((o) => o.name), ['Commons Park'])
})

const saved = [
  { id: 'p1', name: 'Royal Palm Beach Commons Park', aliases: [], address: '11600 Poinciana Blvd', city: 'Royal Palm Beach', state: 'FL', zip: '33411', occurrence_count: 5, dismissed_at: null },
  { id: 'p2', name: 'Bak Middle School', aliases: ['Bak'], address: '1501 Avenue U', city: 'Riviera Beach', state: 'FL', zip: null, occurrence_count: 30, dismissed_at: null },
]
const results = [
  { place_id: 'g1', name: 'Royal Palm Beach Commons Park', address: '11600 Poinciana Blvd, Royal Palm Beach, FL', lat: 1, lng: 1 },
  { place_id: 'g2', name: 'Royal Palm Beach Cultural Center', address: '151 Civic Center Way, Royal Palm Beach, FL', lat: 1, lng: 1, primary_type: 'community_center' },
]

test('typing: one list, yours first, the map’s below without the ones you have', () => {
  const list = placeList('royal pa', saved, results)
  assert.deepEqual(list.map((o) => [o.name, o.tag ?? 'map']), [['Royal Palm Beach Commons Park', 'YOURS'], ['Royal Palm Beach Cultural Center', 'map']])
  assert.equal(list[0].savedId, 'p1')
  assert.equal(list[1].result.place_id, 'g2')
})

test('a new place is kept with a guessed kind', () => {
  assert.equal(guessKind({ name: 'Wellington High School', primary_type: 'school' }), 'school')
  assert.equal(guessKind({ name: 'Lake Lytal Park', primary_type: 'park' }), 'sports')
  assert.equal(guessKind({ name: 'Wanuck, Hier & Associates', primary_type: 'dentist' }), 'medical')
  assert.equal(guessKind({ name: 'Royal Palm Beach Cultural Center', primary_type: 'community_center' }), 'other')
})
