import test from 'node:test'
import assert from 'node:assert/strict'
import { boxAround, milesBetween, nearestFirst } from '../supabase/functions/_shared/place-nearby.mjs'

// Jake, 2026-10-01: "Planet fitness should show me the ones in west palm first, then others within my radius".
const home = { lat: 26.8386, lng: -80.0831 }

test('the search is boxed around home (a rectangle: Google refuses a circle restriction)', () => {
  const box = boxAround(home.lat, home.lng, 50).rectangle
  assert.ok(box.low.latitude < home.lat && box.high.latitude > home.lat)
  assert.ok(box.low.longitude < home.lng && box.high.longitude > home.lng)
  assert.ok(Math.abs(box.high.latitude - box.low.latitude - 0.904) < 0.01)
})

test('nearest first, with miles', () => {
  const sorted = nearestFirst([
    { name: 'Planet Fitness Boca', lat: 26.36, lng: -80.10 },
    { name: 'Planet Fitness West Palm', lat: 26.71, lng: -80.06 },
    { name: 'No location' },
  ], home)
  assert.deepEqual(sorted.map((p) => p.name), ['Planet Fitness West Palm', 'Planet Fitness Boca', 'No location'])
  assert.equal(sorted[0].miles, 9)
  assert.equal(sorted[1].miles, 33)
  assert.ok(milesBetween(home, home) === 0)
})
