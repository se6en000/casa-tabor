import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  formatEmailKnowledgeRead,
  isEmailKnowledgeReadRequest,
  relevantEmailKnowledgeClaims,
} from '../supabase/functions/_shared/assistant-email-knowledge-read.mjs'

const assistant = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const briefing = readFileSync(new URL('../supabase/functions/generate-briefing/index.ts', import.meta.url), 'utf8')

test('assistant loads bounded active, non-sensitive email knowledge only for related queries', () => {
  assert.match(assistant, /needsEmailKnowledgeContext/)
  assert.match(assistant, /from\('family_knowledge_claims'\)/)
  assert.match(assistant, /\.eq\('status', 'active'\)/)
  assert.match(assistant, /\.eq\('privacy_class', 'standard'\)/)
  assert.match(assistant, /\.limit\(50\)/)
  assert.match(assistant, /relevantEmailKnowledgeClaims\(emailKnowledgeClaims \?\? \[\], latestUserText\)\.slice\(0, 6\)/)
  assert.match(assistant, /EMAIL-DERIVED FAMILY KNOWLEDGE/)
})

test('daily briefing includes only required active email commitments that are still current', () => {
  assert.match(briefing, /from\('family_knowledge_claims'\)/)
  assert.match(briefing, /\.eq\('requiredness', 'required'\)/)
  assert.match(briefing, /\.eq\('privacy_class', 'standard'\)/)
  assert.match(briefing, /EMAIL COMMITMENTS/)
})

test('school knowledge questions use the deterministic email-knowledge read lane', () => {
  assert.equal(isEmailKnowledgeReadRequest('What school paperwork do we need before Monday?'), true)
  assert.equal(isEmailKnowledgeReadRequest('Schedule a school meeting'), false)
  const claims = [{
    title: 'Strings paperwork',
    summary: 'Return the Strings forms.',
    expires_at: '2026-08-14T04:00:00Z',
    canonical_inbox_emails: { from_email: 'teacher@palmbeachschools.org', subject: 'Strings' },
  }, {
    title: 'Pizza delivery',
    summary: 'Sign for the delivery.',
    expires_at: '2026-08-07T23:00:00Z',
    canonical_inbox_emails: { from_email: 'orders@example.com', subject: 'Delivery' },
  }]
  const relevant = relevantEmailKnowledgeClaims(claims, 'What school paperwork do we need?')
  assert.deepEqual(relevant, [claims[0]])
  assert.match(formatEmailKnowledgeRead(relevant), /Return the Strings forms\. Due Aug 14\./)
  assert.match(assistant, /emailKnowledgeReadRequest/)
  assert.match(assistant, /family_knowledge_claims/)
})
