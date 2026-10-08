import test from 'node:test'
import assert from 'node:assert/strict'
import { findTidy, parseTidyAi, tidyPrompt, tidySection, applyOps, undoOps } from '../supabase/functions/_shared/tidy.mjs'

// Jake, Oct 8: "have alexa review the day and maybe a few days forward and check if reminders/events/todos should be
// merged or cleaned up with a suggested resolution … duplication even today with all day events and then date/time events
// with the same info" → canvas 75 (approved: the pill only, "I have something for you"). Thursday Oct 8, his real four.
const today = '2026-10-08'
const ev = (id, title, extra = {}) => ({ id, title, event_type: 'reminder', all_day: false, has_due_date: true, status: 'confirmed', deleted_at: null, purge_after: null, description: null, created_at: '2026-10-01T12:00:00Z', ...extra })
const events = [
  ev('box1', 'Look into box character project', { start_time: '2026-10-08T13:17:00Z', end_time: '2026-10-08T13:47:00Z', created_at: '2026-10-08T11:17:10Z' }),
  ev('box2', 'Look into box character project', { start_time: '2026-10-08T13:17:00Z', end_time: '2026-10-08T13:47:00Z', created_at: '2026-10-08T11:19:18Z', description: 'Start with the cardboard' }),
  ev('hal-alexa', 'Get Halloween decorations from storage.', { start_time: '2026-10-08T16:00:00Z', end_time: '2026-10-08T16:30:00Z' }),
  ev('hal-step', 'Halloween decorations: Get decorations from storage unit and test lights', { has_due_date: false, start_time: '2026-10-07T04:00:00Z', end_time: '2026-10-07T04:30:00Z' }),
  ev('tesla-step', 'Install Tesla charger in garage: Get quotes from licensed electricians for 240V installation', { start_time: '2026-10-08T19:00:00Z', end_time: '2026-10-08T19:30:00Z' }),
  ev('tesla-cal', 'Install Tesla charger in garage: Get quotes from licensed electricians for 240V installation', { event_type: 'event', all_day: true, start_time: '2026-10-07T00:00:00Z', end_time: '2026-10-08T00:00:00Z' }),
  ev('tire', 'Replace tire sensor', { start_time: '2026-09-16T13:00:00Z', end_time: '2026-09-16T13:30:00Z' }),
  ev('bday', 'Heather’s Birthday', { event_type: 'event', all_day: true, has_due_date: false, start_time: '2026-10-08T00:00:00Z', end_time: '2026-10-09T00:00:00Z' }),
  ev('text', 'Text Heather a happy birthday message', { start_time: '2026-10-08T11:00:00Z', end_time: '2026-10-08T11:30:00Z' }),
  ev('soccer', 'Soccer practice', { event_type: 'event', start_time: '2026-10-10T18:00:00Z', end_time: '2026-10-10T19:30:00Z' }),
  ev('school-allday', 'Spirit Day', { event_type: 'event', all_day: true, has_due_date: false, start_time: '2026-10-09T00:00:00Z', end_time: '2026-10-10T00:00:00Z' }),
  ev('school-timed', 'Spirit Day assembly', { event_type: 'event', start_time: '2026-10-09T12:00:00Z', end_time: '2026-10-09T13:00:00Z' }),
  ev('dentist-allday', 'Dentist (Dr. Ledakis)', { event_type: 'event', all_day: true, has_due_date: false, start_time: '2026-10-09T00:00:00Z', end_time: '2026-10-10T00:00:00Z' }),
  ev('dentist-timed', 'Dentist - Dr. Ledakis', { event_type: 'event', start_time: '2026-10-09T18:00:00Z', end_time: '2026-10-09T19:00:00Z' }),
]
const steps = [
  { id: 's-hal', project_id: 'p-hal', title: 'Get decorations from storage unit and test lights', reminder_event_id: 'hal-step', cal_event_id: null, cal_start: null, done_at: null },
  { id: 's-tesla', project_id: 'p-tesla', title: 'Get quotes from licensed electricians for 240V installation', reminder_event_id: 'tesla-step', cal_event_id: 'tesla-cal', cal_start: '2026-10-07', done_at: null },
]
const projects = [{ id: 'p-hal', title: 'Halloween decorations' }, { id: 'p-tesla', title: 'Install Tesla charger in garage' }]

test('the same thing twice is one: the later copy folds into the first', () => {
  const out = findTidy({ events, steps, projects, today, kept: [] })
  const copy = out.find((s) => s.kind === 'copy')
  assert.deepEqual(copy.items, ['box1', 'box2'])
  assert.match(copy.says, /“Look into box character project” is on twice, both at 9:17 AM today/)
  assert.equal(copy.fix, 'Keep one — I’ll fold the second into the first.')
  const merge = copy.choices.find((c) => c.key === 'yes')
  assert.equal(merge.label, 'Merge them')
  assert.deepEqual(merge.ops, [{ op: 'notes', id: 'box1', add: ['Start with the cardboard'] }, { op: 'remove', id: 'box2' }])
  assert.deepEqual(copy.choices.find((c) => c.key === 'no'), { key: 'no', label: 'Keep both', ops: [] })
})

test('a project step on the calendar twice — all day yesterday and at 3:00 today — keeps today’s', () => {
  const s = findTidy({ events, steps, projects, today, kept: [] }).find((x) => x.kind === 'step_double')
  assert.deepEqual(s.items, ['tesla-step', 'tesla-cal'])
  assert.match(s.says, /“Install Tesla charger in garage: Get quotes.*” is on all day yesterday and again at 3:00 PM today/)
  assert.equal(s.fix, 'Keep 3:00 PM today; take yesterday’s off.')
  assert.deepEqual(s.choices[0].ops, [{ op: 'remove', id: 'tesla-cal' }, { op: 'step_day', step_id: 's-tesla', cal_start: '2026-10-08' }])
})

// The real one, Oct 8: the step's calendar entry is all day today (kept at midnight UTC of its date) and its reminder at 3.
test('a step all day today and at 3:00 PM today: keep the timed one', () => {
  const sameDay = events.map((e) => (e.id === 'tesla-cal' ? { ...e, start_time: '2026-10-08T00:00:00Z', end_time: '2026-10-09T00:00:00Z' } : e))
  const s = findTidy({ events: sameDay, steps, projects, today, kept: [] }).find((x) => x.kind === 'step_double')
  assert.match(s.says, /is on all day today and again at 3:00 PM\.$/)
  assert.equal(s.fix, 'Keep the 3:00 PM one; take the all-day off.')
})

test('an all-day and a timed one of the same thing on a day keeps the timed one; a related one is left alone', () => {
  const out = findTidy({ events, steps, projects, today, kept: [] })
  const dentist = out.find((x) => x.kind === 'allday_double')
  assert.deepEqual(dentist.items, ['dentist-timed', 'dentist-allday'])
  assert.deepEqual(dentist.choices[0].ops, [{ op: 'remove', id: 'dentist-allday' }])
  // Spirit Day and its assembly aren't the same thing (different names); Heather's birthday and the text either.
  assert.equal(out.filter((x) => x.kind === 'allday_double').length, 1)
  assert.ok(!out.some((x) => x.items.includes('bday') || x.items.includes('school-allday')))
})

test('a reminder stuck three weeks gets a time it could go (a free weekend morning), done, or dropped', () => {
  const s = findTidy({ events, steps, projects, today, kept: [] }).find((x) => x.kind === 'stuck')
  assert.deepEqual(s.items, ['tire'])
  assert.match(s.says, /“Replace tire sensor” has been overdue since Sep 16/)
  assert.equal(s.fix, 'Saturday 10 AM is open — put it there?')
  assert.deepEqual(s.choices.map((c) => c.label), ['Saturday 10 AM', 'Done already', 'Drop it'])
  assert.deepEqual(s.choices[0].ops, [{ op: 'retime', id: 'tire', start: '2026-10-10T14:00:00.000Z', end: '2026-10-10T14:30:00.000Z' }])
  assert.deepEqual(s.choices[1].ops, [{ op: 'done', id: 'tire' }])
  assert.deepEqual(s.choices[2].ops, [{ op: 'remove', id: 'tire' }])
})

test('what was answered "keep both" isn’t asked again; none in a quiet week', () => {
  const first = findTidy({ events, steps, projects, today, kept: [] })
  const kept = [first.find((s) => s.kind === 'copy').pair_key]
  assert.ok(!findTidy({ events, steps, projects, today, kept }).some((s) => s.kind === 'copy'))
  assert.deepEqual(findTidy({ events: [events[9]], steps: [], projects: [], today, kept: [] }), [])
})

test('the same thing in other words is the AI’s to see: only real ids, a step kept over a loose reminder, the time carried', () => {
  const p = tidyPrompt(events, { today, steps, projects })
  assert.match(p, /\[hal-alexa\] reminder · Thu Oct 8 12:00 PM · Get Halloween decorations from storage\./)
  assert.match(p, /\[hal-step\] step of “Halloween decorations” · no time · Get decorations from storage unit and test lights/)
  const out = parseTidyAi(JSON.stringify([
    { keep: 'hal-alexa', drop: 'hal-step', why: 'Same storage run' },
    { keep: 'bday', drop: 'text', why: 'Both Heather' },
    { keep: 'nope', drop: 'box1', why: 'x' },
  ]), { events, steps, projects, today, taken: new Set(['box1', 'box2']) })
  assert.equal(out.length, 2)
  const hal = out[0]
  assert.equal(hal.kind, 'same_thing')
  // The project's step is the one kept, at the reminder's time; the loose reminder goes.
  assert.deepEqual(hal.items, ['hal-step', 'hal-alexa'])
  assert.equal(hal.fix, 'Make it that step, at 12:00 PM today.')
  assert.deepEqual(hal.choices[0].ops, [{ op: 'retime', id: 'hal-step', start: '2026-10-08T16:00:00.000Z', end: '2026-10-08T16:30:00.000Z' }, { op: 'remove', id: 'hal-alexa' }])
  assert.equal(hal.choices[0].label, 'Make it the step')
})

test('ops apply to the rows and undo puts every one back', () => {
  const rows = Object.fromEntries(events.map((e) => [e.id, { ...e }]))
  const stepRows = Object.fromEntries(steps.map((s) => [s.id, { ...s }]))
  const { before } = applyOps([{ op: 'notes', id: 'box1', add: ['Start with the cardboard'] }, { op: 'remove', id: 'box2' }, { op: 'step_day', step_id: 's-tesla', cal_start: '2026-10-08' }], { events: rows, steps: stepRows, now: '2026-10-08T15:00:00Z' })
  assert.equal(rows.box2.status, 'cancelled')
  assert.ok(rows.box2.deleted_at)
  assert.match(rows.box1.description, /Start with the cardboard/)
  assert.equal(stepRows['s-tesla'].cal_start, '2026-10-08')
  undoOps(before, { events: rows, steps: stepRows })
  assert.deepEqual(rows.box2, { ...events[1] })
  assert.equal(rows.box1.description, null)
  assert.equal(stepRows['s-tesla'].cal_start, '2026-10-07')
})

test('Alexa’s section: what she has, so “what have you got for me?” is answered and done', () => {
  const s = tidySection([{ id: 't1', says: '“Look into box character project” is on twice.', fix: 'Keep one.', choices: [{ key: 'yes', label: 'Merge them' }, { key: 'no', label: 'Keep both' }] }])
  assert.match(s, /^SOMETHING FOR YOU/)
  assert.match(s, /\[t1\] “Look into box character project” is on twice\. → Keep one\. \(choices: yes = Merge them; no = Keep both\)/)
  assert.equal(tidySection([]), null)
})

// The first real run (Oct 8): the AI paired a step with its own calendar day, and offered to drop one project's step for
// another's; two stuck ones were both offered Sunday 10 AM.
test('a step and its own calendar day aren’t a pair; a step is never the one dropped; each stuck one gets its own time', () => {
  const withCal = [...events, ev('hal-cal', 'Halloween decorations: Get decorations from storage unit and test lights', { event_type: 'event', all_day: true, has_due_date: false, start_time: '2026-10-08T00:00:00Z', end_time: '2026-10-09T00:00:00Z' }),
    ev('crack-step', 'Fix the Cracks: Select stucco company', { has_due_date: false, start_time: '2026-10-01T04:00:00Z', end_time: '2026-10-01T04:30:00Z' }), ev('quote-step', 'Paint the house: get quote to fix cracks', { has_due_date: false, start_time: '2026-10-01T04:00:00Z', end_time: '2026-10-01T04:30:00Z' }),
    ev('field', 'Field Trip Signatures', { start_time: '2026-09-16T13:00:00Z', end_time: '2026-09-16T13:30:00Z' })]
  const st = [{ ...steps[0], cal_event_id: 'hal-cal' }, steps[1],
    { id: 's-crack', project_id: 'p-crack', title: 'Select stucco company', reminder_event_id: 'crack-step', cal_event_id: null, done_at: null },
    { id: 's-quote', project_id: 'p-paint', title: 'get quote to fix cracks', reminder_event_id: 'quote-step', cal_event_id: null, done_at: null }]
  // The step's calendar day isn't on the AI's list (the step's line is).
  assert.doesNotMatch(tidyPrompt(withCal, { today, steps: st, projects }), /\[hal-cal\]/)
  const out = parseTidyAi(JSON.stringify([{ keep: 'hal-step', drop: 'hal-cal' }, { keep: 'crack-step', drop: 'quote-step' }, { keep: 'hal-step', drop: 'hal-alexa' }]), { events: withCal, steps: st, projects, today, taken: new Set() })
  assert.deepEqual(out.map((s) => s.items), [['hal-step', 'hal-alexa']])
  const stuck = findTidy({ events: withCal, steps: st, projects, today, kept: [] }).filter((s) => s.kind === 'stuck')
  assert.equal(stuck.length, 2)
  assert.notEqual(stuck[0].choices[0].label, stuck[1].choices[0].label)
})
