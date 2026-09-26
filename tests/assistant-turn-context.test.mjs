import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDraftChanges, buildTurnPrompt, changeArgs, sameDayChoices, continuesConversation, hasTurnToRead, newItemArgs, openDraft, readTurnResolution, referentIds } from '../supabase/functions/_shared/assistant-turn-context.mjs'

const draft = { tool: 'create_event', args: { title: 'Dentist', start: '2026-09-29T15:30:00-04:00', end: '2026-09-29T16:30:00-04:00', members: ['Emme'], temporal_provenance: { rangeStart: '2026-09-29' } } }
const local = (iso) => new Date(Date.parse(iso) - 4 * 3600e3).toISOString().slice(0, 16)

test('only a turn after something was said (or with a draft open) is read in context', () => {
  assert.equal(continuesConversation([{ role: 'user', content: 'hi' }], null), false)
  assert.equal(continuesConversation([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }], null), true)
  assert.equal(continuesConversation([{ role: 'user', content: 'a' }], { tool: 'create_event', args: {} }), true)
})

test('a draft is a single calendar add or change; other pending things are not drafts', () => {
  assert.equal(openDraft({ tool: 'create_event', args: {} })?.tool, 'create_event')
  assert.equal(openDraft({ tool: 'delete_event', args: { id: 'x' } }), null)
  assert.equal(openDraft(null), null)
})

test('the items a conversation is about keep the order they were listed in', () => {
  assert.deepEqual(referentIds({ activeEntityType: 'calendar_range', eventIds: ['a', 'b'], activeEventId: 'b' }, { tool: 'update_event', args: { id: 'c' } }), ['a', 'b', 'c'])
  assert.deepEqual(referentIds({ candidateEvents: [{ id: 'x' }, { id: 'y' }] }, null), ['x', 'y'])
  assert.deepEqual(referentIds(null, null), [])
})

test("the model's answer is checked: anything unusable goes on to the full assistant", () => {
  assert.equal(readTurnResolution(null).act, 'other')
  assert.equal(readTurnResolution({ act: 'revise_draft', changes: { place: 'X' } }, { draft: null }).act, 'other')
  assert.equal(readTurnResolution({ act: 'revise_draft', changes: {} }, { draft }).act, 'other')
  assert.equal(readTurnResolution({ act: 'change', event_id: 'made-up', changes: { start: '10:00' } }, { knownIds: ['a'] }).act, 'other')
  assert.equal(readTurnResolution({ act: 'add', new_item: null }).act, 'other')
  const q = readTurnResolution({ act: 'question', standalone: ' Who drives to X? ', event_id: 'a' }, { knownIds: ['a'] })
  assert.deepEqual([q.act, q.standalone, q.isQuestion, q.eventId], ['question', 'Who drives to X?', true, 'a'])
  assert.equal(readTurnResolution({ act: 'change', event_id: 'a', changes: { driver: 'Kelly' } }, { knownIds: ['a'] }).act, 'change')
})

test('a new item needs a name, a day and a time (or all day); otherwise the full assistant asks', () => {
  const args = newItemArgs({ title: 'Piano lesson', date: '2026-10-01', start: '17:00', people: ['liv'], kind: 'event' }, { utcOffset: '-04:00', familyNames: ['Liv'] })
  assert.deepEqual([args.title, local(args.start), local(args.end), args.members, args.event_type], ['Piano lesson', '2026-10-01T17:00', '2026-10-01T18:00', ['Liv'], 'event'])
  assert.equal(newItemArgs({ title: 'Piano', date: '2026-10-01', start: null }, {}), null)
  assert.equal(newItemArgs({ title: 'Piano', date: null, start: '17:00' }, {}), null)
  const reminder = newItemArgs({ title: 'Call the vet', date: '2026-10-01', start: '9:00', kind: 'reminder' }, { utcOffset: '-04:00' })
  assert.equal(Date.parse(reminder.end) - Date.parse(reminder.start), 15 * 60e3)
  const ranged = newItemArgs({ title: 'Party', date: '2026-10-03', start: '14:00', end: '16:30', place: 'Park' }, { utcOffset: '-04:00' })
  assert.deepEqual([local(ranged.end), ranged.location], ['2026-10-03T16:30', 'Park'])
})

test("a change names the event, what changes, and the version it was read at", () => {
  const event = { id: 'e1', start_time: '2026-09-27T16:00:00.000Z', end_time: '2026-09-27T17:00:00.000Z', updated_at: 'v7' }
  const later = changeArgs(event, { start: '12:30' }, { utcOffset: '-04:00' })
  assert.deepEqual([later.id, later.expected_updated_at, local(later.start), local(later.end)], ['e1', 'v7', '2026-09-27T12:30', '2026-09-27T13:30'])
  assert.deepEqual(changeArgs(event, { driver: 'kelly' }, { familyNames: ['Kelly'] }), { id: 'e1', expected_updated_at: 'v7', driver_name: 'Kelly' })
  assert.deepEqual(changeArgs(event, { add_people: ['Liv'] }, { familyNames: ['Liv'] }).members_add, ['Liv'])
  assert.equal(changeArgs(event, { kind: 'event' }, {}), null, 'nothing it can change')
})

test('a draft takes a place and keeps its time and people', () => {
  const args = applyDraftChanges(draft, { place: 'Palm Beach Pediatric Dentistry' }, { utcOffset: '-04:00' })
  assert.equal(args.location, 'Palm Beach Pediatric Dentistry')
  assert.equal(args.start, draft.args.start)
  assert.deepEqual(args.members, ['Emme'])
  assert.ok(args.temporal_provenance, 'same day: the first message still vouches for the date')
})

test('a new start keeps the length; a new day drops the old date evidence', () => {
  const later = applyDraftChanges(draft, { start: '16:00' }, { utcOffset: '-04:00' })
  assert.deepEqual([local(later.start), local(later.end)], ['2026-09-29T16:00', '2026-09-29T17:00'])
  const moved = applyDraftChanges(draft, { date: '2026-09-30', start: '9:15', duration_minutes: 45 }, { utcOffset: '-04:00' })
  assert.deepEqual([local(moved.start), local(moved.end)], ['2026-09-30T09:15', '2026-09-30T10:00'])
  assert.equal(moved.temporal_provenance, undefined)
  const ends = applyDraftChanges(draft, { end: '17:15' }, { utcOffset: '-04:00' })
  assert.deepEqual([local(ends.start), local(ends.end)], ['2026-09-29T15:30', '2026-09-29T17:15'])
})

test('people join a new draft by name (as the family spells them), or are added to a change', () => {
  const added = applyDraftChanges(draft, { add_people: ['liv'] }, { familyNames: ['Emme', 'Liv'] })
  assert.deepEqual(added.members, ['Emme', 'Liv'])
  const removed = applyDraftChanges(draft, { remove_people: ['emme'] }, {})
  assert.deepEqual(removed.members, [])
  const change = applyDraftChanges({ tool: 'update_event', args: { id: 'e1' } }, { add_people: ['Liv'] }, { familyNames: ['Liv'] })
  assert.deepEqual(change.members_add, ['Liv'])
})

test('all day covers the whole local day', () => {
  const args = applyDraftChanges(draft, { all_day: true }, { utcOffset: '-04:00' })
  assert.equal(args.all_day, true)
  assert.equal(local(args.start), '2026-09-29T00:00')
  assert.equal(Date.parse(args.end) - Date.parse(args.start), 24 * 3600e3)
})

test('the prompt shows the draft and numbers the items in listed order, with their ids', () => {
  const prompt = buildTurnPrompt({
    messages: [{ role: 'user', content: 'what is on sunday' }, { role: 'assistant', content: 'Two things.' }, { role: 'user', content: 'next?' }],
    draft,
    referents: [
      { id: 'e1', title: 'Soccer', start_time: '2026-09-27T16:00:00Z', end_time: '2026-09-27T17:00:00Z', people: ['Liv'], drivers: [], place: 'Park' },
      { id: 'e2', title: 'Piano', start_time: '2026-09-27T19:00:00Z', end_time: '2026-09-27T20:00:00Z', people: [], drivers: ['Kelly'], place: null },
    ],
    family: [{ name: 'Liv' }],
    nowLine: 'Saturday',
    utcOffset: '-04:00',
  })
  assert.match(prompt, /ADD a new item[\s\S]*title: Dentist[\s\S]*Tuesday 2026-09-29, 3:30 PM to 4:30 PM/)
  assert.match(prompt, /1\. \[e1\] Soccer — Sunday 2026-09-27, 12 PM to 1 PM — people: Liv — place: Park\n2\. \[e2\] Piano .* drivers: Kelly/)
  assert.match(prompt, /LATEST FROM THE PERSON: "next\?"/)
})

test('every turn with words from the person is read; nothing else is', () => {
  assert.equal(hasTurnToRead([{ role: 'user', content: 'what is on today' }]), true)
  assert.equal(hasTurnToRead([{ role: 'user', content: '  ' }]), false)
  assert.equal(hasTurnToRead([{ role: 'assistant', content: 'hi' }]), false)
  assert.equal(hasTurnToRead([]), false)
})

test('an unclear change asks which, naming real candidates; one candidate is not a question', () => {
  const ask = readTurnResolution({ act: 'clarify', candidates: ['a', 'b', 'made-up'], question: 'Which one — A or B?' }, { knownIds: ['a', 'b'] })
  assert.deepEqual([ask.act, ask.candidates, ask.clarifyQuestion], ['clarify', ['a', 'b'], 'Which one — A or B?'])
  assert.equal(readTurnResolution({ act: 'clarify', candidates: ['a'], question: 'Which?' }, { knownIds: ['a'] }).act, 'other')
  assert.equal(readTurnResolution({ act: 'change', event_id: 'a', changes: { driver: 'Jake' }, is_question: true }, { knownIds: ['a'] }).isQuestion, false, 'a suggested change is a change')
})

test('dropping the draft is its own yes/no: alone it just closes, with a question it closes and answers', () => {
  const only = readTurnResolution({ closes_draft: true, act: 'none' }, { draft })
  assert.deepEqual([only.act, only.closesDraft], ['none', true])
  const legacy = readTurnResolution({ act: 'cancel_draft' }, { draft })
  assert.deepEqual([legacy.act, legacy.closesDraft], ['none', true])
  const both = readTurnResolution({ closes_draft: true, act: 'question', event_id: 'a', standalone: 'When is A?' }, { draft, knownIds: ['a'] })
  assert.deepEqual([both.act, both.closesDraft, both.isQuestion, both.eventId], ['question', true, true, 'a'])
  assert.equal(readTurnResolution({ closes_draft: true, act: 'none' }, { draft: null }).act, 'other', 'no draft, nothing to close')
  assert.equal(readTurnResolution({ closes_draft: true, act: 'revise_draft', changes: { place: 'X' } }, { draft }).act, 'other', "a closed draft isn't revised")
})

test('a change that only names a busy day asks which one; any other evidence goes ahead', () => {
  const a = { id: 'a', all_day: false, event_type: 'event' }
  const b = { id: 'b', all_day: false, event_type: 'event' }
  const note = { id: 'n', all_day: false, event_type: 'reminder' }
  const change = (identifiedBy) => ({ act: 'change', identifiedBy })
  assert.deepEqual(sameDayChoices(change('day'), a, [a, b, note]).map((e) => e.id), ['a', 'b'])
  assert.deepEqual(sameDayChoices(change(null), a, [a, b]).map((e) => e.id), ['a', 'b'], 'no evidence given counts as day only')
  assert.equal(sameDayChoices(change('name'), a, [a, b]), null)
  assert.equal(sameDayChoices(change('conversation'), a, [a, b]), null)
  assert.equal(sameDayChoices(change('day'), a, [a, note]), null, 'the only real item that day')
  assert.equal(sameDayChoices({ act: 'question' }, a, [a, b]), null)
})

test('weekdays are looked up in a table of the next two weeks, never computed by the model', async () => {
  const { dayTable } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const table = dayTable('2026-09-26T20:00:00Z', '-04:00').split('\n')
  assert.equal(table[0], '2026-09-26 Saturday, Sep 26 (today)')
  assert.equal(table[1], '2026-09-27 Sunday, Sep 27 (tomorrow)')
  assert.equal(table[3], '2026-09-29 Tuesday, Sep 29')
  assert.equal(table.length, 15)
  assert.equal(dayTable('2026-09-27T02:30:00Z', '-04:00').split('\n')[0], '2026-09-26 Saturday, Sep 26 (today)', 'late evening is still today locally')
})
