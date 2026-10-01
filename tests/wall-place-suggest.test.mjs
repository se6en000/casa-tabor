import test from 'node:test'
import assert from 'node:assert/strict'
import { placeList, guessKind } from '../src/wall/placeSuggest.ts'

// Canvas row 23 (Jake, 2026-10-01): your places first, then the map's, nearest first ("just use the known places and
// the first place to look, then the google maps").
const saved = [
  { id: 'p1', name: 'Royal Palm Beach Commons Park', aliases: [], address: '11600 Poinciana Blvd', city: 'Royal Palm Beach', state: 'FL', zip: '33411', occurrence_count: 5, dismissed_at: null },
  { id: 'p2', name: 'Bak Middle School', aliases: ['Bak'], address: '1501 Avenue U', city: 'Riviera Beach', state: 'FL', zip: null, occurrence_count: 30, dismissed_at: null },
]
const results = [
  { place_id: 'g1', name: 'Royal Palm Beach Commons Park', address: '11600 Poinciana Blvd, Royal Palm Beach, FL', lat: 1, lng: 1 },
  { place_id: 'g2', name: 'Royal Palm Beach Cultural Center', address: '151 Civic Center Way, Royal Palm Beach, FL', lat: 1, lng: 1, primary_type: 'community_center', miles: 13 },
]

test('typing: one list, yours first, the map’s below without the ones you have', () => {
  const list = placeList('royal pa', saved, results)
  assert.deepEqual(list.map((o) => [o.name, o.tag ?? 'map']), [['Royal Palm Beach Commons Park', 'YOURS'], ['Royal Palm Beach Cultural Center', 'map']])
  assert.equal(list[0].savedId, 'p1')
  assert.equal(list[1].result.place_id, 'g2')
  assert.equal(list[1].miles, 13)
})

test('a new place saved gets a guessed kind', () => {
  assert.equal(guessKind({ name: 'Wellington High School', primary_type: 'school' }), 'school')
  assert.equal(guessKind({ name: 'Lake Lytal Park', primary_type: 'park' }), 'sports')
  assert.equal(guessKind({ name: 'Wanuck, Hier & Associates', primary_type: 'dentist' }), 'medical')
  assert.equal(guessKind({ name: 'Royal Palm Beach Cultural Center', primary_type: 'community_center' }), 'other')
})
