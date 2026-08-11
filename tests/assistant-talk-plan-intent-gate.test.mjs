import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const hook = readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')

test('Talk and Plan returns a mode-intent card before deterministic writes', () => {
  assert.match(server, /decision === 'confirm_intent'[\s\S]{0,300}tool: 'confirm_talk_plan_action_intent'/)
  assert.match(server, /talk_plan_intent_resolution === 'confirmed_action'/)
  assert.match(server, /talk_plan_intent_resolution === 'conversation_only'/)
})

test('intent-card denial automatically replays the original request conversationally', () => {
  assert.match(drawer, /tool === 'confirm_talk_plan_action_intent'[\s\S]{0,700}talkPlanIntentResolution: 'conversation_only'/)
  assert.match(hook, /replayExistingUserMessage\?: boolean/)
  assert.match(hook, /talk_plan_intent_resolution: options\.talkPlanIntentResolution/)
})

test('intent-card confirmation prepares the existing detailed action flow instead of executing directly', () => {
  assert.match(drawer, /tool === 'confirm_talk_plan_action_intent'[\s\S]{0,300}talkPlanIntentResolution: 'confirmed_action'/)
  assert.match(drawer, /Yes, prepare it/)
  assert.match(drawer, /No, answer conversationally/)
})
