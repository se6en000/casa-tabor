import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAssistantContextPacket,
  contextBudgetForTurn,
  estimateContextTokens,
  trimConversationToTokenBudget,
} from '../supabase/functions/_shared/assistant-context-budget.mjs'

test('assistant context budgets scale by effect without using the provider maximum', () => {
  assert.deepEqual(contextBudgetForTurn('simple_action'), {
    tier: 'simple_action',
    maxInputTokens: 4000,
  })
  assert.equal(contextBudgetForTurn('family_read').maxInputTokens, 12000)
  assert.equal(contextBudgetForTurn('complex_family_read').maxInputTokens, 24000)
  assert.equal(contextBudgetForTurn('exceptional', { allowExceptional: true }).maxInputTokens, 32000)
  assert.equal(contextBudgetForTurn('exceptional').maxInputTokens, 24000)
})

test('context packet always preserves the request, safety policy, and authoritative state', () => {
  const packet = buildAssistantContextPacket({
    turnType: 'simple_action',
    request: 'Create an appointment at 4 to see my doctor.',
    stablePolicy: 'Use deterministic executors.',
    safetyPolicy: 'Never claim a write succeeded until verified.',
    authoritativeState: { activeEventId: 'event-1', pendingAction: null },
    conversationSummary: 'We were discussing Owen.',
    tools: Array.from({ length: 20 }, (_, index) => ({ name: `tool-${index}`, description: 'x'.repeat(800) })),
    evidence: Array.from({ length: 20 }, (_, index) => ({
      evidence_id: `evidence-${index}`,
      source_type: 'email',
      excerpt: 'x'.repeat(1200),
      score: 1 - index * 0.01,
    })),
  })

  assert.equal(packet.request, 'Create an appointment at 4 to see my doctor.')
  assert.match(packet.safetyPolicy, /Never claim/)
  assert.equal(packet.authoritativeState.activeEventId, 'event-1')
  assert.ok(packet.estimatedInputTokens <= packet.maxInputTokens)
  assert.ok(packet.droppedEvidenceIds.length > 0)
})

test('required prior evidence and contradiction groups survive evidence compression', () => {
  const evidence = [
    {
      evidence_id: 'school-old',
      source_type: 'email',
      excerpt: 'Old pickup time',
      score: 0.7,
      metadata: { contradiction_group: 'pickup-time' },
    },
    {
      evidence_id: 'school-new',
      source_type: 'email',
      excerpt: 'New pickup time',
      score: 0.9,
      metadata: { contradiction_group: 'pickup-time' },
    },
    ...Array.from({ length: 30 }, (_, index) => ({
      evidence_id: `noise-${index}`,
      source_type: 'activity',
      excerpt: 'z'.repeat(1000),
      score: 0.8 - index * 0.01,
    })),
  ]

  const packet = buildAssistantContextPacket({
    turnType: 'simple_action',
    request: 'How do you know?',
    stablePolicy: 'policy',
    safetyPolicy: 'safety',
    authoritativeState: {},
    evidence,
    requiredEvidenceIds: ['school-old'],
  })

  assert.ok(packet.evidence.some((item) => item.evidence_id === 'school-old'))
  assert.ok(packet.evidence.some((item) => item.evidence_id === 'school-new'))
})

test('token estimates are deterministic and conservative', () => {
  assert.equal(estimateContextTokens('12345678'), 2)
  assert.ok(estimateContextTokens({ text: 'x'.repeat(100) }) >= 27)
})

test('conversation trimming preserves the latest user request and newest useful turns', () => {
  const contents = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'model',
    parts: [{ text: `turn-${index} ${'x'.repeat(900)}` }],
  }))
  const result = trimConversationToTokenBudget({
    systemInstruction: 'policy '.repeat(100),
    tools: [{ name: 'calendar.create', description: 'tool '.repeat(100) }],
    contents,
    maxInputTokens: 1800,
  })

  assert.equal(result.contents.at(-1).parts[0].text.startsWith('turn-11'), true)
  assert.ok(result.contents.length < contents.length)
  assert.ok(result.estimatedInputTokens <= 1800)
  assert.ok(result.droppedTurns > 0)
})
