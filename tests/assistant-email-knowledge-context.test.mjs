import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  formatFamilyKnowledgeContext,
} from '../supabase/functions/_shared/assistant-email-knowledge-read.mjs'

const assistant = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const briefing = readFileSync(new URL('../supabase/functions/generate-briefing/index.ts', import.meta.url), 'utf8')

test('assistant loads bounded active, non-sensitive family knowledge for conversational reasoning', () => {
  assert.match(assistant, /from\('family_knowledge_claims'\)/)
  assert.match(assistant, /\.eq\('status', 'active'\)/)
  assert.match(assistant, /\.eq\('privacy_class', 'standard'\)/)
  assert.match(assistant, /\.limit\(50\)/)
  assert.match(assistant, /FAMILY DATA CONTEXT/)
  assert.match(assistant, /formatFamilyKnowledgeContext\(emailKnowledgeResult\.data \?\? \[\]\)/)
  assert.doesNotMatch(assistant, /isEmailKnowledgeReadRequest/)
  assert.doesNotMatch(assistant, /formatEmailKnowledgeRead/)
})

test('daily briefing includes only required active email commitments that are still current', () => {
  assert.match(briefing, /from\('family_knowledge_claims'\)/)
  assert.match(briefing, /\.eq\('requiredness', 'required'\)/)
  assert.match(briefing, /\.eq\('privacy_class', 'standard'\)/)
  assert.match(briefing, /EMAIL COMMITMENTS/)
})

test('family knowledge context preserves every bounded source-backed claim for conversational reasoning', () => {
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
  const context = formatFamilyKnowledgeContext(claims)
  assert.match(context, /Strings paperwork/)
  assert.match(context, /Pizza delivery/)
  assert.match(context, /Return the Strings forms/)
  assert.match(context, /Source: teacher@palmbeachschools\.org/)
})
