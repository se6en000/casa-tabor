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

test("a change only goes ahead when the person's words point at the item; otherwise, on a busy day, Casa asks which", async () => {
  const { sameDayChoices, wordsPointTo } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const emmy = { id: 'a', title: 'Emmy is watching Owen', start_time: '2026-09-27T16:00:00Z', all_day: false, event_type: 'event' }
  const box = { id: 'b', title: 'HelloFresh delivery', start_time: '2026-09-27T19:00:00Z', all_day: false, event_type: 'event' }
  const note = { id: 'n', title: 'Call the vet', start_time: '2026-09-27T14:00:00Z', all_day: false, event_type: 'reminder' }
  const o = (latestText, conversationIds = []) => ({ latestText, conversationIds, utcOffset: '-04:00' })
  assert.deepEqual(sameDayChoices(box, [emmy, box, note], o('push the Sunday one to 5 pm')).map((e) => e.id), ['a', 'b'])
  assert.equal(sameDayChoices(box, [emmy, box], o('move the hellofresh box to 5')), null, 'a title word')
  assert.equal(sameDayChoices(box, [emmy, box], o('push the 3 pm one to 5')), null, 'its time')
  assert.equal(sameDayChoices(box, [emmy, box], o('push it to 5', ['b'])), null, 'just talked about')
  assert.equal(sameDayChoices(box, [box, note], o('move my thing on Sunday')), null, 'the only real item that day')
  assert.equal(wordsPointTo(emmy, 'the 12 one', [], '-04:00'), false, 'a bare number is not a time')
  assert.equal(wordsPointTo(emmy, 'the noon one at 12 pm', [], '-04:00'), true)
})

test('a bare weekday is settled by the server to the next one on the calendar', async () => {
  const { settleDate } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const now = '2026-09-26T21:40:00Z' // Saturday 5:40 PM local
  assert.equal(settleDate('2026-10-06', 'weekday', now, '-04:00'), '2026-09-29', 'drifted a week: pulled back')
  assert.equal(settleDate('2026-09-29', 'weekday', now, '-04:00'), '2026-09-29')
  assert.equal(settleDate('2026-09-26', 'weekday', now, '-04:00'), '2026-09-26', 'today counts')
  assert.equal(settleDate('2026-10-06', 'next_week', now, '-04:00'), '2026-10-06', 'next week stays')
  assert.equal(settleDate('2026-10-06', 'date', now, '-04:00'), '2026-10-06')
  assert.equal(settleDate(null, 'weekday', now, '-04:00'), null)
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

test('answering "which one?" keeps the change asked for; the time used to pick the item is not a new time', async () => {
  const { carryOverChange } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const box = { id: 'b', start_time: '2026-09-27T19:00:00Z' } // 3 PM local
  assert.deepEqual(carryOverChange({ start: '17:00' }, { start: '15:00' }, box, '-04:00'), { start: '17:00' })
  assert.deepEqual(carryOverChange({ start: '17:00' }, null, box, '-04:00'), { start: '17:00' })
  assert.deepEqual(carryOverChange({ start: '17:00' }, { start: '18:00' }, box, '-04:00'), { start: '18:00' }, 'a new time in the answer wins')
  assert.deepEqual(carryOverChange({ start: '17:00' }, { place: 'Porch' }, box, '-04:00'), { start: '17:00', place: 'Porch' })
  assert.equal(carryOverChange(null, null, box, '-04:00'), null)
})

test('after "which one?", naming just the item is a complete change (the asked-for change is pending)', () => {
  assert.equal(readTurnResolution({ act: 'change', event_id: 'a' }, { knownIds: ['a'] }).act, 'other')
  assert.equal(readTurnResolution({ act: 'change', event_id: 'a' }, { knownIds: ['a'], pendingChange: true }).act, 'change')
})

test('a question the listed calendar can answer is marked so; anything else is not', () => {
  assert.equal(readTurnResolution({ act: 'question', answerable: true }).answerable, true)
  assert.equal(readTurnResolution({ act: 'question' }).answerable, false)
  assert.equal(readTurnResolution({ act: 'other', answerable: true }).answerable, false)
})

test('words not said to Casa (someone else in the room, the TV) are an aside: no answer, and a draft stays open', () => {
  const draft = { tool: 'create_event', args: { title: 'Dentist' } }
  const aside = readTurnResolution({ act: 'aside', closes_draft: false, standalone: 'Owen get your shoes on' }, { draft })
  assert.equal(aside.act, 'aside')
  assert.equal(aside.closesDraft, false, 'an aside never calls off the draft')
  assert.equal(aside.isQuestion, false)
  // The prompt asks for it only when the words are clearly not for Casa.
  const prompt = buildTurnPrompt({ messages: [{ role: 'user', content: 'Owen get your shoes on' }], family: [], nowLine: 'now', utcOffset: '-04:00', nowIso: '2026-09-26T21:00:00Z' })
  assert.match(prompt, /"aside": the words clearly weren't said to Casa/)
  // Heard in the test runs 2026-09-26: "thanks. oh and we're out of milk btw" came back as an aside.
  assert.match(prompt, /Telling Casa something — a thanks, a fact, a need \("thanks, oh and we're out of milk btw"/)
  // Overnight queue (4), 2026-09-29: "Owen changed his mind, he wants to be a skeleton now instead of a
  // ghost" — said right after a card about Emme — was dropped as an aside: a new subject read as "nothing
  // to do with the conversation". It's who the words are said to, not what they're about.
  assert.match(prompt, /It's about who the words are said to, not their subject/)
  assert.doesNotMatch(prompt, /have nothing to do with the conversation with Casa/)
})

test('a question about the draft on screen is answered with the draft in view ("does that clash with anything that day")', async () => {
  const { buildAnswerPrompt, draftOverlaps } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  // Whether anything overlaps is worked out by the server, not guessed: on 2026-09-27 the model said a
  // 3:30 dentist visit "clashes with" a 10 AM appointment.
  const day = [
    { id: 'w1', title: 'Academic Scholarship Webinar', start_time: '2026-09-29T14:30:00-04:00', end_time: '2026-09-29T15:15:00-04:00', all_day: false },
    { id: 'w2', title: 'Soccer', start_time: '2026-09-29T16:00:00-04:00', end_time: '2026-09-29T17:00:00-04:00', all_day: false },
    { id: 'w3', title: 'Grandma visiting', start_time: '2026-09-29T00:00:00-04:00', end_time: '2026-09-30T00:00:00-04:00', all_day: true },
  ]
  assert.deepEqual(draftOverlaps(draft, day).map((e) => e.id), ['w2'], 'only what overlaps 3:30–4:30; not the 2:30 webinar that ends at 3:15, not an all-day item')
  const prompt = buildAnswerPrompt({ question: 'does that clash with anything that day', calendarLines: ['- [w1] Academic Scholarship Webinar — Tue, Sep 29, 2:30 PM'], nowLine: 'now', draft, utcOffset: '-04:00', overlaps: ['Soccer'] })
  assert.match(prompt, /ON SCREEN, NOT SAVED YET: .*Dentist/)
  assert.match(prompt, /"that", "it" or "the appointment" can mean the draft/)
  assert.match(prompt, /Overlapping the draft's time \(worked out exactly\): Soccer/)
  assert.match(buildAnswerPrompt({ question: 'q', calendarLines: [], nowLine: 'now', draft, utcOffset: '-04:00', overlaps: [] }), /Overlapping the draft's time \(worked out exactly\): nothing/)
  assert.doesNotMatch(buildAnswerPrompt({ question: 'q', calendarLines: [], nowLine: 'now', draft: null, utcOffset: '-04:00' }), /ON SCREEN/)
})

test('a yes to the draft that reaches the server confirms it — never the same card again', async () => {
  const { readFileSync } = await import('node:fs')
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /turnResolution\?\.act === 'confirm_draft' && openDraft\(/)
  assert.match(server, /confirms_draft: true/)
  const client = readFileSync(new URL('../src/wall/useAssistantTurn.ts', import.meta.url), 'utf8')
  assert.match(client, /answer\?\.confirmsDraft/)
})

// Overnight queue (4), measured 2026-09-29: with a card waiting on screen, a new subject said to Casa
// ("Owen changed his mind, he wants to be a skeleton now instead of a ghost") came back as an aside 3 of
// 3 — the card pulls the reading toward "is this about the card?". An aside now gets a second, narrow
// look: who were the words said to — no card, no draft, just the last few turns.
test('an aside gets a second look that asks only who the words were said to', async () => {
  const { buildAsidePrompt, readAsideCheck } = await import('../supabase/functions/_shared/assistant-turn-context.mjs')
  const prompt = buildAsidePrompt({ messages: [{ role: 'user', content: 'Move the build night' }, { role: 'assistant', content: 'Update: time → Sun' }, { role: 'user', content: 'Liv has a sleepover Friday' }] })
  assert.match(prompt, /who the LATEST words were said to/i)
  assert.match(prompt, /"room"/)
  assert.match(prompt, /"casa"/)
  assert.doesNotMatch(prompt, /WAITING FOR THE PERSON'S YES/, 'no draft to pull the reading')
  assert.match(prompt, /LATEST: "Liv has a sleepover Friday"/)
  assert.equal(readAsideCheck({ said_to: 'room' }), 'room')
  assert.equal(readAsideCheck({ said_to: 'casa' }), 'casa')
  assert.equal(readAsideCheck(null), 'casa', 'unsure: never drop what might be for Casa')
  const fs = await import('node:fs')
  const ai = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(ai, /if \(resolution\.act === 'aside'\) \{/)
  assert.match(ai, /buildAsidePrompt\(\{ messages \}\), 'aside-check'/)
})

// Bug report 8ae37110 (Oct 7): "add to that reminder's notes: she loves lilies …" — a change adds lines under what's
// there (the birthday texts stay); it never replaces the notes.
test('a change to an item’s notes adds lines, never replaces them', () => {
  const event = { id: 'e1', start_time: '2026-10-08T11:00:00.000Z', end_time: '2026-10-08T11:15:00.000Z', updated_at: 'v7' }
  const args = changeArgs(event, { notes: 'she loves lilies\ncall her after 6' }, { utcOffset: '-04:00' })
  assert.deepEqual(args, { id: 'e1', expected_updated_at: 'v7', notes_add: ['she loves lilies', 'call her after 6'] })
  assert.equal(changeArgs(event, { notes: '  ' }, { utcOffset: '-04:00' }), null)
})
