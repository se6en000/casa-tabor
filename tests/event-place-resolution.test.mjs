import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findSavedEventPlace,
  selectConfidentEventPlace,
} from '../supabase/functions/_shared/event-place-resolution.mjs'

test('selects a business matching the expressed venue identity', () => {
  const place = selectConfidentEventPlace('Sky Zone Palm Springs', [{
    name: 'Sky Zone Trampoline Park',
    address: '964 S Congress Ave, Palm Springs, FL 33406, USA',
    primary_type: 'amusement_center',
  }])

  assert.equal(place?.name, 'Sky Zone Trampoline Park')
})

test('rejects a city-only Places result as an event destination', () => {
  const place = selectConfidentEventPlace('Palm Springs', [{
    name: 'Palm Springs',
    address: 'Palm Springs, FL, USA',
    primary_type: 'locality',
  }])

  assert.equal(place, null)
})

test('prefers an exact saved-place alias', () => {
  const place = findSavedEventPlace('school', [{
    name: 'Palm Beach Day Academy',
    aliases: ['school', 'PBDA'],
    address: '1901 S Flagler Dr',
  }])

  assert.equal(place?.name, 'Palm Beach Day Academy')
})

// Kelly, Oct 2: "I'm going to the gym 730 to 9 PM" was saved at a place called "Gym" with no address; the lookup after
// it searched Google for "Gym" across Florida and wrote IRON RELIGION GYM, Orlando into her event. A plain word for a
// kind of place is never looked up as a business; it's where that person went for it last.
import { isGenericPlace, pickUsualPlace } from '../supabase/functions/_shared/event-place-resolution.mjs'

test('a plain word for a kind of place is not a business to search for', () => {
  for (const q of ['Gym', 'the gym', 'school', 'Work', 'the dentist', 'Doctor', 'practice']) assert.equal(isGenericPlace(q), true, q)
  for (const q of ['Amped Fitness Signature', 'Iron Religion Gym', 'Palm Beach Public', 'Smile Dental']) assert.equal(isGenericPlace(q), false, q)
  assert.equal(selectConfidentEventPlace('Gym', [{ name: 'IRON RELIGION GYM', address: '5247 International Dr, Orlando, FL 32819, USA', primary_type: 'gym' }]), null)
})

test('the usual place: where this person last went for it, with an address', () => {
  const past = [
    { title: 'Gym', location_name: 'Amped Fitness Signature', address: '2771 S Dixie Hwy, West Palm Beach, FL 33405', start_time: '2026-09-30T23:30:00Z', member_ids: ['kelly'] },
    { title: 'Workout', location_name: 'Amped Fitness', address: '3101 PGA Blvd, Palm Beach Gardens, FL 33410', start_time: '2026-09-28T23:30:00Z', member_ids: ['kelly'] },
    { title: 'Gym', location_name: 'Orangetheory', address: '1 Other Rd', start_time: '2026-10-01T12:00:00Z', member_ids: ['jake-id'] },
    { title: 'Liv dentist', location_name: 'Smile Dental', address: '1 Tooth St', start_time: '2026-07-10T14:00:00Z', member_ids: ['liv'] },
  ]
  assert.deepEqual(pickUsualPlace('Gym', past, ['kelly']), { name: 'Amped Fitness Signature', address: '2771 S Dixie Hwy, West Palm Beach, FL 33405' })
  assert.deepEqual(pickUsualPlace('the gym', past, ['jake-id']), { name: 'Orangetheory', address: '1 Other Rd' })
  assert.deepEqual(pickUsualPlace('the dentist', past, ['owen']), { name: 'Smile Dental', address: '1 Tooth St' }) // nobody's own: the family's last
  assert.equal(pickUsualPlace('school', past, ['kelly']), null)
})

// How sure (Jake, Oct 2: "what happens if it doesn't really know the place … the confidence is like 50% or 60%"): sure
// is filled in; not sure keeps up to three choices to pick from; no idea leaves the name. Nothing far from home unless
// the place was said with its town.
import { placeConfidence } from '../supabase/functions/_shared/event-place-resolution.mjs'

const home = { lat: 26.68, lng: -80.06 } // West Palm Beach
const wpb = (name, address, dLat = 0.02) => ({ name, address, lat: home.lat + dLat, lng: home.lng, primary_type: 'establishment' })

test('sure: one place clearly by that name, near home', () => {
  const r = placeConfidence('Smile Dental', [wpb('Smile Dental', '1 Tooth St, West Palm Beach, FL')], home)
  assert.equal(r.level, 'sure')
  assert.equal(r.pick.name, 'Smile Dental')
})

test('not sure: two near home by that name — both offered, neither written', () => {
  const r = placeConfidence('Amped Fitness', [wpb('Amped Fitness Signature', '2771 S Dixie Hwy, West Palm Beach, FL'), wpb('Amped Fitness', '3101 PGA Blvd, Palm Beach Gardens, FL', 0.15)], home)
  assert.equal(r.level, 'unsure')
  assert.deepEqual(r.choices.map((c) => c.address), ['2771 S Dixie Hwy, West Palm Beach, FL', '3101 PGA Blvd, Palm Beach Gardens, FL'])
})

test('far from home is dropped unless the town was said', () => {
  const orlando = { name: 'Iron Religion Gym', address: '5247 International Dr, Orlando, FL 32819, USA', lat: 28.45, lng: -81.47, primary_type: 'gym' }
  assert.equal(placeConfidence('Iron Religion', [orlando], home).level, 'none')
  assert.equal(placeConfidence('Iron Religion Orlando', [orlando], home).level, 'sure')
})

test('only a word in common is not sure; nothing in common is no idea', () => {
  const r = placeConfidence('Sky Zone', [wpb('Sky High Trampoline', '9 Jump Rd, West Palm Beach, FL')], home)
  assert.equal(r.level, 'unsure')
  assert.equal(placeConfidence('Sky Zone', [wpb('Bounce House', '9 Jump Rd')], home).level, 'none')
  assert.equal(placeConfidence('Gym', [wpb('Iron Gym', '1 A St')], home).level, 'none') // a kind of place: the usual place, never a guess
})
