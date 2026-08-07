import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const briefing = readFileSync(new URL('../supabase/functions/generate-briefing/index.ts', import.meta.url), 'utf8')

test('assistant loads bounded active, non-sensitive email knowledge only for related queries', () => {
  assert.match(assistant, /needsEmailKnowledgeContext/)
  assert.match(assistant, /from\('family_knowledge_claims'\)/)
  assert.match(assistant, /\.eq\('status', 'active'\)/)
  assert.match(assistant, /\.eq\('privacy_class', 'standard'\)/)
  assert.match(assistant, /\.limit\(6\)/)
  assert.match(assistant, /EMAIL-DERIVED FAMILY KNOWLEDGE/)
})

test('daily briefing includes only required active email commitments that are still current', () => {
  assert.match(briefing, /from\('family_knowledge_claims'\)/)
  assert.match(briefing, /\.eq\('requiredness', 'required'\)/)
  assert.match(briefing, /\.eq\('privacy_class', 'standard'\)/)
  assert.match(briefing, /EMAIL COMMITMENTS/)
})
