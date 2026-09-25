import test from 'node:test'
import assert from 'node:assert/strict'
import { yourPlaces, isNamedPlace, placeFromSaved, placeFromSearch } from '../src/wall/places.ts'

// Shaped like production saved_places rows (2026-09-25), including the leftovers.
const row = (name, extra = {}) => ({ id: name, name, aliases: [], address: null, city: null, state: null, zip: null, category: 'other', occurrence_count: 0, dismissed_at: null, ...extra })
const saved = [
  row('Seminole Palms Park', { address: '151 Lamstein Ln', city: 'Royal Palm Beach', state: 'FL', occurrence_count: 6, category: 'sports' }),
  row("Giselle's house", { address: '2691 Kentucky St', city: 'West Palm Beach', state: 'FL', occurrence_count: 9, category: 'friends_house' }),
  row('Community Park', { address: '1610-1698 Carandis Rd', city: 'Lake Clarke Shores', occurrence_count: 3, category: 'sports', aliases: ['carandis'] }),
  row('100 Greenwood Drive, West Palm Beach, FL'),
  row('4510 PGA BLVD STE 101, PALM BEACH GARDENS, FL-33418-3968', { address: '4510 PGA Blvd' }),
  row('Old dentist', { address: '1 Main St', dismissed_at: '2026-01-01T00:00:00Z' }),
  row('EWR', { category: 'travel' }),
]

test('raw addresses saved as names are not offered as "your places"', () => {
  assert.equal(isNamedPlace(saved[3]), false)
  assert.equal(isNamedPlace(saved[4]), false)
  assert.equal(isNamedPlace(saved[0]), true)
})

test('your places: named, not dismissed, with an address, most used first', () => {
  assert.deepEqual(yourPlaces(saved, '').map((p) => p.name), ["Giselle's house", 'Seminole Palms Park', 'Community Park'])
})

test('typing narrows your places by name, alias or street', () => {
  assert.deepEqual(yourPlaces(saved, 'seminole').map((p) => p.name), ['Seminole Palms Park'])
  assert.deepEqual(yourPlaces(saved, 'carandis').map((p) => p.name), ['Community Park'])
  assert.deepEqual(yourPlaces(saved, 'kentucky').map((p) => p.name), ["Giselle's house"])
})

test('a saved place or a search result becomes the event\'s place with a full address', () => {
  assert.deepEqual(placeFromSaved(saved[0]), { name: 'Seminole Palms Park', address: '151 Lamstein Ln, Royal Palm Beach, FL' })
  const result = { place_id: 'x', name: 'Royal Palm Beach Commons Park', address: '11600 Poinciana Blvd, Royal Palm Beach, FL 33411, USA', city: 'Royal Palm Beach', state: 'FL', zip: '33411', street: '11600 Poinciana Blvd', lat: 26.7, lng: -80.2, phone: null, primary_type: 'park' }
  assert.deepEqual(placeFromSearch(result), { name: 'Royal Palm Beach Commons Park', address: '11600 Poinciana Blvd, Royal Palm Beach, FL 33411, USA' })
})
