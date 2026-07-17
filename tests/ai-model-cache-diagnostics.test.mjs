import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const settings = readFileSync(new URL('../src/pages/AISettingsPage.tsx', import.meta.url), 'utf8')
const dashboard = readFileSync(new URL('../src/pages/StatusDashboardPage.tsx', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const shadow = readFileSync(new URL('../supabase/functions/ai-agent-shadow/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260717000000_add_provider_cache_tokens.sql', import.meta.url), 'utf8')

const conversationalModels = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-pro-latest',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview-customtools',
  'gemini-3.5-flash',
]

test('Gemini conversational catalog stays selectable across authoritative and shadow assistants', () => {
  for (const model of conversationalModels) {
    assert.match(settings, new RegExp(`id: '${model.replaceAll('.', '\\.')}'`))
    assert.match(assistant, new RegExp(`'${model.replaceAll('.', '\\.')}'`))
    assert.match(shadow, new RegExp(`'${model.replaceAll('.', '\\.')}'`))
  }
  assert.doesNotMatch(settings, /id: 'gemini-[^']*(?:image|tts|robotics|computer-use)/)
})

test('Gemini prompt-cache tokens are recorded separately from application dedup', () => {
  assert.match(assistant, /cachedContentTokenCount/)
  assert.match(assistant, /cached_input_tokens: llmTelemetry\.cached_input_tokens/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS cached_input_tokens/)
  assert.match(dashboard, /Gemini prompt tokens reused/)
  assert.match(dashboard, /Application calls deduplicated/)
  assert.doesNotMatch(dashboard, /Cache hits are free/)
})
