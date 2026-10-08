import test from 'node:test'
import assert from 'node:assert/strict'
import { buildComingUp, SEASONS } from '../supabase/functions/_shared/coming-up.mjs'

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
  const spirit = ev('spirit', "St. Patrick's parade at school", '2026-10-16T08:00:00-04:00')
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

test('an item says whose gift ideas it carries, so a phone can keep them from that person', () => {
  const family = [{ id: 'm-liv', name: 'Liv', full_name: 'Olivia Tabor' }]
  const items = byKey(buildComingUp({
    now,
    events: [allDay('liv', "Liv's birthday", '2026-11-02', 'Casa · date we keep · birthday'), allDay('jebb', "Jebb's birthday", '2026-11-05', 'Casa · date we keep · birthday')],
    giftIdeas: [{ for_name: 'Olivia', for_member_id: null, idea: 'a gymnastics coach' }, { for_name: 'Jebb', for_member_id: null, idea: 'a sweatshirt' }],
    family,
  }))
  assert.deepEqual(items['liv'].ideasFor, ['m-liv'])
  assert.deepEqual(items['jebb'].ideasFor, [])
})

// Jake, 2026-09-28: "a bunch of birthdays in October would make it to that screen but they don't …
// any event that requires a gift or planning to bring something should show up." Only the family's
// "dates we keep" counted as birthdays; Heather's, Saraya's and Pilot's never showed.
test('anyone\'s birthday or anniversary: a card or gift, three weeks ahead', () => {
  const items = byKey(buildComingUp({ now, events: [
    allDay('heather', "Heather's Birthday", '2026-10-07'),
    allDay('saraya', "Saraya's Birthday", '2026-10-19'),
    allDay('anniv2', "Mike & Sara's anniversary", '2026-10-12'),
  ] }))
  assert.equal(items['heather'].nextStep, 'Card or gift?')
  assert.equal(items['heather'].pokeOn, '2026-09-16')
  assert.equal(items['saraya'].pokeOn, '2026-09-28')
  assert.equal(items['anniv2'].nextStep, 'Card or gift?')
})

test('a birthday party stays a party; a family "date we keep" keeps its two months', () => {
  const items = byKey(buildComingUp({ now, events: [
    ev('piper', "Liv going to Piper's 13th Birthday Party", '2026-10-16T17:00:00-04:00'),
    allDay('carl', "Carl's birthday", '2026-12-04', 'Casa · date we keep · birthday'),
  ] }))
  assert.equal(items['piper'].nextStep, 'RSVP and get a gift')
  assert.equal(items['carl'].nextStep, 'Pick a gift')
})

test('the same person\'s birthday twice on a day counts once', () => {
  const items = buildComingUp({ now, events: [
    allDay('carl', "Carl's birthday", '2026-12-03', 'Casa · date we keep · birthday'),
    ev('carl2', "Carl Tabor's birthday", '2026-12-03T05:00:00Z', { all_day: true }),
  ] })
  assert.deepEqual(items.map((i) => i.key), ['carl'])
})

test('more occasions: a gift (housewarming, communion, gift exchange), something to bring, sympathy, gift holidays', () => {
  const items = byKey(buildComingUp({ now, events: [
    ev('house', 'Housewarming at the Garcias', '2026-10-10T18:00:00-04:00'),
    ev('comm', "Ella's First Communion", '2026-10-18T10:00:00-04:00'),
    ev('santa', 'Office Secret Santa', '2026-10-30T12:00:00-04:00'),
    ev('pot', 'Class potluck', '2026-10-02T12:00:00-04:00'),
    ev('snack', 'Softball snack duty', '2026-10-03T09:00:00-04:00'),
    ev('fun', 'Funeral for Mr. Hayes', '2026-10-01T11:00:00-04:00'),
    allDay('val', "Valentine's Day", '2027-02-14'),
  ] }))
  assert.equal(items['house'].nextStep, 'RSVP and get a gift')
  assert.equal(items['comm'].nextStep, 'RSVP and get a gift')
  assert.equal(items['santa'].nextStep, 'RSVP and get a gift')
  assert.equal(items['pot'].nextStep, 'Get what to bring')
  assert.equal(items['pot'].pokeOn, '2026-09-29')
  assert.equal(items['snack'].nextStep, 'Get what to bring')
  assert.equal(items['fun'].nextStep, 'Flowers or a card')
  assert.equal(items['val'], undefined, 'February is beyond the six weeks')
})

// Jake, 2026-09-29: "yes on visitors/guests, spirit/theme days … seasonal (halloween decorating, put up
// christmas lights, christmas gifts (start that in November), Thanksgiving prep and plans … extra
// emphasis on christmas prep … xmas decorating before thanksgiving, halloween decorations and costumes
// have to get done more or less now so we beat the rush)".
test('visitors: the guest room and groceries, a few days ahead', () => {
  const items = byKey(buildComingUp({ now, events: [
    ev('gma', 'Grandma visiting', '2026-10-09T15:00:00-04:00'),
    allDay('sis', 'Aunt Kate in town', '2026-10-16'),
    ev('doc', 'Doctor visit', '2026-10-09T09:00:00-04:00'),
  ] }))
  assert.equal(items['gma'].kind, 'guests')
  assert.equal(items['gma'].nextStep, 'Guest room and groceries')
  assert.equal(items['gma'].pokeOn, '2026-10-04')
  assert.equal(items['sis'].kind, 'guests')
  assert.equal(items['doc'].kind, 'appointment', 'a doctor visit is not a visitor')
})

test('spirit and theme days: the outfit, before a school "holiday" or party reads them', () => {
  const items = byKey(buildComingUp({ now, events: [
    allDay('pj', 'Pajama Day', '2026-10-06'),
    allDay('hat', 'Spirit Week: Crazy Hair Day', '2026-10-07'),
    allDay('red', 'Red Ribbon Week — wear red', '2026-10-26'),
    allDay('xmas', 'Holiday Spirit Day', '2026-12-18'),
    allDay('costume', 'Book Character Day', '2026-10-30'),
  ] }))
  for (const k of ['pj', 'hat', 'red', 'costume']) {
    assert.equal(items[k].kind, 'spirit_day', k)
    assert.equal(items[k].nextStep, 'Outfit ready?', k)
  }
  assert.equal(items['pj'].pokeOn, '2026-10-01')
  assert.equal(items['xmas'], undefined, 'December is beyond the six weeks')
})

test('the seasons come round without a calendar entry: Halloween now, Christmas gifts from November', () => {
  const items = buildComingUp({ now, events: [], seasons: SEASONS })
  const by = Object.fromEntries(items.map((i) => [i.key, i]))
  assert.equal(by['season:halloween_decor:2026'].late, true, 'Halloween decorating is already due')
  assert.equal(by['season:halloween_costumes:2026'].late, true)
  assert.equal(by['season:halloween_costumes:2026'].date, '2026-10-31')
  assert.equal(by['season:christmas_gifts:2026'].pokeOn, '2026-11-01')
  assert.equal(by['season:christmas_gifts:2026'].date, '2026-12-25')
  assert.equal(by['season:christmas_decor:2026'].late, false, 'Christmas decorating already shows, not yet due')
  assert.equal(by['season:hurricane:2027'], undefined, 'next June is far off')
  for (const i of items) assert.equal(i.kind, 'season')
})

test('Christmas decorating and lights come before Thanksgiving; Thanksgiving prep two weeks ahead', () => {
  const oct = new Date('2026-10-20T09:00:00-04:00')
  const by = Object.fromEntries(buildComingUp({ now: oct, events: [], seasons: SEASONS }).map((i) => [i.key, i]))
  // Thanksgiving 2026 is Nov 26: decorate and light up in the three weeks before it.
  assert.equal(by['season:christmas_decor:2026'].pokeOn, '2026-11-05')
  assert.equal(by['season:christmas_decor:2026'].nextStep, 'Decorate before Thanksgiving')
  assert.equal(by['season:christmas_lights:2026'].pokeOn, '2026-11-05')
  assert.equal(by['season:thanksgiving_prep:2026'].date, '2026-11-26')
  assert.equal(by['season:thanksgiving_prep:2026'].pokeOn, '2026-11-12')
  assert.equal(by['season:halloween_decor:2026'].late, true)
})

test('a season marked done stays done that year and comes back the next', () => {
  const state = { 'season:halloween_decor:2026': { done_at: '2026-09-29T20:00:00Z' } }
  const keys = buildComingUp({ now, events: [], seasons: SEASONS, state }).map((i) => i.key)
  assert.ok(!keys.includes('season:halloween_decor:2026'))
  const nextYear = buildComingUp({ now: new Date('2027-09-20T09:00:00-04:00'), events: [], seasons: SEASONS, state }).map((i) => i.key)
  assert.ok(nextYear.includes('season:halloween_decor:2027'))
})

// A project's dated steps and its target (P3.23 step 2, canvas 10e): on Coming up under the project's
// name, with its own calendar event left out so nothing shows twice.
test('a project step with dates and a project’s target come up, named for the project', () => {
  const projects = {
    projects: [{ id: 'paint', title: 'Paint the house', status: 'active', aim_date: '2026-11-21' }, { id: 'old', title: 'Old job', status: 'dropped', aim_date: '2026-10-20' }],
    steps: [
      { id: 'choose', project_id: 'paint', title: 'Choose the painter', cal_start: '2026-10-10', cal_end: null, cal_event_id: 'ev-choose', done_at: null },
      { id: 'painter', project_id: 'paint', title: 'The painter: 5 days', cal_start: '2026-11-09', cal_end: '2026-11-13', cal_event_id: 'ev-painter', done_at: null },
      { id: 'walk', project_id: 'paint', title: 'Walk the house', cal_start: '2026-10-02', cal_end: null, cal_event_id: null, done_at: '2026-09-27T12:00:00Z' },
      { id: 'x', project_id: 'old', title: 'Something', cal_start: '2026-10-05', cal_end: null, cal_event_id: null, done_at: null },
    ],
  }
  const events = [allDay('ev-choose', 'Paint the house: Choose the painter', '2026-10-10'), ev('tryouts', 'BAK Softball Tryouts', '2026-10-19T15:00:00-04:00')]
  const items = byKey(buildComingUp({ now, events, projects }))
  assert.equal(items['ev-choose'], undefined, 'its calendar event doesn’t show twice')
  assert.deepEqual(
    { title: items['step:choose'].title, next: items['step:choose'].nextStep, kind: items['step:choose'].kind, poke: items['step:choose'].pokeOn, project: items['step:choose'].projectId },
    { title: 'Choose the painter', next: 'Paint the house', kind: 'project_step', poke: '2026-10-03', project: 'paint' },
  )
  assert.equal(items['step:painter'].pokeOn, '2026-11-02', 'a week to get ready')
  assert.equal(items['step:walk'], undefined, 'done')
  assert.equal(items['step:x'], undefined, 'the project was dropped')
  assert.equal(items['target:paint'].title, 'Paint the house: the target')
  assert.equal(items['target:paint'].pokeOn, '2026-11-07')
  assert.equal(items['target:old'], undefined)
  assert.ok(items['tryouts'])
})

// The seasons arrive as projects (P3.23, canvas 11c). Jake: "first I have to go to the storage unit and
// grab the lights, then do the indoor window trim lights, then the outdoor wreaths and bush lights, I
// gotta buy new lights each year, put the lights on the palm trees … get it done in small jobs".
test('a season that’s a real job can start as a project, due the day it’s for (lights: the day before Thanksgiving)', () => {
  const items = Object.fromEntries(buildComingUp({ now: new Date('2026-10-20T09:00:00-04:00'), events: [], seasons: SEASONS }).map((i) => [i.key, i]))
  const lights = items['season:christmas_lights:2026']
  assert.equal(lights.date, '2026-11-25')
  assert.equal(lights.startable, true)
  assert.deepEqual(lights.plan, { steps: 7, minutes: 685, first: 'Storage unit run: the lights and wreaths' })
  assert.equal(items['season:christmas_gifts:2026'].startable, undefined, 'a list, not a project')
  const plan = SEASONS.find((s) => s.id === 'christmas_lights').template
  assert.deepEqual(plan.map((s) => s.title).slice(0, 3), ['Storage unit run: the lights and wreaths', 'Plug everything in, list what’s dead', 'Buy new lights'])
  assert.deepEqual(plan.filter((s) => s.grp === 4).map((s) => s.title), ['Indoor window trim lights', 'Outdoor wreaths and bush lights', 'Palm tree lights'])
})

test('once started, the season shows its project: progress, what’s Now, and Open project', () => {
  const items = Object.fromEntries(buildComingUp({
    now: new Date('2026-10-20T09:00:00-04:00'), events: [], seasons: SEASONS,
    projects: { projects: [{ id: 'hw', title: 'Halloween decorations', status: 'active', season_id: 'halloween_decor:2026' }], steps: [], progress: { hw: { done: 2, total: 5, now: 'The yard: tombstones and the fog machine' } } },
  }).map((i) => [i.key, i]))
  const hw = items['season:halloween_decor:2026']
  assert.equal(hw.projectId, 'hw')
  assert.equal(hw.nextStep, 'A project · 2 of 5 · now: The yard: tombstones and the fog machine')
  // Its own target isn't listed a second time.
  assert.equal(items['target:hw'], undefined)
})

// Jake, Oct 7: "potential long school vacation holidays like thanksgiveing / xmas, spring break florida" — the
// district's long breaks come up six weeks ahead: plans for the week off.
test('the long school breaks come up six weeks ahead, from the district calendar', () => {
  const titles = (iso) => buildComingUp({ now: new Date(iso), events: [], seasons: SEASONS }).filter((i) => i.kind === 'season' && /break/.test(i.title)).map((i) => [i.title, i.date, i.pokeOn])
  assert.deepEqual(titles('2026-10-07T12:00:00-04:00'), [['Thanksgiving break', '2026-11-23', '2026-10-12'], ['Winter break', '2026-12-21', '2026-11-09']])
  assert.deepEqual(titles('2027-02-10T12:00:00-05:00'), [['Spring break', '2027-03-22', '2027-02-08']])
  assert.deepEqual(titles('2027-06-10T12:00:00-04:00'), [], 'past the published year: nothing made up')
})

import { fewerLikeMatch, handledFromState } from '../supabase/functions/_shared/coming-up.mjs'
// On the Horizon (Jake, Oct 7): "✕ not for us" teaches fewer like it; handled ones stay on the timeline as done.
test('a ✕ teaches the words that name it — a birthday stays that person’s alone', () => {
  const family = [{ name: 'Liv', full_name: 'Olivia Tabor' }, { name: 'Emme' }]
  assert.equal(fewerLikeMatch({ title: 'Bak Fall Festival', kind: 'event' }, family), 'fall festival')
  assert.equal(fewerLikeMatch({ title: 'Science Experiments & PTO Spirit Day', kind: 'spirit' }, family), 'spirit day')
  assert.equal(fewerLikeMatch({ title: 'Yearbook Picture Day! (wear uniforms)', kind: 'spirit' }, family), 'picture day')
  assert.equal(fewerLikeMatch({ title: 'Heather’s Birthday', kind: 'birthday' }, family), 'heather birthday')
  assert.equal(fewerLikeMatch({ title: 'Liv BAK Athletics Aktivate System Due', kind: 'deadline' }, family), 'system due')
})

test('handled ones, with what was done, for the timeline: this week past and ahead', () => {
  const rows = [
    { item_key: 'a', done_at: '2026-10-07T15:00:00Z', outcome: { title: 'Heather’s birthday', date: '2026-10-08', text: 'Reminder: Thu Oct 8, 9 AM', eventId: 'e1', by: 'alexa' } },
    { item_key: 'b', done_at: '2026-09-01T15:00:00Z', outcome: { title: 'Old', date: '2026-09-02', text: 'x' } },
    { item_key: 'c', done_at: '2026-10-07T15:00:00Z', outcome: null },
    { item_key: 'd', dismissed_at: '2026-10-07T15:00:00Z', outcome: { title: 'Fair', date: '2026-10-30' } },
  ]
  assert.deepEqual(handledFromState(rows, '2026-10-07').map((h) => [h.key, h.text, h.by, h.eventId]), [['a', 'Reminder: Thu Oct 8, 9 AM', 'alexa', 'e1']])
})

// Canvas 66 (Jake, Oct 7: "mark on ahead, calendar and reminders … so alexa will know when i invoke her. or if ive
// handled it and can see its laready there then I can dismiss it"): what's already set, for each line.
test('Ahead marks what is already set: on the calendar, and a reminder for it', async () => {
  const { aheadMarks } = await import('../supabase/functions/_shared/coming-up.mjs')
  const events = [
    { id: 'hb', title: 'Heather’s Birthday', start_time: '2026-10-08T00:00:00Z', end_time: '2026-10-09T00:00:00Z', all_day: true, event_type: 'event' },
    { id: 'r1', title: 'Text Heather a happy birthday message', start_time: '2026-10-08T11:00:00Z', end_time: '2026-10-08T11:15:00Z', all_day: false, event_type: 'reminder', has_due_date: true },
    { id: 'r2', title: 'Order Carl a birthday gift', start_time: '2026-11-25T14:00:00Z', end_time: '2026-11-25T14:15:00Z', all_day: false, event_type: 'reminder', has_due_date: true },
    { id: 'tg', title: 'Thanksgiving at Mom’s', start_time: '2026-11-26T21:00:00Z', end_time: '2026-11-26T23:00:00Z', all_day: false, event_type: 'event' },
    { id: 'r3', title: 'Liv forms', start_time: '2026-08-01T14:00:00Z', end_time: '2026-08-01T14:15:00Z', all_day: false, event_type: 'reminder', has_due_date: true },
  ]
  const items = [
    { key: 'hb', kind: 'birthday', title: 'Heather’s Birthday', date: '2026-10-08' },
    { key: 'carl', kind: 'birthday', title: 'Carl’s birthday', date: '2026-12-02' },
    { key: 'season:thanksgiving:2026', kind: 'season', title: 'Thanksgiving', date: '2026-11-26' },
    { key: 'season:halloween:2026', kind: 'season', title: 'Halloween', date: '2026-10-31' },
    { key: 'liv', kind: 'deadline', title: 'Liv’s athletics forms due', date: '2026-10-10' },
  ]
  const [hb, carl, tg, hw, liv] = aheadMarks(items, events)
  assert.equal(hb.onCalendar, true)
  assert.deepEqual(hb.reminder, { id: 'r1', title: 'Text Heather a happy birthday message', at: '2026-10-08T11:00:00Z', allDay: false })
  // Carl's reminder names him; Heather's never counts for Carl.
  assert.equal(carl.onCalendar, false)
  assert.equal(carl.reminder.id, 'r2')
  // A season with a calendar event under its name that day.
  assert.equal(tg.onCalendar, true)
  assert.equal(hw.onCalendar, false)
  assert.equal(hw.reminder, null)
  // A reminder long before (two months) isn't for this one.
  assert.equal(liv.reminder, null)
  // Live, Oct 7: "Christmas cards" isn't Christmas Day; a reminder on the list isn't set for itself.
  const xmas = [{ id: 'x', title: 'Christmas Day', start_time: '2026-12-25T05:00:00Z', end_time: '2026-12-26T05:00:00Z', all_day: true, event_type: 'event' }]
  assert.equal(aheadMarks([{ key: 'season:cards:2026', kind: 'season', title: 'Christmas cards', date: '2026-12-25' }], xmas)[0].onCalendar, false)
  assert.equal(aheadMarks([{ key: 'r1', kind: 'reminder', title: 'Text Heather a happy birthday message', date: '2026-10-08' }], events)[0].reminder, null)
})

// Canvas 68–69 (Jake, Oct 7: "for projects, can that be grouped together … vs having them spread out across and mixed
// in with other items" → "in november if theres no due date" → B, a strip above the timeline): one entry per project.
test('a project’s steps and target on Ahead are one project: next step, steps done, its target or when its steps fall', async () => {
  const { groupProjects } = await import('../supabase/functions/_shared/coming-up.mjs')
  const items = [
    { key: 'cu-1', kind: 'birthday', title: 'Carl’s birthday', date: '2026-12-02' },
    { key: 'step:s3', kind: 'project_step', title: 'Order outdoor lights', date: '2026-11-08', projectId: 'p-xmas' },
    { key: 'step:s4', kind: 'project_step', title: 'Wrap the palms', date: '2026-11-14', projectId: 'p-xmas' },
    { key: 'season:christmas_lights:2026', kind: 'season', title: 'Christmas lights', date: '2026-11-25', projectId: 'p-xmas' },
    { key: 'step:h2', kind: 'project_step', title: 'Choose the painter', date: '2026-10-10', projectId: 'p-paint' },
  ]
  const projects = [
    { id: 'p-xmas', title: 'Christmas lights', status: 'active', aim_date: '2026-11-22' },
    { id: 'p-paint', title: 'Paint the house', status: 'active', aim_date: null },
  ]
  const steps = [
    { id: 's1', project_id: 'p-xmas', title: 'Storage run', grp: 0, position: 0, done_at: '2026-10-01', cal_start: '2026-10-01' },
    { id: 's2', project_id: 'p-xmas', title: 'Test the lights', grp: 0, position: 1, done_at: '2026-10-02', cal_start: null },
    { id: 's3', project_id: 'p-xmas', title: 'Order outdoor lights', grp: 0, position: 2, done_at: null, cal_start: '2026-11-08' },
    { id: 's4', project_id: 'p-xmas', title: 'Wrap the palms', grp: 0, position: 3, done_at: null, cal_start: '2026-11-14' },
    { id: 'h1', project_id: 'p-paint', title: 'Pick colours', grp: 0, position: 0, done_at: '2026-09-20', cal_start: null },
    { id: 'h2', project_id: 'p-paint', title: 'Choose the painter', grp: 0, position: 1, done_at: null, cal_start: '2026-10-10' },
    { id: 'h3', project_id: 'p-paint', title: 'Paint', grp: 0, position: 2, done_at: null, cal_start: '2026-10-24' },
  ]
  const { items: rest, projects: grouped } = groupProjects(items, projects, steps)
  assert.deepEqual(rest.map((i) => i.key), ['cu-1'])
  // Soonest first.
  const [paint, xmas] = grouped
  assert.deepEqual(xmas, { key: 'project:p-xmas', projectId: 'p-xmas', title: 'Christmas lights', done: 2, total: 4, left: 2, next: { title: 'Order outdoor lights', date: '2026-11-08' }, target: '2026-11-22', from: '2026-11-08', to: '2026-11-14', date: '2026-11-22' })
  // No target: when its steps fall, and its dot at the last of them.
  assert.equal(paint.target, null)
  assert.deepEqual([paint.from, paint.to, paint.date, paint.left], ['2026-10-10', '2026-10-24', '2026-10-24', 2])
})
