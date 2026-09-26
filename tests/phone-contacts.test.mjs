import test from 'node:test'
import assert from 'node:assert/strict'
import { contactCards } from '../src/phone/contacts.ts'

const places = [{ id: 'p-ferrin', name: 'Ferrin Park', address: '11921 Okeechobee Blvd', city: 'Royal Palm Beach', state: 'FL', zip: '33411' }]
const contacts = [
  { id: 'c1', name: 'Coach Mike', aliases: ['Mike Alvarez'], relationship: "Liv's softball coach", phone: '(561) 555-0101', email: null, address: null, primary_place_id: 'p-ferrin', confirmed: true, occurrence_count: 12, dismissed_at: null },
  { id: 'c2', name: 'Layla Brooks', aliases: [], relationship: "Liv's friend", phone: null, email: null, address: '700 S Rosemary Ave, West Palm Beach, FL', primary_place_id: null, confirmed: true, occurrence_count: 3, dismissed_at: null },
  { id: 'c3', name: 'Meredith', aliases: [], relationship: 'violin teacher', phone: '561-555-0199', email: null, address: null, primary_place_id: null, confirmed: false, occurrence_count: 20, dismissed_at: null },
  { id: 'c4', name: 'Old Plumber', aliases: [], relationship: null, phone: '561-555-0000', email: null, address: null, primary_place_id: null, confirmed: true, occurrence_count: 1, dismissed_at: '2026-01-01T00:00:00Z' },
]

test('everyone worth calling, confirmed first then the ones seen most; dismissed ones never', () => {
  assert.deepEqual(contactCards(contacts, places, '').map((c) => c.id), ['c1', 'c2', 'c3'])
})

test('search matches a name, an alias, a relationship or a place, word by word', () => {
  assert.deepEqual(contactCards(contacts, places, 'alvarez').map((c) => c.id), ['c1'])
  assert.deepEqual(contactCards(contacts, places, 'liv coach').map((c) => c.id), ['c1'])
  assert.deepEqual(contactCards(contacts, places, 'violin').map((c) => c.id), ['c3'])
  assert.deepEqual(contactCards(contacts, places, 'ferrin').map((c) => c.id), ['c1'])
})

test('each card has what the buttons need: a dialable number and where to drive (their address, or their place)', () => {
  const [mike] = contactCards(contacts, places, 'mike')
  assert.equal(mike.tel, '+15615550101')
  assert.equal(mike.address, '11921 Okeechobee Blvd, Royal Palm Beach, FL 33411')
  assert.equal(mike.placeName, 'Ferrin Park')
  const [layla] = contactCards(contacts, places, 'layla')
  assert.equal(layla.tel, null)
  assert.equal(layla.address, '700 S Rosemary Ave, West Palm Beach, FL')
})
