import test from 'node:test'
import assert from 'node:assert/strict'
import { statusFor, isExpired, gmailLink, offerToAction, personToAction, withoutRepeats } from '../supabase/functions/_shared/email-offers.mjs'

// Casa reads the email, phase 2 (canvas row 14, approved by Jake 2026-09-30).
const NOW = new Date('2026-09-30T15:00:00Z')

test('fresh offers wait for him; old mail and non-offers stay shadows', () => {
  assert.equal(statusFor('offer', '2026-09-29T12:00:00Z', NOW), 'waiting')
  assert.equal(statusFor('person', '2026-09-28T16:00:00Z', NOW), 'waiting')
  assert.equal(statusFor('offer', '2026-09-20T12:00:00Z', NOW), 'shadow', 'the September backlog doesn’t flood him')
  assert.equal(statusFor('none', '2026-09-30T12:00:00Z', NOW), 'shadow')
  assert.equal(statusFor('already', '2026-09-30T12:00:00Z', NOW), 'shadow')
})

test('an offer whose dates have all passed is expired; a person writing never is', () => {
  assert.equal(isExpired({ decision: 'offer', offers: [{ kind: 'event', date: '2026-09-28' }] }, '2026-09-30'), true)
  assert.equal(isExpired({ decision: 'offer', offers: [{ kind: 'event', date: '2026-09-28' }, { kind: 'reminder', date: '2026-10-02' }] }, '2026-09-30'), false)
  assert.equal(isExpired({ decision: 'offer', offers: [{ kind: 'todo', date: '2026-09-28' }] }, '2026-09-30'), false, 'a to-do dated its email’s day still stands (the permission slip)')
  assert.equal(isExpired({ decision: 'offer', offers: [{ kind: 'todo' }] }, '2026-09-30'), false)
  assert.equal(isExpired({ decision: 'person', offers: [] }, '2026-09-30'), false)
})

test('Open email goes to that message in Gmail', () => {
  assert.equal(gmailLink('19a2b3c'), 'https://mail.google.com/mail/#all/19a2b3c')
})

test('"Add it" is the card Casa already saves, for each kind', () => {
  assert.deepEqual(offerToAction({ kind: 'event', title: 'Homeaglow cleaning', date: '2026-10-21', start: '08:30', end: '11:30', place: 'Home' }),
    { tool: 'create_event', args: { title: 'Homeaglow cleaning', start: '2026-10-21T08:30:00-04:00', end: '2026-10-21T11:30:00-04:00', event_type: 'event', members: [], location: 'Home' } })
  assert.equal(offerToAction({ kind: 'event', title: 'Showcase', date: '2026-10-06', start: '17:00' }).args.end, '2026-10-06T18:00:00-04:00', 'an hour when no end is given')
  // A date and no time is all day (Oct 3: "That didn't save" on PTO's Crazy Hair Day — it used to make nothing).
  assert.equal(offerToAction({ kind: 'event', title: 'No time', date: '2026-10-06' }).args.all_day, true, 'a date, no time: all day')
  assert.equal(offerToAction({ kind: 'event', title: 'No date' }), null, 'an event needs its day')
  assert.deepEqual(offerToAction({ kind: 'reminder', title: 'Pay $15 for Liv’s debate tournament', date: '2026-10-02', people: ['Liv'] }),
    { tool: 'create_event', args: { title: 'Pay $15 for Liv’s debate tournament', start: '2026-10-02T09:00:00-04:00', end: '2026-10-02T09:00:00-04:00', event_type: 'reminder', members: ['Liv'] } })
  assert.deepEqual(offerToAction({ kind: 'todo', title: 'Sign Owen’s permission slips' }), { tool: 'add_todo', args: { title: 'Sign Owen’s permission slips', due: null } })
  assert.deepEqual(offerToAction({ kind: 'prep', title: 'Wear pink shirt', event_id: 'ev1' }), { tool: 'add_prep_item', args: { event_id: 'ev1', label: 'Wear pink shirt' } })
  assert.deepEqual(offerToAction({ kind: 'shopping', title: 'Clear dome umbrella' }), { tool: 'add_grocery_items', args: { items: [{ name: 'Clear dome umbrella' }] } })
  assert.equal(offerToAction({ kind: 'event' }), null)
  assert.deepEqual(personToAction({ who: 'Towhid Nishat', wants: 'Feedback on Owen’s progress' }), { tool: 'add_todo', args: { title: 'Reply to Towhid Nishat — Feedback on Owen’s progress', due: null } })
  // Live, 2026-09-30: the whole summary made two-line titles.
  assert.deepEqual(personToAction({ who: 'Towhid Nishat (Hope Center ABA)', wants: 'Feedback and suggestions on Owen’s progress, strengths, and challenges at home.' }).args.title, 'Reply to Towhid Nishat — Feedback and suggestions on Owen’s…')
})

test('the same offer twice (an email and its forward) shows once, the newest', () => {
  const festival = { kind: 'event', title: '2026 Strings Festival', date: '2026-10-24' }
  const rows = [{ id: 'fwd', decision: 'details', offers: [festival] }, { id: 'orig', decision: 'details', offers: [{ ...festival }] }, { id: 'other', decision: 'offer', offers: [{ kind: 'todo', title: 'Sign slips' }] }]
  assert.deepEqual(withoutRepeats(rows).map((r) => r.id), ['fwd', 'other'])
})

// "Add it" is saved on the server (2026-09-30): each offer of that email becomes the card Casa already saves,
// through execute-ai-action, then the email is marked added — so the wall and the phone stay thin.
test('"Add it" saves every offer of the email through the usual card path, then marks it added', async () => {
  const fs = await import('node:fs')
  const fn = fs.readFileSync(new URL('../supabase/functions/email-offers/index.ts', import.meta.url), 'utf8')
  assert.match(fn, /what === 'add'/)
  assert.match(fn, /offerToAction\(o, \{ decision: row\.decision, source: \{ from: row\.from_email/)
  assert.match(fn, /personToAction\(row\.person\)/)
  assert.match(fn, /functions\.invoke\('execute-ai-action'/)
  assert.match(fn, /confirmed_by_user: true/)
})

// "What came in by email?" / "Anything from email?" (canvas 14a/14c): Casa opens the review on the screen.
test('Casa opens the email review when asked, and the screen hears it', async () => {
  const { FULL_AI_TOOLS, READ_TOOLS } = await import('../supabase/functions/_shared/assistant-full-ai.mjs')
  const tool = FULL_AI_TOOLS.find((t) => t.name === 'open_email_review')
  assert.ok(tool && READ_TOOLS.has('open_email_review'))
  assert.match(tool.description, /what came in by email|anything from email/i)
  const fs = await import('node:fs')
  const server = fs.readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /call\.name === 'open_email_review'/)
  assert.match(server, /email_review: true/)
  const client = fs.readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
  assert.match(client, /emailReview: true/)
})

// Live, 2026-09-30: the travel receipt read as "details" — the flight times for events already on the calendar.
test('new details update the event already there — its time and place, never its notes', () => {
  const flight = { kind: 'event', title: 'Flight 1419 DJT→DFW', date: '2026-10-07', event_id: 'ev-flight', changes: { start: '14:13', end: '16:30' } }
  assert.deepEqual(offerToAction(flight, { decision: 'details' }), { tool: 'update_event', args: { id: 'ev-flight', start: '2026-10-07T14:13:00-04:00', end: '2026-10-07T16:30:00-04:00' } })
  const festival = { kind: 'event', title: '2026 Strings Festival', date: '2026-10-24', event_id: 'ev-fest', changes: { place: 'Dreyfoos High School', instructions: 'Arrive at 12:00 PM in performance attire.' } }
  assert.deepEqual(offerToAction(festival, { decision: 'details' }), { tool: 'update_event', args: { id: 'ev-fest', location: 'Dreyfoos High School' } })
  assert.equal(offerToAction({ ...festival, changes: { instructions: 'x' } }, { decision: 'details' }), null, 'nothing it can safely change')
  assert.equal(offerToAction({ ...flight, event_id: undefined }, { decision: 'details' }), null)
})

test('an email already added is never added again (a second screen with an older list)', async () => {
  const fs = await import('node:fs')
  const fn = fs.readFileSync(new URL('../supabase/functions/email-offers/index.ts', import.meta.url), 'utf8')
  assert.match(fn, /if \(row\.status === 'added'\) return json\(\{ ok: true, saved: \[\], already: true \}\)/)
  const hook = fs.readFileSync(new URL('../src/wall/useEmailOffers.ts', import.meta.url), 'utf8')
  assert.match(hook, /refetchOnMount: 'always'/)
})

// Jake, Oct 3 (backlog, with a screenshot of PTO's Crazy Hair Day: "That didn't save. Nothing was changed."): "I assume
// there is already an event there which is why it didn't save, but can it tell me that so this doesn't feel like an
// error. Also, if there is details from this email that the current event doesn't have it should offer to update it
// with this new information and tell me what it is." Traced: the offer was all day (a date, no time) — Add it could
// only make timed events, so it made nothing; and the event was already there (added with Casa at 6:34 PM).
test('an all-day offer (a date, no time) is an all-day event', async () => {
  const { offerToAction } = await import('../supabase/functions/_shared/email-offers.mjs')
  assert.deepEqual(offerToAction({ kind: 'event', title: "PTO's Crazy Hair Day", date: '2026-10-30', place: 'Palm Beach Public', people: ['Emme', 'Owen'] }), {
    tool: 'create_event',
    args: { title: "PTO's Crazy Hair Day", start: '2026-10-30T00:00:00-04:00', end: '2026-10-30T23:59:00-04:00', all_day: true, event_type: 'event', members: ['Emme', 'Owen'], location: 'Palm Beach Public' },
  })
})

test('already on the calendar: the event it matches, and only what the email adds that the event lacks', async () => {
  const { alreadyThere } = await import('../supabase/functions/_shared/email-offers.mjs')
  const offer = { kind: 'event', title: "PTO's Crazy Hair Day", date: '2026-10-30', place: 'Palm Beach Public', people: ['Emme', 'Owen'] }
  const events = [
    { id: 'spirit', title: 'Science Experiments & PTO Spirit Day', start_time: '2026-10-30T00:00:00Z', all_day: true, location: null, people: [] },
    { id: 'hair', title: "PTO's Crazy Hair Day", start_time: '2026-10-30T04:00:00Z', all_day: true, location: null, people: ['Emme', 'Owen'] },
    { id: 'other-day', title: "PTO's Crazy Hair Day", start_time: '2026-11-06T04:00:00Z', all_day: true, location: null, people: [] },
  ]
  assert.deepEqual(alreadyThere(offer, events), { event_id: 'hair', title: "PTO's Crazy Hair Day", adds: { place: 'Palm Beach Public' } })
  // Everything already there: nothing to add.
  assert.deepEqual(alreadyThere(offer, [{ ...events[1], location: 'Palm Beach Public Elementary' }]), { event_id: 'hair', title: "PTO's Crazy Hair Day", adds: {} })
  // A time the all-day event doesn't have.
  assert.deepEqual(alreadyThere({ kind: 'event', title: 'Picture Day', date: '2026-10-15', start: '08:30' }, [{ id: 'p', title: 'Picture day for Owen', start_time: '2026-10-15T04:00:00Z', all_day: true, location: null, people: ['Owen'] }]),
    { event_id: 'p', title: 'Picture day for Owen', adds: { start: '08:30' } })
  // A different thing on the same day, sharing only "PTO" and "day": not a match.
  assert.equal(alreadyThere({ kind: 'event', title: 'PTO Movie Night', date: '2026-10-30' }, events), null)
  // Only events are matched (a to-do offer stays an add).
  assert.equal(alreadyThere({ kind: 'todo', title: "PTO's Crazy Hair Day", date: '2026-10-30' }, events), null)
})

test('Add it on one already there: an update with what it adds, or nothing to do', async () => {
  const { offerToAction } = await import('../supabase/functions/_shared/email-offers.mjs')
  const there = { event_id: 'hair', title: "PTO's Crazy Hair Day", adds: { place: 'Palm Beach Public', people: ['Owen'] } }
  assert.deepEqual(offerToAction({ kind: 'event', title: "PTO's Crazy Hair Day", date: '2026-10-30', existing: there }), { tool: 'update_event', args: { id: 'hair', location: 'Palm Beach Public', members_add: ['Owen'] } })
  assert.equal(offerToAction({ kind: 'event', title: "PTO's Crazy Hair Day", date: '2026-10-30', existing: { ...there, adds: {} } }), 'already')
  assert.deepEqual(offerToAction({ kind: 'event', title: 'Picture Day', date: '2026-10-15', start: '08:30', existing: { event_id: 'p', title: 'Picture day', adds: { start: '08:30' } } }),
    { tool: 'update_event', args: { id: 'p', start: '2026-10-15T08:30:00-04:00', end: '2026-10-15T09:30:00-04:00', all_day: false } })
})

test('what to wear or bring lands on the event\'s get & pack: with a new event, an update, or on its own', async () => {
  const { offerToAction, alreadyThere } = await import('../supabase/functions/_shared/email-offers.mjs')
  // A new event: created, then its lines.
  const made = offerToAction({ kind: 'event', title: 'Field Trip', date: '2026-10-01', start: '09:30', bring: ['Pink shirt', 'Packed lunch'] })
  assert.equal(made.tool, 'create_event')
  assert.deepEqual(made.bring, ['Pink shirt', 'Packed lunch'])
  // Kim's email: the field trip's new end time, and its lines.
  const kim = offerToAction({ kind: 'event', title: 'Field Trip', date: '2026-10-01', event_id: 'ft', changes: { end: '12:00' }, bring: ['Pink shirt', 'Packed lunch'] }, { decision: 'details' })
  assert.deepEqual(kim, { tool: 'update_event', args: { id: 'ft', end: '2026-10-01T12:00:00-04:00' }, bring: ['Pink shirt', 'Packed lunch'] })
  // Only lines, nothing else new: just the lines.
  assert.deepEqual(offerToAction({ kind: 'event', title: 'Field Trip', date: '2026-10-01', event_id: 'ft', changes: {}, bring: ['Pink shirt'] }, { decision: 'details' }), { tool: 'bring', args: { event_id: 'ft' }, bring: ['Pink shirt'] })
  // Already on the calendar: only the lines its list doesn't have.
  const there = alreadyThere({ kind: 'event', title: 'Field Trip', date: '2026-10-01', bring: ['Pink shirt', 'Packed lunch'] }, [{ id: 'ft', title: 'Field Trip: Peter and the Wolf', start_time: '2026-10-01T13:30:00Z', all_day: false, location: 'Glazer Hall', people: [], bring: ['packed lunch'] }])
  assert.deepEqual(there, { event_id: 'ft', title: 'Field Trip: Peter and the Wolf', adds: { bring: ['Pink shirt'] } })
  assert.deepEqual(offerToAction({ kind: 'event', title: 'Field Trip', date: '2026-10-01', existing: there }), { tool: 'bring', args: { event_id: 'ft' }, bring: ['Pink shirt'] })
})

test('already there, by more than the name: the same start, or the same place or child, with a couple of words in common', async () => {
  const { alreadyThere } = await import('../supabase/functions/_shared/email-offers.mjs')
  const trip = { id: 'ft', title: "Field Trip: Ballet Palm Beach's production of Peter and the Wolf", start_time: '2026-10-01T13:30:00Z', all_day: false, location: null, people: ['Owen'], bring: [] }
  // Kim K.'s reminder, as the reader read it on Oct 3: a different name, the same 9:30 start.
  const kim = { kind: 'event', title: "Owen's Kindergarten Field Trip to Glazer Hall", date: '2026-10-01', start: '09:30', end: '12:00', place: 'Glazer Hall', people: ['Owen'], bring: ['Packed lunch'] }
  assert.deepEqual(alreadyThere(kim, [trip]), { event_id: 'ft', title: trip.title, adds: { place: 'Glazer Hall', bring: ['Packed lunch'] } })
  // The same child and two words in common, no time given.
  assert.equal(alreadyThere({ ...kim, start: undefined }, [trip])?.event_id, 'ft')
  // One word in common and nothing else: no.
  assert.equal(alreadyThere({ kind: 'event', title: 'Trip to the dentist', date: '2026-10-01', start: '15:00' }, [trip]), null)
})

// Canvas 65 (Jake, Oct 7): "if a todo or reminder is created from an email, that email context should be added to the
// notes. it should be specific enough, not summary generic" — the reader's specifics go in its notes, with the sender.
test('Add it keeps the email’s specifics in the notes, with who sent it and a link back', async () => {
  const { notesOf, notesSource } = await import('../supabase/functions/_shared/event-notes.mjs')
  const source = { from: 'Coach Rivera <rivera@huskies.org>', receivedAt: '2026-09-22T14:03:00Z', gmailId: 'm1' }
  const notes = ['Arrive by 12:10 for warm-ups', '$5 cash per adult at the gate']
  const ev = offerToAction({ kind: 'event', title: 'Softball', date: '2026-09-26', start: '12:30', notes }, { source })
  assert.equal(notesOf(ev.args.notes), '• Arrive by 12:10 for warm-ups\n• $5 cash per adult at the gate')
  assert.deepEqual(notesSource(ev.args.notes), { text: 'From Coach Rivera’s email · Sep 22', url: 'https://mail.google.com/mail/#all/m1' })
  const rem = offerToAction({ kind: 'reminder', title: 'Pick up photobook', date: '2026-09-25', notes: ['Order #48213-WPB, under Kelly’s name'] }, { source })
  assert.match(rem.args.notes, /Order #48213-WPB/)
  const todo = offerToAction({ kind: 'todo', title: 'Sign the waiver', notes: ['Link: https://forms.example/waiver'] }, { source })
  assert.match(todo.args.notes, /forms\.example/)
  // New details for something already on the calendar: lines added under its notes.
  const upd = offerToAction({ kind: 'event', event_id: 'ev1', changes: { place: 'Field 2' }, notes: ['Gate opens 11:45'] }, { decision: 'details', source })
  assert.deepEqual(upd.args.notes_add, ['Gate opens 11:45'])
  const only = offerToAction({ kind: 'event', event_id: 'ev1', notes: ['Gate opens 11:45'] }, { decision: 'details', source })
  assert.deepEqual(only, { tool: 'update_event', args: { id: 'ev1', notes_add: ['Gate opens 11:45'] } })
  // No specifics: nothing extra.
  assert.equal(offerToAction({ kind: 'todo', title: 'Sign it' }, { source }).args.notes, undefined)
})
