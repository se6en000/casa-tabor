import test from 'node:test'
import assert from 'node:assert/strict'
import { celebrationHonorees, surpriseSafeChecklist } from '../src/wall/surprise.ts'
import { members } from './fixtures/wall-day-2026-09-25.mjs'

const who = (title) => celebrationHonorees(title, members).sort()

test('an event celebrating someone in the family names them as the honoree', () => {
  assert.deepEqual(who("Kelly's Birthday"), ['kelly'])
  assert.deepEqual(who('Kelly BD Night Out'), ['kelly'])
  assert.deepEqual(who('Surprise party for Kelly'), ['kelly'])
  assert.deepEqual(who("Owen's 8th birthday party"), ['owen'])
  assert.deepEqual(who('Anniversary dinner — Jake & Kelly'), ['jake-id', 'kelly'].sort())
})

test('going to someone else\'s party, or an ordinary event, celebrates nobody in the family', () => {
  assert.deepEqual(who("Liv going to Piper's 13th Birthday Party"), [])
  assert.deepEqual(who('Softball: Huskies @ RPB Cascade'), [])
  assert.deepEqual(who('Kelly Workout'), [])
})

test('the wall never gets the prep for a celebration (the gift, the card); everything else passes through', () => {
  const events = [
    { id: 'bday', title: "Kelly's Birthday" },
    { id: 'night', title: 'Kelly BD Night Out' },
    { id: 'softball', title: 'Softball: Huskies @ RPB Cascade' },
  ]
  const items = [
    { id: '1', event_id: 'bday', label: 'Gift', checked: false, sort_order: 1 },
    { id: '2', event_id: 'night', label: 'Host gift / wine', checked: false, sort_order: 1 },
    { id: '3', event_id: 'softball', label: 'Glove', checked: false, sort_order: 1 },
  ]
  assert.deepEqual(surpriseSafeChecklist(items, events, members).map((i) => i.id), ['3'])
})
