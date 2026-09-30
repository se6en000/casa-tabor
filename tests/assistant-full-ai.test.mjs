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
  assert.match(fullAiCard({ name: 'update_event', args: { id: 'nope', start: '2026-10-03T13:00' } }, { events, utcOffset, now }).error, /isn't on the calendar/)
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
  assert.deepEqual(FULL_AI_TOOLS.map((t) => t.name), ['create_event', 'update_event', 'delete_event', 'add_grocery_items', 'check_grocery_item', 'remove_grocery_item', 'update_grocery_item_quantity', 'clear_checked_grocery_items', 'create_recipe', 'add_gift_idea', 'add_todo', 'plan_project', 'find_events', 'get_gift_ideas', 'add_to_coming_up', 'add_coming_up_rule', 'change_coming_up_item', 'get_coming_up', 'search_web', 'search_places', 'get_weather_forecast', 'get_travel_eta', 'get_recipe', 'search_family_notes', 'open_email_review', 'add_prep_item', 'show_directions', 'save_address', 'show_day'])
  assert.deepEqual([...READ_TOOLS].sort(), ['find_events', 'get_coming_up', 'get_gift_ideas', 'get_recipe', 'get_travel_eta', 'get_weather_forecast', 'open_email_review', 'search_family_notes', 'search_places', 'search_web', 'show_day', 'show_directions'])
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
