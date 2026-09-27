import test from 'node:test'
import assert from 'node:assert/strict'
import { buildComingUp } from '../supabase/functions/_shared/coming-up.mjs'

// The Sunday "coming up" digest (FAMILY_WALL_PLAN.md P3.19 step 3): only what needs lead time, each
// with one next step and one "poke me" date. Birthdays and relationship dates two months ahead
// (Jake: "I'd say 2 months before each birthday and relationship events like anniversary"), a
// remembrance with no gift ("Connie passed is still good to keep. No gift of course").
const now = new Date('2026-09-27T18:00:00-04:00')
const ev = (id, title, start, extra = {}) => ({ id, title, start_time: start, end_time: start, all_day: false, event_type: 'event', description: null, ...extra })
const allDay = (id, title, date, description = null) => ev(id, title, `${date}T00:00:00Z`, { all_day: true, description })
const events = [
  allDay('carl', "Carl's birthday", '2026-12-04', 'Casa · date we keep · birthday'),
  allDay('jebb', "Jebb's birthday", '2027-01-23', 'Casa · date we keep · birthday'),
  allDay('anniv', "Jake & Kelly's anniversary", '2027-08-28', 'Casa · date we keep · anniversary'),
  allDay('connie', 'Connie Passed', '2027-03-25', 'Casa · date we keep · remembrance'),
  ev('forms', 'Liv BAK Athletics Aktivate System Due', '2026-10-12T16:00:00-04:00'),
  ev('try1', 'BAK Softball Tryouts', '2026-10-19T15:00:00-04:00'),
  ev('try2', 'BAK Softball Tryouts', '2026-10-20T15:00:00-04:00'),
  ev('cats', 'Cats & Dogs Exhibition Preview', '2026-10-10T12:00:00-04:00'),
  allDay('columbus', 'Celebrate Columbus Day Holiday', '2026-10-12'),
  allDay('thanks', 'Thanksgiving Day', '2026-11-26'),
  ev('dentist', 'Dentist (Dr. Ledakis)', '2026-10-09T09:30:00-04:00'),
  ev('dentist-dup', 'Dentist (Dr. Ledakis)', '2026-10-09T09:30:00-04:00'),
  ev('dentist-other-name', 'Dentist Appointment', '2026-10-09T09:30:00-04:00'),
  ev('game', 'Softball: RPB Blaze @ Huskies', '2026-09-30T18:30:00-04:00'),
  ev('school', 'Drop off Emme @ Palm Beach Public Elementary School · Late Strings Pickup', '2026-10-01T08:00:00-04:00'),
  ev('trash', 'Take out the Trash', '2026-11-09T19:00:00-05:00'),
]
const giftIdeas = [{ for_name: 'Jebb', idea: 'a soccer-team sweatshirt and T-shirt' }]

const byKey = (items) => Object.fromEntries(items.map((i) => [i.key, i]))

test('only what needs lead time: no games, school runs or chores', () => {
  const items = buildComingUp({ now, events, giftIdeas })
  const titles = items.map((i) => i.title)
  for (const noise of ['Softball: RPB Blaze @ Huskies', 'Take out the Trash']) assert.ok(!titles.includes(noise), noise)
  assert.ok(!titles.some((t) => t.startsWith('Drop off Emme')))
})

test('birthdays and anniversaries two months ahead, with the gift ideas saved for that person', () => {
  const items = byKey(buildComingUp({ now, events, giftIdeas }))
  assert.equal(items['carl'].pokeOn, '2026-10-05', 'eight and a half weeks out: pokes at two months')
  assert.equal(items['carl'].nextStep, 'Pick a gift')
  assert.equal(items['jebb'], undefined, 'not yet — Jan 23 is more than two months away')
  const later = byKey(buildComingUp({ now: new Date('2026-11-30T18:00:00-05:00'), events, giftIdeas }))
  assert.deepEqual(later['jebb'].ideas, ['a soccer-team sweatshirt and T-shirt'])
  assert.equal(later['jebb'].pokeOn, '2026-11-24')
})

test('a remembrance is a quiet note a week before, never a gift', () => {
  const march = byKey(buildComingUp({ now: new Date('2027-03-20T18:00:00-04:00'), events, giftIdeas }))
  assert.equal(march['connie'].nextStep, 'A quiet day to remember')
  assert.equal(march['connie'].ideas, undefined)
  assert.equal(march['connie'].pokeOn, '2027-03-18')
})

test('each kind gets its own next step and lead time', () => {
  const items = byKey(buildComingUp({ now, events, giftIdeas }))
  assert.equal(items['forms'].nextStep, 'Get it done')
  assert.equal(items['forms'].pokeOn, '2026-10-05')
  assert.equal(items['try1'].nextStep, 'Check what’s needed and who drives')
  assert.equal(items['columbus'].nextStep, 'No school? Who’s with the kids')
  assert.equal(items['thanks'].nextStep, 'Hosting or going?')
  assert.equal(items['dentist'].nextStep, 'Make sure it works with work')
})

test('repeats of the same thing come once, at the first date', () => {
  const items = buildComingUp({ now, events, giftIdeas })
  assert.equal(items.filter((i) => i.title === 'BAK Softball Tryouts').length, 1)
  assert.equal(items.filter((i) => i.title.startsWith('Dentist')).length, 1)
})

test('done and snoozed items step aside; the list is in poke order', () => {
  const state = { forms: { done_at: '2026-09-27T20:00:00Z' }, columbus: { snoozed_until: '2026-10-08' } }
  const items = buildComingUp({ now, events, giftIdeas, state })
  assert.ok(!items.some((i) => i.key === 'forms'))
  assert.ok(!items.some((i) => i.key === 'columbus'))
  const pokes = items.map((i) => i.pokeOn)
  assert.deepEqual(pokes, [...pokes].sort())
})

test('only six weeks of events, but dates we keep from two months out', () => {
  const items = buildComingUp({ now, events: [...events, ev('far', 'Birthday party at Coopers', '2026-12-20T14:00:00-05:00')], giftIdeas })
  assert.ok(!items.some((i) => i.key === 'far'))
  assert.ok(items.some((i) => i.key === 'carl'))
})
