import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSmartEvent } from '../src/utils/smartEventParser.ts'

const TEST_FAMILY = [
  { id: 'mem_jake', name: 'Jake' },
  { id: 'mem_kelly', name: 'Kelly' },
  { id: 'mem_liv', name: 'Liv' },
  { id: 'mem_emme', name: 'Emme' },
  { id: 'mem_tabor', name: 'Tabor Family' },
  { id: 'mem_owen', name: 'Owen' },
  { id: 'mem_giselle', name: 'Giselle' },
  { id: 'mem_milo', name: 'Milo' },
]

const TEST_PLACES = [
  { id: 'plc_gym', name: 'Gym' },
  { id: 'plc_dentist', name: 'Dental Care' },
  { id: 'plc_olive_garden', name: 'Olive Garden' },
  { id: 'plc_pet_supermarket', name: 'Pet Supermarket' },
]

test('parses "From 7 P.M to 9 pm Kelly is going to the gym"', () => {
  const refDate = new Date(2026, 7, 20, 10, 0) // Aug 20, 2026
  const result = parseSmartEvent('From 7 P.M to 9 pm Kelly is going to the gym', {
    referenceDate: refDate,
    familyMembers: TEST_FAMILY,
    savedPlaces: TEST_PLACES,
  })

  assert.equal(result.eventType, 'event')
  assert.equal(result.startDate.getHours(), 19)
  assert.equal(result.startDate.getMinutes(), 0)
  assert.equal(result.endDate.getHours(), 21)
  assert.equal(result.endDate.getMinutes(), 0)
  assert.deepEqual(result.matchedMemberIds, ['mem_kelly'])
  assert.equal(result.matchedPlaceName, 'Gym')
  assert.match(result.title, /going to the gym/i)
})

test('parses "Jake dentist appointment tomorrow at 2pm"', () => {
  const refDate = new Date(2026, 7, 20, 10, 0)
  const result = parseSmartEvent('Jake dentist appointment tomorrow at 2pm', {
    referenceDate: refDate,
    familyMembers: TEST_FAMILY,
    savedPlaces: TEST_PLACES,
  })

  assert.equal(result.eventType, 'event')
  assert.equal(result.startDate.getDate(), 21) // Tomorrow
  assert.equal(result.startDate.getHours(), 14) // 2 PM
  assert.deepEqual(result.matchedMemberIds, ['mem_jake'])
  assert.match(result.title, /dentist appointment/i)
})

test('parses "Remind Liv to pack soccer cleats by 8am"', () => {
  const refDate = new Date(2026, 7, 20, 10, 0)
  const result = parseSmartEvent('Remind Liv to pack soccer cleats by 8am', {
    referenceDate: refDate,
    familyMembers: TEST_FAMILY,
    savedPlaces: TEST_PLACES,
  })

  assert.equal(result.eventType, 'reminder')
  assert.equal(result.startDate.getHours(), 8)
  assert.equal(result.startDate.getMinutes(), 0)
  assert.deepEqual(result.matchedMemberIds, ['mem_liv'])
  assert.match(result.title, /pack soccer cleats/i)
})

test('parses "Dinner with Tabor Family Friday 6:30pm at Olive Garden"', () => {
  const refDate = new Date(2026, 7, 20, 10, 0) // Thursday Aug 20
  const result = parseSmartEvent('Dinner with Tabor Family Friday 6:30pm at Olive Garden', {
    referenceDate: refDate,
    familyMembers: TEST_FAMILY,
    savedPlaces: TEST_PLACES,
  })

  assert.equal(result.eventType, 'event')
  assert.equal(result.startDate.getDate(), 21) // Friday Aug 21
  assert.equal(result.startDate.getHours(), 18)
  assert.equal(result.startDate.getMinutes(), 30)
  assert.deepEqual(result.matchedMemberIds, ['mem_tabor'])
  assert.equal(result.matchedPlaceName, 'Olive Garden')
  assert.equal(result.quickSlot, 'evening')
})

test('parses "Drop off Milo at Pet Supermarket in the morning"', () => {
  const refDate = new Date(2026, 7, 20, 10, 0)
  const result = parseSmartEvent('Drop off Milo at Pet Supermarket in the morning', {
    referenceDate: refDate,
    familyMembers: TEST_FAMILY,
    savedPlaces: TEST_PLACES,
  })

  assert.equal(result.startDate.getHours(), 9)
  assert.equal(result.startDate.getMinutes(), 0)
  assert.deepEqual(result.matchedMemberIds, ['mem_milo'])
  assert.equal(result.matchedPlaceName, 'Pet Supermarket')
  assert.equal(result.quickSlot, 'morning')
})
