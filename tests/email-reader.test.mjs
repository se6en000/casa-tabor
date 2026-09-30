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
  // Never dropped on the way in: school, a real person, an appointment, anything with a date to act on.
  assert.equal(skip('Rosangela Paine <rosangela.paine@palmbeachschools.org>', 'K updates- Permission S.- 9.28.26'), null)
  assert.equal(skip('Katherine Cooper <kcooper@gmail.com>', 'Fwd: 2026 Strings Festival'), null)
  assert.equal(skip('EDS Air Conditioning <noreply@eds.com>', 'Reminder: Your appointment with EDS Air Conditioning is tomorrow!'), null)
  assert.equal(skip('SchoolCash Online <noreply@schoolcashonline.com>', 'SchoolCash Online: Item payment reminder'), null, 'a school payment due is his to decide')
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
  assert.match(prompt, /slip\.pdf/)
  assert.match(prompt, /Please sign the permission slip by Friday\./)
})

test('the decision is read strictly: one of five outcomes, offers only with what they need', () => {
  assert.deepEqual(readReaderDecision({ decision: 'offer', reason: 'Permission slip due Friday', quote: 'sign by Friday', offers: [{ kind: 'reminder', title: 'Sign Owen’s permission slip', date: '2026-10-01' }, { kind: 'event' }] }),
    { decision: 'offer', reason: 'Permission slip due Friday', quote: 'sign by Friday', offers: [{ kind: 'reminder', title: 'Sign Owen’s permission slip', date: '2026-10-01' }], person: null })
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
