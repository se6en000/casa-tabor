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

// Jake, 2026-09-27: "if there's a spirit day coming up for Emme and Owen I would like to know because
// they usually need specific kind of T-shirts … I need a way to easily mark it so it goes on the list."
test('something you add by voice goes on the list with your step and your notice', () => {
  const spirit = ev('spirit', "St. Patrick's Spirit Day", '2026-10-16T08:00:00-04:00')
  assert.equal(buildComingUp({ now, events: [spirit] }).length, 0, 'Casa would not catch it on its own')
  const state = { spirit: { custom_step: 'Green shirts for Emme and Owen', custom_lead_days: 5 } }
  const [item] = buildComingUp({ now, events: [spirit], state })
  assert.equal(item.nextStep, 'Green shirts for Emme and Owen')
  assert.equal(item.pokeOn, '2026-10-11')
  assert.equal(item.kind, 'added')
})

test('an "every time" rule catches each one, before Casa\'s own kinds', () => {
  const rules = [{ match: 'spirit day', step: 'Themed shirts for Emme and Owen', lead_days: 5 }]
  const items = buildComingUp({ now, rules, events: [ev('v', "Valentine's Spirit Day", '2026-10-14T08:00:00-04:00'), ev('p', 'Pajama Spirit Day', '2026-10-28T08:00:00-04:00')] })
  assert.deepEqual(items.map((i) => [i.title, i.nextStep, i.pokeOn]), [
    ["Valentine's Spirit Day", 'Themed shirts for Emme and Owen', '2026-10-09'],
    ['Pajama Spirit Day', 'Themed shirts for Emme and Owen', '2026-10-23'],
  ])
})

test('a rule can switch a kind off, or just change its notice', () => {
  const off = buildComingUp({ now, events, giftIdeas, rules: [{ match: 'dentist', off: true }] })
  assert.ok(!off.some((i) => i.title.startsWith('Dentist')))
  const longer = byKey(buildComingUp({ now, events, giftIdeas, rules: [{ match: 'tryouts', lead_days: 21 }] }))
  assert.equal(longer['try1'].pokeOn, '2026-09-28')
  assert.equal(longer['try1'].nextStep, 'Check what’s needed and who drives', 'keeps Casa\'s step when the rule has none')
})

// Jake's bug report 2026-09-27 3:24 PM: an idea saved "for Olivia" is Liv's (full name Olivia Tabor),
// so it belongs on "Liv's birthday" — a person by any of their names, whole words only.
test('a birthday gathers the ideas saved under any of that person\'s names', () => {
  const family = [{ id: 'm-liv', name: 'Liv', full_name: 'Olivia Tabor' }, { id: 'm-owen', name: 'Owen', full_name: 'Owen Tabor' }]
  const birthdays = [
    allDay('liv', "Liv's birthday", '2026-11-02', 'Casa · date we keep · birthday'),
    allDay('oliver', "Oliver's birthday", '2026-11-03', 'Casa · date we keep · birthday'),
  ]
  const ideas = [
    { for_name: 'Olivia', for_member_id: null, idea: 'a gymnastics coach' },
    { for_name: 'Liv', for_member_id: 'm-liv', idea: 'a leotard' },
    { for_name: 'Owen', for_member_id: 'm-owen', idea: 'a skateboard' },
  ]
  const items = byKey(buildComingUp({ now, events: birthdays, giftIdeas: ideas, family }))
  assert.deepEqual(items['liv'].ideas, ['a gymnastics coach', 'a leotard'])
  assert.deepEqual(items['oliver'].ideas, [])
})
