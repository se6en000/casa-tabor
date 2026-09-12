import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractGmailMessageContent,
  stripQuotedReplyHistory,
} from '../supabase/functions/_shared/gmail-message-content.mjs'

function base64Url(value) {
  return Buffer.from(value).toString('base64url')
}

test('converts sanitized HTML to Markdown when no plain-text MIME part is present', () => {
  const content = extractGmailMessageContent({
    mimeType: 'multipart/alternative',
    parts: [{
      mimeType: 'text/html',
      body: {
        data: base64Url('<h1>SchoolCash</h1><p>Fees are <strong>available</strong> for purchase.</p>'),
      },
    }],
  })

  assert.equal(content.text, '# SchoolCash\n\nFees are **available** for purchase.')
  assert.equal(content.format, 'html')
})

test('never glues adjacent inline runs together when stripping non-block tags (live bug, 2026-09-12)', () => {
  // Real-world shape: a bold lead-in immediately followed by a paragraph,
  // with no whitespace in the source HTML between the closing and opening
  // tags. The old converter only inserted whitespace for a fixed tag list
  // (p/div/tr/li/br/h1-6) and deleted everything else outright, so this
  // rendered as "MessagePlease see the attached..." -- words glommed
  // together with no space at all.
  const content = extractGmailMessageContent({
    mimeType: 'multipart/alternative',
    parts: [{
      mimeType: 'text/html',
      body: {
        data: base64Url(
          '<span><strong>Message</strong></span><p>Please see the attached documents.</p>' +
          '<span>Ms. Schwab</span><span>Principal</span>'
        ),
      },
    }],
  })

  assert.doesNotMatch(content.text, /MessagePlease|SchwabPrincipal/)
  assert.equal(content.text, '**Message**\n\nPlease see the attached documents.\n\nMs. Schwab Principal')
})

test('converts a link to Markdown syntax', () => {
  const content = extractGmailMessageContent({
    mimeType: 'multipart/alternative',
    parts: [{
      mimeType: 'text/html',
      body: {
        data: base64Url('<p>Please <a href="https://example.com/pay">pay your balance</a> today.</p>'),
      },
    }],
  })

  assert.equal(content.text, 'Please [pay your balance](https://example.com/pay) today.')
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
