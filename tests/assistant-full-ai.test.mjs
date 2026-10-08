import test from 'node:test'
import assert from 'node:assert/strict'
import { FULL_AI_TOOLS, buildFullAiSystem, fullAiCard, mentionedIds, fullAiContents, isRoutineCopy } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Version D (P3.16): Gemini with the family's data in its context, the whole conversation,
// and a few broad tools for changes — each change still a card that needs a yes, and still
// held to the server's hard checks.

const utcOffset = '-04:00'
const events = [
  { id: 'e1', title: 'Softball: Huskies @ RPB Cascade', start_time: '2026-10-03T16:30:00Z', end_time: '2026-10-03T18:30:00Z', all_day: false, event_type: 'event', people: ['Liv'], drivers: ['Jake'], place: 'Ferrin Park Field 1', address: 'Ferrin Park Field 1 — 11921 Okeechobee Blvd' },
  { id: 'e2', title: 'Drop off Emme @ Palm Beach Public Elementary School · Late Strings Pickup', start_time: '2026-10-01T12:00:00Z', end_time: '2026-10-01T12:15:00Z', all_day: false, event_type: 'event', people: ['Emme'], drivers: ['Jake'], place: 'Palm Beach Public', address: null },
  { id: 'e3', title: 'Call the pediatrician', start_time: '2026-09-28T13:00:00Z', end_time: '2026-09-28T13:15:00Z', all_day: false, event_type: 'reminder', people: ['Jake'], drivers: [], place: null, address: null },
]
const family = [{ name: 'Jake', role: 'parent', can_drive: true }, { name: 'Kelly', role: 'parent', can_drive: true }, { name: 'Liv', role: 'child', can_drive: false }]
const now = new Date('2026-09-26T22:00:00-04:00')

test('the system prompt is one plain paragraph, then the data: family, calendar with ids, drivers and copies marked, groceries, what is on screen', () => {
  const system = buildFullAiSystem({ family, events, groceries: [{ name: 'eggs', quantity: '12' }], pending: { tool: 'create_event', args: { title: 'Dentist', start: '2026-09-29T15:30:00-04:00' } }, onScreenIds: ['e1'], utcOffset, now, homeCity: 'West Palm Beach' })
  const [intro] = system.split('\n\n')
  assert.ok(!intro.includes('\n'), 'one paragraph')
  assert.match(intro, /wall screen/)
  assert.match(system, /tomorrow = Sun Sep 27 \(2026-09-27\)/, 'the same day list the rules get, as data')
  assert.match(system, /Jake \(parent, drives\)/)
  assert.match(system, /\[e1\] Sat Oct 3, 12:30 PM–2:30 PM · Softball: Huskies @ RPB Cascade · people: Liv · driver: Jake · at Ferrin Park Field 1 — 11921 Okeechobee Blvd/)
  assert.match(system, /\[e2\].*SCHOOL-RUN COPY — never change it/)
  assert.match(system, /\[e3\].*reminder/)
  assert.match(system, /eggs \(12\)/)
  assert.match(system, /WAITING FOR A YES.*Dentist/)
  assert.match(system, /JUST DISCUSSED.*\[e1\]/)
})

test('the conversation goes to the model word for word', () => {
  const contents = fullAiContents([{ role: 'user', content: 'add dentist for live tuesday at 3 no wait 3:30' }, { role: 'assistant', content: 'Drafted it.' }, { role: 'user', content: 'its the pediatric one' }])
  assert.deepEqual(contents.map((c) => [c.role, c.parts[0].text]), [['user', 'add dentist for live tuesday at 3 no wait 3:30'], ['model', 'Drafted it.'], ['user', 'its the pediatric one']])
})

test('the calendar is read from the context, never searched (the old path\'s search_events and its time-outs)', () => {
  assert.equal(FULL_AI_TOOLS.some((t) => t.name === 'search_events'), false)
})

test('a proposed add becomes the usual card, in the family\'s clock', () => {
  const card = fullAiCard({ name: 'create_event', args: { title: 'Dentist', start: '2026-09-29T15:30', end: '2026-09-29T16:30', people: ['Liv'], place: 'Pediatric Dentistry', kind: 'event' } }, { events, utcOffset, now })
  assert.deepEqual(card, { tool: 'create_event', args: { title: 'Dentist', start: '2026-09-29T15:30:00-04:00', end: '2026-09-29T16:30:00-04:00', members: ['Liv'], location: 'Pediatric Dentistry', event_type: 'event', all_day: false } })
})

test('a change becomes the usual update card: time, place, people and driver', () => {
  const card = fullAiCard({ name: 'update_event', args: { id: 'e1', start: '2026-10-03T13:00', driver: 'Kelly', add_people: ['Emme'] } }, { events, utcOffset, now })
  assert.deepEqual(card, { tool: 'update_event', args: { id: 'e1', start: '2026-10-03T13:00:00-04:00', driver_name: 'Kelly', members_add: ['Emme'] } })
})

test('the hard checks still hold: a real date, an event that exists, never a school-run copy', () => {
  assert.match(fullAiCard({ name: 'update_event', args: { id: 'nope', start: '2026-10-03T13:00' } }, { events, utcOffset, now }).error, /don't see that on the calendar/)
  assert.match(fullAiCard({ name: 'update_event', args: { id: 'e2', start: '2026-10-01T08:30' } }, { events, utcOffset, now }).error, /school run/)
  assert.match(fullAiCard({ name: 'delete_event', args: { id: 'e2' } }, { events, utcOffset, now }).error, /school run/)
  assert.match(fullAiCard({ name: 'create_event', args: { title: 'X', start: '2026-02-30T10:00' } }, { events, utcOffset, now }).error, /date/)
  assert.match(fullAiCard({ name: 'create_event', args: { title: 'X', start: '2019-01-01T10:00' } }, { events, utcOffset, now }).error, /date/)
  assert.match(fullAiCard({ name: 'add_grocery_items', args: { items: [] } }, { events, utcOffset, now }).error, /nothing/)
  assert.equal(isRoutineCopy('Pick up Photobook for Liv'), false, 'a real errand is not a copy')
})

test('what an answer named is remembered, in the order it named them', () => {
  assert.deepEqual(mentionedIds('Liv has the Call the pediatrician reminder, then Softball on Saturday.', events), ['e3', 'e1'])
  assert.deepEqual(mentionedIds('Nothing that day.', events), [])
})

// Version D as all of layer 2 (P3.17): the old path's other abilities, still as cards or lookups.
test('D has the old path\'s other abilities: grocery changes, recipes, and lookups (read-only, no card)', async () => {
  const { LOOKUP_TOOLS, READ_TOOLS } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  assert.deepEqual(FULL_AI_TOOLS.map((t) => t.name), ['create_event', 'update_event', 'delete_event', 'add_grocery_items', 'check_grocery_item', 'remove_grocery_item', 'update_grocery_item_quantity', 'clear_checked_grocery_items', 'create_recipe', 'add_gift_idea', 'add_todo', 'plan_project', 'find_events', 'get_gift_ideas', 'add_to_coming_up', 'add_coming_up_rule', 'change_coming_up_item', 'get_coming_up', 'search_web', 'search_places', 'get_weather_forecast', 'get_travel_eta', 'get_recipe', 'finish_todo', 'search_email', 'search_family_notes', 'open_email_review', 'add_prep_item', 'show_directions', 'save_address', 'remember', 'forget', 'undo_memory', 'keep_me_posted', 'show_day'])
  assert.deepEqual([...READ_TOOLS].sort(), ['find_events', 'forget', 'get_coming_up', 'get_gift_ideas', 'get_recipe', 'get_travel_eta', 'get_weather_forecast', 'open_email_review', 'remember', 'search_email', 'search_family_notes', 'search_places', 'search_web', 'show_day', 'show_directions', 'undo_memory'])
  assert.deepEqual(LOOKUP_TOOLS, ['search_web', 'search_places', 'get_weather_forecast', 'get_travel_eta'])
})

test('grocery changes are cards on items that exist; a recipe needs a name, ingredients and steps', () => {
  const groceries = [{ id: 'g1', name: 'milk', quantity: '1', checked: false }]
  const ctx = { events, utcOffset, now, groceries }
  assert.deepEqual(fullAiCard({ name: 'check_grocery_item', args: { item_id: 'g1', checked: true } }, ctx), { tool: 'check_grocery_item', args: { item_id: 'g1', item_name: 'milk', checked: true } }, 'the card names the item, as the old path\'s did')
  assert.deepEqual(fullAiCard({ name: 'update_grocery_item_quantity', args: { item_id: 'g1', quantity: '2' } }, ctx), { tool: 'update_grocery_item_quantity', args: { item_id: 'g1', item_name: 'milk', quantity: '2' } })
  assert.deepEqual(fullAiCard({ name: 'remove_grocery_item', args: { item_id: 'g1' } }, ctx), { tool: 'remove_grocery_item', args: { item_id: 'g1', item_name: 'milk' } })
  assert.deepEqual(fullAiCard({ name: 'clear_checked_grocery_items', args: {} }, ctx), { tool: 'clear_checked_grocery_items', args: {} })
  assert.match(fullAiCard({ name: 'remove_grocery_item', args: { item_id: 'nope' } }, ctx).error, /grocery list/)
  assert.equal(fullAiCard({ name: 'create_recipe', args: { name: 'Tacos', ingredients: [{ name: 'tortillas' }], steps: ['Warm them'] } }, ctx).tool, 'create_recipe')
  assert.match(fullAiCard({ name: 'create_recipe', args: { name: 'Tacos', ingredients: [], steps: [] } }, ctx).error, /recipe/)
})

test('the context also carries home, places, contacts, recipes and grocery ids', () => {
  const system = buildFullAiSystem({ family, events, groceries: [{ id: 'g1', name: 'milk', quantity: '1', checked: true }], pending: null, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach', home: '3209 Washington Rd, West Palm Beach', places: [{ name: 'Ferrin Park', address: '11921 Okeechobee Blvd' }], contacts: [{ name: 'Danny', relationship: 'batting coach', phone: '561-555-0101', email: null, place: null }], recipes: [{ id: 'r1', name: 'Chicken tacos' }] })
  assert.match(system, /HOME: 3209 Washington Rd/)
  assert.match(system, /\[g1\] milk \(1\) · checked off/)
  assert.match(system, /Danny · batting coach · 561-555-0101/)
  assert.match(system, /Ferrin Park · 11921 Okeechobee Blvd/)
  assert.match(system, /\[r1\] Chicken tacos/)
})

test('a flub is noticed from the conversation: a correction, or the same request again', async () => {
  const { flubSignal } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const convo = (...said) => said.flatMap((t, i) => [{ role: 'user', content: t }, ...(i < said.length - 1 ? [{ role: 'assistant', content: 'ok' }] : [])])
  assert.equal(flubSignal(convo('add dentist tuesday at 4', "no that's not what I said, 4 PM")), 'correction')
  assert.equal(flubSignal(convo('whats on sunday', 'you got it wrong')), 'correction')
  assert.equal(flubSignal(convo('when is the best day next week to book Livs batting practice', 'When is the best day next week to book Liv\'s batting practice with coach Danny?')), 'repeat')
  assert.equal(flubSignal(convo('whats on sunday', 'and monday')), null)
  assert.equal(flubSignal(convo('no thanks')), null, 'a first "no" is not a correction')
  assert.equal(flubSignal(convo('add milk', 'no, make it two')), null, 'revising a request is normal')
})

// Travel (design doc "Casa: Travel design"; Jake: "maybe I just use AI for that and AI guide me how to get the info it
// needs and it handles putting it in the calendar"): Casa asks for what's missing and adds a trip as events whose
// titles the wall reads as one trip (wall/engine/travel.ts) — the prompt's titles and the wall's reading must agree.
test('a trip told to Casa: the prompt asks one thing at a time and names the events the wall reads as a trip', async () => {
  const { parseFlight, parseDrive, buildTrips } = await import('../src/wall/engine/travel.ts')
  const system = buildFullAiSystem({ family, events, groceries: [], pending: null, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach' })
  const [intro] = system.split('\n\n')
  assert.match(intro, /is a trip: ask for what's missing, one short question at a time/)
  const flight = /titled "(Flight <number> <FROM>→<TO>)"/.exec(intro)[1].replace('<number>', '1419').replace('<FROM>', 'DJT').replace('<TO>', 'DFW')
  assert.deepEqual(parseFlight({ title: flight }), { number: '1419', from: 'DJT', to: 'DFW' })
  const [out, back] = [...intro.matchAll(/"(Drive (?:to|home from) <City>)"/g)].map((m) => m[1].replace('<City>', 'Orlando'))
  assert.deepEqual([parseDrive({ title: out }), parseDrive({ title: back })], [{ direction: 'out', city: 'Orlando' }, { direction: 'home', city: 'Orlando' }])
  const tripTitle = /one all-day "(Trip <City>)"/.exec(intro)[1].replace('<City>', 'Orlando')
  const jake = [{ family_member_id: 'j', role: 'primary' }]
  const [trip] = buildTrips([
    { id: 'a', title: out, start_time: '2026-10-13T10:30:00Z', end_time: '2026-10-13T13:45:00Z', all_day: false, location_name: null, address: null, members: jake },
    { id: 'b', title: back, start_time: '2026-10-15T20:00:00Z', end_time: '2026-10-15T23:15:00Z', all_day: false, location_name: null, address: null, members: jake },
    { id: 'c', title: tripTitle, start_time: '2026-10-13T00:00:00Z', end_time: '2026-10-15T23:59:00Z', all_day: true, location_name: 'Hyatt', address: null, members: jake },
  ], [{ id: 'j', name: 'Jake', role: 'parent', can_drive: true }])
  assert.deepEqual([trip.city, trip.tripEventId, trip.mode], ['Orlando', 'c', 'drive'])
})

test('trip talk goes to the full model; ordinary drives and adds do not', async () => {
  const { isTripTalk } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  for (const said of [
    "I'm flying to Dallas for work next Wednesday, back Thursday",
    'Kelly flies out to Boston on the 12th',
    'I have a work trip to Austin the week of the 19th',
    "I'll be out of town Tuesday through Thursday",
    "I'm driving to Orlando for work on the 13th, back on the 15th",
    'Heading to the airport Friday morning, my flight is at 9',
    'we are traveling to Chicago over thanksgiving',
    'Jake is away for work from Monday until Wednesday',
  ]) assert.equal(isTripTalk(said), true, said)
  for (const said of [
    'add soccer practice Tuesday at 5',
    'drive Liv to practice at 4',
    'Kelly is driving to Bak at 3:15',
    'add dentist for Owen on the 9th',
    'move the softball game to 1',
    'remind me to take the trash out at 8',
  ]) assert.equal(isTripTalk(said), false, said)
})

// Jake, 2026-10-01: "fix that and make sure it doesn't happen for future trips" — told about his Dallas trip, Casa
// proposed it again ("JRT Trip Dallas" and both flights) though the work email had already put it on the calendar.
test('a trip already on the calendar is not added again: same flight, same drive, or the trip itself', async () => {
  const { alreadyOnCalendar } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const existing = [
    { id: 'f1', title: 'TABOR JACOB | Flight 1419 DJT→DFW', start_time: '2026-10-07T18:13:00Z', end_time: '2026-10-07T20:30:00Z', all_day: false },
    { id: 'f2', title: 'TABOR JACOB | Flight 2640 DFW→DJT', start_time: '2026-10-08T18:45:00Z', end_time: '2026-10-08T22:34:00Z', all_day: false },
    { id: 't', title: 'JRT Trip Dallas', start_time: '2026-10-07T00:00:00Z', end_time: '2026-10-08T23:59:59Z', all_day: true },
    { id: 'd', title: 'Drive to Orlando', start_time: '2026-10-13T10:30:00Z', end_time: '2026-10-13T13:30:00Z', all_day: false },
  ]
  const card = (title, start, end, all_day = false) => ({ tool: 'create_event', args: { title, start, end, all_day } })
  const proposed = [
    card('Work trip to Dallas', '2026-10-07T00:00:00-04:00', '2026-10-09T00:00:00-04:00', true),
    card('Flight 1419 DJT→DFW', '2026-10-07T14:13:00-04:00', '2026-10-07T16:30:00-04:00'),
    card('Flight 2640 DFW→DJT', '2026-10-08T14:45:00-04:00', '2026-10-08T18:34:00-04:00'),
    card('Drive to Orlando', '2026-10-13T06:30:00-04:00', '2026-10-13T09:30:00-04:00'),
    card('Drive home from Orlando', '2026-10-15T16:00:00-04:00', '2026-10-15T19:00:00-04:00'),
    card('Soccer practice', '2026-10-07T17:00:00-04:00', '2026-10-07T18:00:00-04:00'),
  ]
  const { keep, already } = alreadyOnCalendar(proposed, existing)
  assert.deepEqual(keep.map((c) => c.args.title), ['Drive home from Orlando', 'Soccer practice'])
  assert.deepEqual(already.map((a) => a.event.id), ['t', 'f1', 'f2', 'd'])
  // A different flight the same day, or the same flight a week later, is new.
  const other = alreadyOnCalendar([card('Flight 2211 DJT→DFW', '2026-10-07T08:00:00-04:00', '2026-10-07T10:00:00-04:00'), card('Flight 1419 DJT→DFW', '2026-10-14T14:13:00-04:00', '2026-10-14T16:30:00-04:00')], existing)
  assert.equal(other.keep.length, 2)
})

test('the assistant and the wall read trip titles the same way', async () => {
  const { tripLegOf, alreadyOnCalendarText } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const { parseFlight, parseDrive } = await import('../src/wall/engine/travel.ts')
  for (const title of ['TABOR JACOB | Flight 1419 DJT→DFW', 'Flight 2640 DFW->PBI', 'AA 2640 DFW -> PBI', 'Drive to Orlando', 'Jake | Drive home from Orlando', 'Drive back', 'Drive Liv to practice', 'Pick up Liv @ Bak', 'Soccer practice', 'Flight to Dallas (DJT to DFW)']) {
    const mine = tripLegOf(title, false)
    const flight = parseFlight({ title })
    const drive = parseDrive({ title })
    assert.equal(mine?.kind === 'flight', Boolean(flight), `flight? ${title}`)
    assert.equal(mine?.kind === 'drive', Boolean(drive), `drive? ${title}`)
    if (flight) assert.deepEqual([mine.from, mine.to], [flight.from, flight.to], title)
    if (drive) assert.equal(mine.direction, drive.direction, title)
  }
  assert.equal(alreadyOnCalendarText([{ event: { title: 'TABOR JACOB | Flight 1419 DJT→DFW', start_time: '2026-10-07T18:13:00Z', all_day: false } }, { event: { title: 'JRT Trip Dallas', all_day: true } }]),
    'Already on the calendar: Flight 1419 DJT→DFW (Wed 2:13 PM), JRT Trip Dallas.')
})

// The same live run, turn three: describing the flights already on the calendar ("lands DFW at 3:30 their time")
// became two time edits with Dallas times taken as home times. Describing a trip leg is not changing it.
test('describing a flight already on the calendar does not change it; asking to move it does', async () => {
  const { describesExistingLeg } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const flight = { id: 'f1', title: 'TABOR JACOB | Flight 1419 DJT→DFW', start_time: '2026-10-07T18:13:00Z', end_time: '2026-10-07T20:30:00Z', all_day: false }
  const edit = { tool: 'update_event', args: { id: 'f1', start: '2026-10-07T14:13:00-04:00', end: '2026-10-07T15:30:00-04:00' } }
  const said = 'Flight 1419 from DJT at 2:13 PM, lands DFW at 3:30 their time.'
  assert.equal(describesExistingLeg(edit, [flight], said), true)
  for (const change of ['My flight 1419 got delayed, it now leaves at 4:13', 'move my Dallas flight to 5:10', 'they changed flight 1419 to leave at 3:30 instead'])
    assert.equal(describesExistingLeg({ tool: 'update_event', args: { id: 'f1', start: '2026-10-07T16:13:00-04:00' } }, [flight], change), false, change)
  // Not a trip leg: an ordinary edit is never held back.
  assert.equal(describesExistingLeg({ tool: 'update_event', args: { id: 's', start: '2026-10-07T17:00:00-04:00' } }, [{ id: 's', title: 'Soccer practice', start_time: '2026-10-07T20:00:00Z', end_time: '2026-10-07T21:00:00Z', all_day: false }], 'soccer is at 5'), false)
})

// Jake's bug report, Oct 1 ("I should be able to update the name of an appointment … It said it couldn't do it") —
// rechecked Oct 3: renames make their card now, but "change the name of the cats and dogs exhibition preview to …"
// was answered "I can change … Is that right?" in words, with no card. The card is the question.
test('a clear change is its card at once — never "is that right?" in words first', async () => {
  const { buildFullAiSystem } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const system = buildFullAiSystem({ family: [], events: [], groceries: [], utcOffset: '-04:00', now: new Date('2026-10-03T12:00:00-04:00') })
  assert.match(system, /the card is the question/i)
  assert.match(system, /never ask "is that right\?"/i)
})

// Jake's bug report (Oct 5): "U didn't update the real address. Can u pull it for me" became a card moving the event to
// "the real address". Words about a place aren't one: the model is told to put the place itself.
test('a place that is only words about a place ("the real address") is refused, with what to do instead', () => {
  const evs = [{ id: 'e1', title: 'Huskies Batting Practice', start_time: '2026-10-05T22:30:00Z', end_time: '2026-10-05T23:30:00Z' }]
  const card = fullAiCard({ name: 'update_event', args: { id: 'e1', place: 'the real address' } }, { events: evs, utcOffset: '-04:00', now: new Date('2026-10-05T22:00:00Z') })
  assert.match(card.error, /place itself/)
  const ok = fullAiCard({ name: 'update_event', args: { id: 'e1', place: 'Dragon Elites batting cages' } }, { events: evs, utcOffset: '-04:00', now: new Date('2026-10-05T22:00:00Z') })
  assert.equal(ok.args.location, 'Dragon Elites batting cages')
})

// Canvas 65 (Jake, Oct 7): notes are context for Alexa — she reads them, adds to them, and keeps a to-do's.
test('notes: Alexa sees each event’s notes, adds lines to them, and keeps a to-do’s', () => {
  const withNotes = events.map((e, i) => (i === 0 ? { ...e, notes: '• Arrive by 12:10\n• $5 cash at the gate' } : e))
  const system = buildFullAiSystem({ family, events: withNotes, groceries: [], pending: null, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach' })
  assert.match(system, /notes: • Arrive by 12:10 \/ • \$5 cash at the gate/)
  const card = fullAiCard({ name: 'update_event', args: { id: 'e1', add_notes: ['Bring the folding chairs', ' '] } }, { events, utcOffset, now })
  assert.deepEqual(card, { tool: 'update_event', args: { id: 'e1', notes_add: ['Bring the folding chairs'] } })
  const todo = fullAiCard({ name: 'add_todo', args: { title: 'Order the photobook', notes: 'Walgreens order #48213' } }, { events, utcOffset, now, todos: [] })
  assert.equal(todo.args.notes, 'Walgreens order #48213')
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'update_event')
  assert.match(tool.parameters.properties.add_notes.description, /Never a summary/)
})

// Bug report 011679e8 (Oct 7, Yearbook Picture Day): two get & pack lines for one event came back as a batch the wall
// can't show ("I found 2 events to add. Review below:") — they're one card, saved with one yes.
test('several get & pack lines for one event are one card', async () => {
  const { mergePrepCards } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const cards = [
    { tool: 'add_prep_item', args: { event_id: 'yb', event_title: 'Yearbook Picture Day', label: 'Pick good shirts' } },
    { tool: 'add_prep_item', args: { event_id: 'yb', event_title: 'Yearbook Picture Day', label: 'Kelly up early to do hair' } },
    { tool: 'add_prep_item', args: { event_id: 'other', label: 'Water' } },
  ]
  const merged = mergePrepCards(cards)
  assert.equal(merged.length, 2)
  assert.deepEqual(merged[0].args.labels, ['Pick good shirts', 'Kelly up early to do hair'])
  assert.equal(merged[0].args.label, 'Pick good shirts · Kelly up early to do hair')
  assert.deepEqual(merged[1], cards[2])
  assert.deepEqual(mergePrepCards([cards[0]]), [cards[0]])
})

// Jake, Oct 8: "is the days paper part of alexas context for that day?" → "yes add it".
test('the morning paper and its news are in Alexa’s context when there is one', async () => {
  const { paperSection } = await import('../supabase/functions/_shared/morning-paper.mjs')
  const paper = paperSection({ paper: { headline: 'An easy Friday.', deck: '', brief: { today: [], weekend: [], month: [], wayOut: [], forgot: { title: 'Replace tire sensor', detail: 'Overdue.' } } }, outings: [], news: [], today: '2026-09-25' })
  const withIt = buildFullAiSystem({ family, events, groceries: [], pending: null, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach', paper })
  assert.match(withIt, /TODAY’S MORNING PAPER[\s\S]*You may have forgotten: Replace tire sensor/)
  assert.doesNotMatch(buildFullAiSystem({ family, events, groceries: [], pending: null, onScreenIds: [], utcOffset, now, homeCity: 'West Palm Beach' }), /MORNING PAPER/)
})
