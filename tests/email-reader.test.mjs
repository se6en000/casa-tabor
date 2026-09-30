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
  assert.match(prompt, /An optional event or sale sent to everyone .* is not an offer; something a child.s school day needs/)
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
