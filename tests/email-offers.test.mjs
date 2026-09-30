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
  assert.equal(offerToAction({ kind: 'event', title: 'No time', date: '2026-10-06' }), null, 'an event needs its time')
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
  assert.match(fn, /offerToAction\(o, \{ decision: row\.decision \}\)/)
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
