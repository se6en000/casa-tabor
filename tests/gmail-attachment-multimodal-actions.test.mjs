import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  detectSuggestedActionBundle,
  synthesizeActionAnalysis,
} from '../src/utils/actionInspectionSynthesis.ts'

const scanGmailFunction = readFileSync(
  new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url),
  'utf8',
)
const sidecar = readFileSync(
  new URL('../src/components/canvas/widgets/ActionInspectionSidecar.tsx', import.meta.url),
  'utf8',
)
const migration = readFileSync(
  new URL('../supabase/migrations/20260822080000_gmail_attachments_and_document_summaries.sql', import.meta.url),
  'utf8',
)

test('Database migration defines attachments JSONB and extracted_document_summary', () => {
  assert.match(migration, /attachments JSONB DEFAULT '\[\]'::jsonb/)
  assert.match(migration, /extracted_document_summary TEXT/)
  assert.match(migration, /source_origin TEXT DEFAULT 'email_body'/)
})

test('scan-gmail-inbox includes Gmail attachment fetcher and Gemini multimodal extraction', () => {
  assert.match(scanGmailFunction, /fetchGmailAttachment/)
  assert.match(scanGmailFunction, /extractAttachmentDirectives/)
  assert.match(scanGmailFunction, /gemini-2.5-flash/)
  assert.match(scanGmailFunction, /inlineData/)
  assert.match(scanGmailFunction, /extractedDocumentSummary/)
})

test('ActionInspectionSidecar renders sourceOrigin badges and passes siblingItems', () => {
  assert.match(sidecar, /synthesizeActionAnalysis\(activeItem, detailedItem, siblingItems\)/)
  assert.match(sidecar, /act\.sourceOrigin === 'attachment'/)
  assert.match(sidecar, /From Attachment/)
})

test('detectSuggestedActionBundle combines sibling items from email body and attachment into a compound plan', () => {
  const primaryItem = {
    id: 'item-parent-waiver',
    event_id: null,
    type: 'forms',
    emoji: '📝',
    description: 'Submit signed Lake Alpine Science Camp medical waiver & packing list',
    event_title: 'Science Camp Waiver',
    event_date: '2026-08-16',
    due_by: '2026-08-16T19:00:00Z',
    priority: 1,
    dismissed: false,
    dismissed_at: null,
    created_at: '2026-08-10T12:00:00Z',
    source_origin: 'email_body',
    cluster_id: 'cluster-science-camp',
  }

  const siblingItem1 = {
    id: 'item-camp-departure',
    event_id: null,
    type: 'event',
    emoji: '🚌',
    description: '5th Grade Science Camp Departure at Bus Bay',
    event_title: 'Science Camp Departure',
    event_date: '2026-08-17',
    due_by: '2026-08-17T07:30:00Z',
    priority: 1,
    dismissed: false,
    dismissed_at: null,
    created_at: '2026-08-10T12:00:00Z',
    source_origin: 'attachment',
    cluster_id: 'cluster-science-camp',
  }

  const bundle = detectSuggestedActionBundle(primaryItem, null, [siblingItem1])
  assert.ok(bundle)
  assert.equal(bundle.actions.length, 2)
  assert.equal(bundle.actions[0].sourceOrigin, 'email_body')
  assert.equal(bundle.actions[1].sourceOrigin, 'attachment')
  assert.equal(bundle.actions[0].badgeLabel, 'FORM / WAIVER')
  assert.equal(bundle.actions[1].badgeLabel, 'CALENDAR EVENT')
})

test('synthesizeActionAnalysis extracts document directives preview from real multimodal summary', () => {
  const item = {
    id: 'item-testing',
    event_id: null,
    type: 'general',
    emoji: '📋',
    description: 'Fall testing information and parent notice',
    event_title: 'Palm Beach Testing Notice',
    event_date: null,
    due_by: null,
    priority: 2,
    dismissed: false,
    dismissed_at: null,
    created_at: '2026-08-10T12:00:00Z',
  }

  const detailedItem = {
    ...item,
    relatedItems: [],
    eventSnapshot: null,
    suggestedAssignees: [],
    gmailContext: {
      subject: 'Important: 2026 Fall Testing Directives',
      from_email: 'principal@palmbeachschools.org',
      received_at: '2026-08-10T14:00:00Z',
      email_body: 'Please see attached testing letter for Liv.',
      attachments: [{ filename: 'Testing_Schedule.pdf', mimeType: 'application/pdf', size: 102400 }],
      extracted_document_summary: `- Key Dates & Times: Sept 15-16 ELA Assessment (8:30 AM)
- Required Forms: Digital Parent Acknowledgement
- Important Rules: No cellular devices or smartwatches allowed in testing rooms`,
    },
  }

  const analysis = synthesizeActionAnalysis(item, detailedItem)
  assert.ok(analysis.extractedDocumentPreview)
  assert.ok(analysis.extractedDocumentPreview.keyPoints.length >= 3)
  assert.match(analysis.extractedDocumentPreview.keyPoints[0], /Sept 15-16/)
})
