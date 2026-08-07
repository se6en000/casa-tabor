import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canonicalEmailKey,
  normalizeInternetMessageId,
} from '../supabase/functions/_shared/gmail-canonical-email.mjs'

test('uses the RFC Message-ID as the cross-inbox canonical identity', async () => {
  assert.equal(
    await canonicalEmailKey({
      messageId: ' <school-update.123@example.edu> ',
      from: 'Palm Beach Public <news@palmbeachschools.org>',
      subject: 'Back to school checklist',
      receivedAt: '2026-08-07T12:00:00-04:00',
      normalizedBody: 'Please review the checklist.',
    }),
    'rfc:school-update.123@example.edu',
  )
  assert.equal(
    normalizeInternetMessageId(' <school-update.123@example.edu> '),
    'school-update.123@example.edu',
  )
})

test('falls back to normalized sender, subject, time bucket, and body fingerprint without an RFC Message-ID', async () => {
  const first = await canonicalEmailKey({
    messageId: null,
    from: 'Palm Beach Public <news@palmbeachschools.org>',
    subject: '  Back-to-School   Checklist ',
    receivedAt: '2026-08-07T12:04:00-04:00',
    normalizedBody: 'Please review the checklist before Monday.',
  })
  const duplicateCopy = await canonicalEmailKey({
    messageId: '',
    from: 'news@palmbeachschools.org',
    subject: 'Back to School Checklist',
    receivedAt: '2026-08-07T12:09:00-04:00',
    normalizedBody: 'Please review the checklist before Monday.',
  })

  assert.equal(first, duplicateCopy)
  assert.match(first, /^fallback:[a-f0-9]{64}$/)
})

test('does not merge distinct fallback messages merely because they share a sender and subject', async () => {
  const base = {
    messageId: null,
    from: 'news@palmbeachschools.org',
    subject: 'School update',
    receivedAt: '2026-08-07T12:04:00-04:00',
  }
  assert.notEqual(
    await canonicalEmailKey({ ...base, normalizedBody: 'Forms are due Friday.' }),
    await canonicalEmailKey({ ...base, normalizedBody: 'Forms are due next Friday.' }),
  )
})
