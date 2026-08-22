import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectSuggestedActionBundle,
  extractSmartActionTitle,
  synthesizeActionAnalysis,
} from '../src/utils/actionInspectionSynthesis.ts'
import { extractGmailMessageContent } from '../supabase/functions/_shared/gmail-message-content.mjs'

test('extractGmailMessageContent parses attachment metadata and plain text body', () => {
  const mockPayload = {
    mimeType: 'multipart/mixed',
    parts: [
      {
        mimeType: 'text/plain',
        body: { data: btoa('Please review the attached Fall-Winter testing letter for grades 3-5.') },
      },
      {
        filename: '3rd-5th_Testing_Letter_2026.pdf',
        mimeType: 'application/pdf',
        body: { size: 245120, attachmentId: 'att_12345' },
      },
    ],
  }

  const result = extractGmailMessageContent(mockPayload)
  assert.equal(result.format, 'plain')
  assert.match(result.text, /Fall-Winter testing letter/)
  assert.equal(result.attachments.length, 1)
  assert.equal(result.attachments[0].filename, '3rd-5th_Testing_Letter_2026.pdf')
  assert.equal(result.attachments[0].mimeType, 'application/pdf')
  assert.equal(result.attachments[0].size, 245120)
  assert.equal(result.attachments[0].attachmentId, 'att_12345')
})

test('detectSuggestedActionBundle decomposes Fall-Winter Testing Parent Letter into multi-event and multi-reminder bundle', () => {
  const item = {
    id: 'test-prep-item-1',
    event_title: 'Review the attached letter regarding Fall-Winter testing for 3rd-5th grades.',
    description: '3rd-5th Grades Fall-Winter Testing Parent Letter from Lynita Butler at Palm Beach Schools. FAST Reading, FAST Math, and Science assessments scheduled.',
    due_by: '2026-09-15T08:30:00-04:00',
    source_type: 'gmail',
    source_ref: 'gmail:user-1:msg-1',
  }

  const bundle = detectSuggestedActionBundle(item)
  assert.ok(bundle, 'Should detect a suggested action bundle for testing letter')
  assert.ok(bundle.actions.length >= 3, 'Should have multiple discrete actions in bundle')

  // Check for discrete events
  const events = bundle.actions.filter((a) => a.type === 'event')
  assert.ok(events.length >= 2, 'Should extract at least 2 testing events (e.g. FAST Reading and FAST Math)')
  
  // Check for prep reminders
  const reminders = bundle.actions.filter((a) => a.type === 'reminder')
  assert.ok(reminders.length >= 1, 'Should extract prep reminders (e.g. Chromebook charging or headphones)')

  // Check that events have dates and titles
  events.forEach((evt) => {
    assert.ok(evt.title, 'Event must have a title')
    assert.ok(evt.date, 'Event must have a date')
    assert.ok(evt.displayDate, 'Event must have a display date')
  })
})

test('synthesizeActionAnalysis extracts documents and actionable attachments for sidecar inspection', () => {
  const item = {
    id: 'test-prep-item-2',
    event_title: 'Review the attached letter regarding Fall-Winter testing for 3rd-5th grades.',
    description: 'Review the attached letter regarding Fall-Winter testing for 3rd-5th grades.',
    due_by: '2026-09-15T08:30:00-04:00',
    source_type: 'gmail',
    source_ref: 'gmail:user-1:msg-1',
  }

  const details = {
    ...item,
    relatedItems: [],
    gmailContext: {
      subject: '3rd-5th Grades Fall-Winter Testing Parent Letter',
      from_email: 'lbutler@palmbeachschools.org',
      received_at: '2026-08-21T18:00:00Z',
      email_body: 'Dear Parents, Please review the attached parent letter detailing the Fall-Winter testing windows for grades 3 through 5. FAST ELA Reading: Sept 15-16, FAST Math: Sept 22-23, Science Diagnostic: Oct 2. Ensure students bring fully charged Chromebooks and wired headphones. No smartwatches permitted in testing rooms.',
      attachments: [
        {
          filename: 'Fall_Winter_Testing_Parent_Letter_2026.pdf',
          mimeType: 'application/pdf',
          size: 345000,
          pages: 2,
        },
      ],
    },
    eventSnapshot: null,
    suggestedAssignees: [],
  }

  const analysis = synthesizeActionAnalysis(item, details)
  assert.ok(analysis.documents.length >= 1, 'Should extract the attached PDF document')
  assert.equal(analysis.documents[0].type, 'document')
  assert.match(analysis.documents[0].title, /Testing|Letter|pdf/i)
  assert.ok(analysis.suggestedActionBundle, 'Should provide a decomposed suggested action bundle')
  assert.ok(analysis.extractedDocumentPreview, 'Should provide extracted document preview with key excerpts')
})
