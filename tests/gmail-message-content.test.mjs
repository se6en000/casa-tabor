import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractGmailMessageContent,
  stripQuotedReplyHistory,
} from '../supabase/functions/_shared/gmail-message-content.mjs'

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

test('uses sanitized HTML when no plain-text MIME part is present', () => {
  const content = extractGmailMessageContent({
    mimeType: 'multipart/alternative',
    parts: [{
      mimeType: 'text/html',
      body: {
        data: base64Url('<h1>SchoolCash</h1><p>Fees are <strong>available</strong> for purchase.</p>'),
      },
    }],
  })

  assert.equal(content.text, 'SchoolCash\nFees are available for purchase.')
  assert.equal(content.format, 'html')
})

test('prefers plain text over an equivalent HTML MIME part', () => {
  const content = extractGmailMessageContent({
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/html', body: { data: base64Url('<p>HTML version</p>') } },
      { mimeType: 'text/plain', body: { data: base64Url('Plain-text version') } },
    ],
  })

  assert.equal(content.text, 'Plain-text version')
  assert.equal(content.format, 'plain')
})

test('collects attachment metadata without exposing attachment content', () => {
  const content = extractGmailMessageContent({
    mimeType: 'multipart/mixed',
    parts: [{
      mimeType: 'application/pdf',
      filename: 'Back-to-school.pdf',
      body: { attachmentId: 'attachment-id', size: 18273 },
    }],
  })

  assert.deepEqual(content.attachments, [{
    filename: 'Back-to-school.pdf',
    mimeType: 'application/pdf',
    size: 18273,
    attachmentId: 'attachment-id',
  }])
})

test('removes quoted reply history before extraction uses a thread reply as evidence', () => {
  assert.equal(
    stripQuotedReplyHistory(`See you tomorrow at 4pm.

On Monday, Aug 3, 2026 at 9:55 AM McCranels wrote:
> Can you bring them in tomorrow?`),
    'See you tomorrow at 4pm.',
  )
})
