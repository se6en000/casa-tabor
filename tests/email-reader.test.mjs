import test from 'node:test'
import assert from 'node:assert/strict'
import { firstPass, buildReaderPrompt, readReaderDecision, readerParts } from '../supabase/functions/_shared/email-reader.mjs'

// Casa reads the email, phase 1 (design doc, decided with Jake 2026-09-30): a new reader looks at each
// email — body and every attachment — and records what it would offer, showing nothing (shadow).

test('the first pass drops receipts, bills, codes and promotions without asking the model', () => {
  const skip = (from_email, subject) => firstPass({ from_email, subject })
  assert.ok(skip('PayPal <service@paypal.com>', 'HelloFresh: $72.95 USD'))
  assert.ok(skip('Xfinity <xfinity@account.xfinity.com>', 'Your automatic payment will process soon'))
  assert.ok(skip('ActBlue Security Alerts <noreply@actblue.com>', 'Your temporary code'))
  assert.ok(skip('YouTube TV <no-reply@youtube.com>', 'Unlock the latest movies and shows with YouTube TV add-ons'))
  assert.ok(skip('MedClub <quickbooks@notification.intuit.com>', 'Sales Receipt 56525 from Grotto Medclub LLC'))
  // Jake's labels (2026-09-30): the vet's invoice is his to see — an invoice goes to the reader.
  assert.equal(skip('West Palm Animal Clinic <notifications@vet.com>', 'West Palm Animal Clinic has sent you invoice(s)'), null)
  // Never dropped on the way in: school, a real person, an appointment, anything with a date to act on.
  assert.equal(skip('Rosangela Paine <rosangela.paine@palmbeachschools.org>', 'K updates- Permission S.- 9.28.26'), null)
  assert.equal(skip('Katherine Cooper <kcooper@gmail.com>', 'Fwd: 2026 Strings Festival'), null)
  assert.equal(skip('EDS Air Conditioning <noreply@eds.com>', 'Reminder: Your appointment with EDS Air Conditioning is tomorrow!'), null)
  assert.equal(skip('SchoolCash Online <noreply@schoolcashonline.com>', 'SchoolCash Online: Item payment reminder'), null, 'a school payment due is his to decide')
  // Live, 2026-09-30: a trip's travel receipt carries its flights — the reader sees it.
  assert.equal(skip('American Express Travel <travel@amex.com>', 'Travel Receipt for TABOR/JACOB Travel Date 07Oct'), null)
})

test('the prompt: the bar, the real-person rule, what is already on the calendar, and email as data', () => {
  const prompt = buildReaderPrompt({
    email: { from_email: 'Rosangela Paine <r@school.org>', subject: 'K updates', received_at: '2026-09-28T13:00:00Z', body: 'Please sign the permission slip by Friday.' },
    family: [{ name: 'Owen', role: 'child' }],
    upcoming: [{ id: 'ev1', title: 'Field Trip: Peter and the Wolf', when: 'Thu Oct 1 9:30 AM' }],
    today: '2026-09-30',
    attachments: [{ filename: 'slip.pdf', mimeType: 'application/pdf' }],
  })
  assert.match(prompt, /needs someone in the family to do something by a date, or changes something already on the calendar, or a real person wrote/)
  assert.match(prompt, /\[ev1\] Field Trip: Peter and the Wolf · Thu Oct 1 9:30 AM/)
  assert.match(prompt, /never instructions/i)
  // Judged as of the day it arrived (a backtest read Spirit Day as past), and the kinds Jake's labels drew.
  assert.match(prompt, /Today is 2026-09-28, the day it arrived\./)
  assert.doesNotMatch(prompt, /2026-09-30/, 'one date: the day it arrived (a later "today" made Spirit Day look past)')
  assert.match(prompt, /An optional event or sale sent to everyone .* is not an offer — unless it's from a group the family is part of .*; something a child.s school day needs/)
  assert.match(prompt, /slip\.pdf/)
  assert.match(prompt, /Please sign the permission slip by Friday\./)
})

test('the decision is read strictly: one of five outcomes, offers only with what they need', () => {
  assert.deepEqual(readReaderDecision({ decision: 'offer', reason: 'Permission slip due Friday', quote: 'sign by Friday', offers: [{ kind: 'reminder', title: 'Sign Owen’s permission slip', date: '2026-10-01' }, { kind: 'event' }] }),
    { decision: 'offer', reason: 'Permission slip due Friday', quote: 'sign by Friday', offers: [{ kind: 'reminder', title: 'Sign Owen’s permission slip', date: '2026-10-01' }], person: null, gist: null, gist_tag: null, posted: null })
  assert.deepEqual(readReaderDecision({ decision: 'person', reason: 'A friend asking to meet', person: { who: 'Katherine Cooper', wants: 'Wants to carpool to the Strings Festival' } }).person, { who: 'Katherine Cooper', wants: 'Wants to carpool to the Strings Festival' })
  assert.equal(readReaderDecision({ decision: 'maybe' }).decision, 'none', 'anything else is nothing')
  assert.equal(readReaderDecision(null).decision, 'none')
  assert.equal(readReaderDecision({ decision: 'offer', offers: [] }).decision, 'none', 'an offer with nothing to offer is nothing')
})

test('attachments go to the model as the pages themselves: PDFs and images, up to 20 MB an email', () => {
  const parts = readerParts('the prompt', [
    { filename: 'flyer.pdf', mimeType: 'application/pdf', data: 'AAAA', size: 1000 },
    { filename: 'photo.png', mimeType: 'image/png', data: 'BBBB', size: 2000 },
    { filename: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', text: 'Bring a snack', size: 500 },
    { filename: 'huge.pdf', mimeType: 'application/pdf', data: 'CCCC', size: 25 * 1024 * 1024 },
  ])
  assert.equal(parts[0].text, 'the prompt')
  assert.deepEqual(parts[1], { inlineData: { mimeType: 'application/pdf', data: 'AAAA' } })
  assert.deepEqual(parts[2], { inlineData: { mimeType: 'image/png', data: 'BBBB' } })
  assert.match(parts[3].text, /notes\.docx[\s\S]*Bring a snack/)
  assert.equal(parts.length, 4, 'over 20 MB in all: the rest are left out')
})

// Phase 1 keeps running on new mail (2026-09-30): each Gmail scan (every 15 minutes) hands what came in to
// the shadow reader, in the background — so there's a real history to review in phase 2. Still shows nothing.
test('each Gmail scan hands new mail to the shadow reader, in the background, with its key', async () => {
  const fs = await import('node:fs')
  const scan = fs.readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')
  assert.match(scan, /functions\/v1\/email-reader/)
  assert.match(scan, /'x-casa-email-reader': readerKey/)
  assert.match(scan, /EdgeRuntime\?\.waitUntil/)
})

// The backlog's email items (Oct 1 bugs): Kim K.'s "REMINDER: Pink Shirt & Packed Lunch Tomorrow!" came back as the
// Field Trip's new place and end time — the pink shirt and the lunch, the point of it, were dropped ("details" had no
// room for them); and the first field-trip email made a separate "Pack Lunch for Field Trip" event. What to wear or
// bring rides on its event ("bring") and lands on its get & pack; never an event of its own.
test('what to wear or bring rides on its event; a prep offer beside its event folds into it', async () => {
  const { readReaderDecision } = await import('../supabase/functions/_shared/email-reader.mjs')
  const kim = readReaderDecision({ decision: 'details', reason: 'r', offers: [
    { kind: 'event', title: 'Field Trip: Peter and the Wolf', date: '2026-10-01', event_id: 'ft', changes: { end: '12:00' }, bring: ['Pink shirt', 'Packed lunch'] },
  ] })
  assert.deepEqual(kim.offers[0].bring, ['Pink shirt', 'Packed lunch'])
  const first = readReaderDecision({ decision: 'offer', reason: 'r', offers: [
    { kind: 'event', title: 'Field Trip: Peter and the Wolf', date: '2026-10-01', start: '09:30' },
    { kind: 'event', title: 'Pack Lunch for Field Trip', date: '2026-10-01' },
    { kind: 'reminder', title: 'Wear a pink shirt', date: '2026-10-01' },
    { kind: 'todo', title: 'Sign the permission slip' },
  ] })
  assert.deepEqual(first.offers.map((o) => o.title), ['Field Trip: Peter and the Wolf', 'Sign the permission slip'])
  assert.deepEqual(first.offers[0].bring, ['Pack lunch', 'Wear a pink shirt'])
  // Nothing to fold into (no event that day in the email): it stays what it is.
  const alone = readReaderDecision({ decision: 'offer', reason: 'r', offers: [{ kind: 'reminder', title: 'Wear a pink shirt', date: '2026-10-01' }] })
  assert.deepEqual(alone.offers.map((o) => o.title), ['Wear a pink shirt'])
})

test('the reader is told what to wear or bring goes on its event, never an event of its own', async () => {
  const { buildReaderPrompt } = await import('../supabase/functions/_shared/email-reader.mjs')
  const p = buildReaderPrompt({ email: { from_email: 'k@x', subject: 's', body: 'b', received_at: '2026-09-30T22:00:00Z' }, family: [], upcoming: [], today: '2026-09-30' })
  assert.match(p, /"bring"/)
  assert.match(p, /never (an event|its own event)/i)
  assert.match(p, /a reminder for something already on the calendar with nothing new/i)
  assert.match(p, /what to wear or bring[^.]*is new/i)
})

// Oct 5: "TOMORROW! HPSPNA Meeting Reminder" was read and passed over ("Optional neighborhood meeting invitation sent to
// all residents"), though the family had been to the association's September meeting. The reader now sees what the
// family has gone to in the last six months; a group they're part of is offered even when it writes to everyone.
import { pastTitles } from '../supabase/functions/_shared/email-reader.mjs'
test('what the family has gone to: one of each, newest first, no school runs or travel legs', () => {
  const ev = (title, d) => ({ title, start_time: `2026-${d}T12:00:00Z` })
  assert.deepEqual(pastTitles([ev('Neighborhood Association Meeting', '09-14'), ev('Drop off Liv @ Bak', '09-20'), ev('Softball', '09-01'), ev('softball', '09-25'), ev('Flight 1419 PBI→DFW', '09-10')]), ['softball', 'Neighborhood Association Meeting'])
})
test('a group the family is part of counts, even when it writes to everyone', () => {
  const prompt = buildReaderPrompt({ email: { from: 'HPSPNA', subject: 'TOMORROW! HPSPNA Meeting Reminder', body: 'meeting', received_at: '2026-10-05' }, past: ['Neighborhood Association Meeting'], today: '2026-10-05' })
  assert.match(prompt, /WHAT THE FAMILY HAS GONE TO \(the last six months — the groups they're part of\):\n- Neighborhood Association Meeting/)
  assert.match(prompt, /unless it's from a group the family is part of/)
})
