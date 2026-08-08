import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  formatFamilyKnowledgeContext,
} from '../supabase/functions/_shared/assistant-email-knowledge-read.mjs'

const assistant = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const assistantHook = readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
const assistantSession = readFileSync(new URL('../src/hooks/useAISession.ts', import.meta.url), 'utf8')
const assistantDrawer = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')
const briefing = readFileSync(new URL('../supabase/functions/generate-briefing/index.ts', import.meta.url), 'utf8')

test('assistant retrieves ranked family evidence and returns its source contract', () => {
  assert.match(assistant, /retrieveFamilyContext/)
  assert.match(assistant, /buildAssistantContextPacket/)
  assert.match(assistant, /trimConversationToTokenBudget/)
  assert.match(assistant, /FAMILY EVIDENCE PACKET/)
  assert.match(assistant, /evidence:\s*familyRetrieval\.evidence/)
  assert.match(assistant, /sources_considered:\s*familyRetrieval\.sources_considered/)
  assert.match(assistant, /partial_sources:\s*familyRetrieval\.partial_sources/)
  assert.match(assistant, /assistantContextPacket\.evidence/)
  assert.doesNotMatch(assistant, /assistantContextPacket\.items/)
  assert.doesNotMatch(assistant, /assistantContextPacket\??\.budget/)
  assert.doesNotMatch(assistant, /formatFamilyKnowledgeContext\(emailKnowledgeResult\.data \?\? \[\]\)/)
  assert.match(assistant, /Do not invent undocumented family requirements or generic advice/)
  assert.match(assistant, /could not search your family data/i)
  assert.match(assistant, /name === 'search_events' && needsUnifiedFamilyRetrieval/)
})

test('family-data questions cannot be finalized by calendar-only short-circuits', () => {
  assert.doesNotMatch(assistantHook, /tryLocalScheduleAnswer/)
  assert.doesNotMatch(assistant, /server_agent_read_adopted/)
  assert.doesNotMatch(assistant, /text:\s*semanticRead\.text/)
  assert.doesNotMatch(assistant, /text:\s*dayRead\.text/)
})

test('assistant messages preserve and render safe source evidence', () => {
  assert.match(assistantSession, /evidence\?:\s*FamilyEvidence\[\]/)
  assert.match(assistantHook, /normalizeFamilyEvidence\(data\?\.evidence\)/)
  assert.match(assistantHook, /sourcesConsidered:.*data\?\.sources_considered/)
  assert.match(assistantDrawer, /msg\.evidence/)
  assert.match(assistantDrawer, /Sources checked/)
  assert.match(assistantDrawer, /aria-expanded=\{sourcesExpanded\}/)
  assert.match(assistantDrawer, /MAX_VISIBLE_SOURCES = 3/)
  assert.match(assistantDrawer, /Show \$\{msg\.evidence\.length - MAX_VISIBLE_SOURCES\} more/)
  assert.match(assistantDrawer, /onOpenEventDetails\?\.\(evidence\.sourceId\)/)
  assert.match(assistantDrawer, /Evidence details/)
  const evidenceBlock = assistantDrawer.slice(
    assistantDrawer.indexOf('Boolean(msg.evidence?.length)'),
    assistantDrawer.indexOf('{sourcesExpanded && selectedEvidence &&'),
  )
  assert.doesNotMatch(evidenceBlock, /<Chip/)
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
