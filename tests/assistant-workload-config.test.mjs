import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  normalizeAssistantExperienceMode,
} from '../supabase/functions/_shared/assistant-experience-mode.mjs'
import {
  normalizeLlmWorkloadConfig,
  resolveLlmWorkload,
} from '../supabase/functions/_shared/llm-workload-config.mjs'
import {
  buildGeminiGenerationConfig,
} from '../supabase/functions/_shared/gemini-generation-config.mjs'
import {
  resolveTalkPlanIntentGate,
} from '../supabase/functions/_shared/talk-plan-intent-gate.mjs'

const assistantSource = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

test('assistant experience mode defaults invalid and missing values to do', () => {
  assert.equal(normalizeAssistantExperienceMode('talk_plan'), 'talk_plan')
  assert.equal(normalizeAssistantExperienceMode('do'), 'do')
  assert.equal(normalizeAssistantExperienceMode('plan'), 'do')
  assert.equal(normalizeAssistantExperienceMode(null), 'do')
})

test('legacy llm config receives independent safe workload defaults', () => {
  assert.deepEqual(
    normalizeLlmWorkloadConfig({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      background_model: 'gemini-2.5-flash-lite',
      api_key: 'test-key',
    }),
    {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      background_model: 'gemini-2.5-flash-lite',
      talk_plan_model: 'gemini-2.5-flash',
      do_reasoning_preset: 'balanced',
      talk_plan_reasoning_preset: 'deep',
      background_reasoning_preset: 'fast',
      api_key: 'test-key',
    },
  )
})

test('each workload resolves its own model and preset', () => {
  const config = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    background_model: 'gemini-2.5-flash-lite',
    talk_plan_model: 'gemini-3.6-flash',
    do_reasoning_preset: 'fast',
    talk_plan_reasoning_preset: 'deep',
    background_reasoning_preset: 'balanced',
  }

  assert.deepEqual(resolveLlmWorkload(config, 'do'), {
    workload: 'do',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    preset: 'fast',
    apiFamily: 'generateContent',
    thinking: { kind: 'budget', value: 0 },
  })
  assert.deepEqual(resolveLlmWorkload(config, 'talk_plan'), {
    workload: 'talk_plan',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    preset: 'deep',
    apiFamily: 'generateContent',
    thinking: { kind: 'level', value: 'high' },
  })

  assert.deepEqual(resolveLlmWorkload(config, 'background'), {
    workload: 'background',
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    preset: 'balanced',
    apiFamily: 'generateContent',
    thinking: { kind: 'budget', value: 256 },
  })
})

test('Gemini 3.6 uses thinking level without deprecated sampling controls', () => {
  const generationConfig = buildGeminiGenerationConfig({
    model: 'gemini-3.6-flash',
    maxOutputTokens: 1536,
    thinking: { kind: 'level', value: 'high' },
  })

  assert.deepEqual(generationConfig, {
    max_output_tokens: 1536,
    thinking_config: { thinking_level: 'high' },
  })
  assert.equal('temperature' in generationConfig, false)
  assert.equal('top_p' in generationConfig, false)
  assert.equal('top_k' in generationConfig, false)
})

test('Gemini 2.5 retains bounded thinking-budget request semantics', () => {
  assert.deepEqual(
    buildGeminiGenerationConfig({
      model: 'gemini-2.5-flash',
      maxOutputTokens: 768,
      temperature: 0.4,
      thinking: { kind: 'budget', value: 0 },
    }),
    {
      temperature: 0.4,
      max_output_tokens: 768,
      thinking_config: { thinking_budget: 0 },
    },
  )
})

test('unsupported models and presets fail explicitly instead of silently falling back', () => {
  assert.throws(
    () => resolveLlmWorkload({
      provider: 'gemini',
      talk_plan_model: 'gemini-3.5-pro',
      talk_plan_reasoning_preset: 'deep',
    }, 'talk_plan'),
    /Unsupported Gemini model/,
  )
  assert.throws(
    () => resolveLlmWorkload({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      do_reasoning_preset: 'maximum',
    }, 'do'),
    /Unsupported reasoning preset/,
  )
})

test('Talk and Plan requires an intent confirmation before deterministic writes', () => {
  assert.deepEqual(resolveTalkPlanIntentGate('Create an event Friday at 7', null), {
    decision: 'confirm_intent',
    actionKind: 'event',
  })
  assert.deepEqual(resolveTalkPlanIntentGate('Add milk to the grocery list', null), {
    decision: 'confirm_intent',
    actionKind: 'grocery action',
  })
  assert.deepEqual(resolveTalkPlanIntentGate('Create an event Friday at 7', 'confirmed_action'), {
    decision: 'run_action',
    actionKind: 'event',
  })
  assert.deepEqual(resolveTalkPlanIntentGate('Create an event Friday at 7', 'conversation_only'), {
    decision: 'answer_conversationally',
    actionKind: 'event',
  })
  assert.deepEqual(resolveTalkPlanIntentGate('Help me plan Friday night', null), {
    decision: 'answer_conversationally',
    actionKind: null,
  })
})
