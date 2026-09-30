import test from 'node:test'
import assert from 'node:assert/strict'
import { offerLines, headline, whoAndWhen, showSkippedToday } from '../src/wall/emailReview.ts'

// Casa reads the email, phase 2 (canvas row 14, approved by Jake 2026-09-30).
const slip = { id: 'a', from: 'Rosangela Paine', subject: 'K updates', received_at: '2026-09-28T13:00:00Z', open: 'x', decision: 'offer', reason: 'Owen’s class needs permission slips signed.', quote: 'Please check…', offers: [{ kind: 'todo', title: 'Sign Owen’s permission slips' }], person: null }

test('the card: why it matters, then what Casa would add', () => {
  assert.equal(headline(slip), 'Owen’s class needs permission slips signed.')
  assert.deepEqual(offerLines(slip), [{ label: 'TO-DO', text: 'Sign Owen’s permission slips', when: null }])
  const fee = { ...slip, offers: [{ kind: 'reminder', title: 'Pay $15 for Liv’s debate tournament', date: '2026-10-02', start: '09:00' }] }
  assert.deepEqual(offerLines(fee), [{ label: 'REMINDER', text: 'Pay $15 for Liv’s debate tournament', when: 'Fri, Oct 2 · 9 AM' }])
  const festival = { ...slip, decision: 'details', offers: [{ kind: 'event', title: '2026 Strings Festival', date: '2026-10-24' }] }
  assert.equal(offerLines(festival)[0].label, 'UPDATE')
  const therapist = { ...slip, decision: 'person', offers: [], person: { who: 'Towhid Nishat', wants: 'Feedback on Owen’s progress' } }
  assert.equal(headline(therapist), 'Towhid Nishat: Feedback on Owen’s progress')
  assert.deepEqual(offerLines(therapist), [{ label: 'REPLY', text: 'Reply to Towhid Nishat', when: null }])
})

test('who and when, and "a few I skipped" once a day', () => {
  assert.equal(whoAndWhen({ from: 'Rosangela Paine', received_at: '2026-09-28T17:00:00Z' }), 'Mon, Sep 28 · Rosangela Paine')
  assert.equal(showSkippedToday(null, '2026-09-30', [{ id: 's' }]), true)
  assert.equal(showSkippedToday('2026-09-30', '2026-09-30', [{ id: 's' }]), false)
  assert.equal(showSkippedToday(null, '2026-09-30', []), false)
})

// Keep me posted (canvas 15b, approved 2026-09-30): a kept sender's emails, a line each, after the offers.
test('the posted lines: one sender is named in the header; her emails open as a Gmail search', async () => {
  const { postedHeader, herEmails, lineDay } = await import('../src/wall/emailReview.ts')
  const line = (kept_by, sender) => ({ id: kept_by, kept_by, sender, from: kept_by, subject: null, received_at: '2026-09-28T14:00:00Z', open: 'x', gist: 'g', tag: null, can_add: false, decision: 'none', reason: null, quote: null, offers: [], person: null })
  assert.equal(postedHeader([line('Sally Rozanski', 's@x.org'), line('Sally Rozanski', 's@x.org'), line('Sally Rozanski', 's@x.org')]), 'KEEP ME POSTED · SALLY ROZANSKI · 3 THIS WEEK')
  assert.equal(postedHeader([line('Sally Rozanski', 's@x.org'), line('Owen’s therapy', 't@x.org')]), 'KEEP ME POSTED · 2 THIS WEEK')
  assert.equal(postedHeader([line('Sally Rozanski', 's@x.org')]), 'KEEP ME POSTED · SALLY ROZANSKI · 1 THIS WEEK')
  assert.equal(herEmails([line('Sally Rozanski', 'sally.rozanski@palmbeachschools.org')]), 'https://mail.google.com/mail/#search/from%3Asally.rozanski%40palmbeachschools.org')
  assert.equal(herEmails([line('a', 'a@x.org'), line('b', 'b@x.org')]), null)
  assert.equal(lineDay('2026-09-28T14:00:00Z'), 'Mon')
})
