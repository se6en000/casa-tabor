import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { shouldUseAgentWritePlanner } from '../supabase/functions/_shared/assistant-agent-write.mjs'

const assistant = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)
const agentWrite = readFileSync(
  new URL('../supabase/functions/_shared/assistant-agent-write.mjs', import.meta.url),
  'utf8',
)

test('reminder vocabulary cannot enter the generic agent write lane', () => {
  assert.match(agentWrite, /options\.reminderDomainLanguage !== true/)
  assert.match(agentWrite, /options\.explicitReminderCreate !== true/)
})

test('agent write planner defers quantified multi-event deletes to the bulk-capable lane', () => {
  assert.equal(shouldUseAgentWritePlanner({
    agentRuntimeEnabled: true,
    agentWriteEnabled: true,
    agentWriteRate: 1,
    isCalendarSemanticRead: false,
    reminderDomainLanguage: false,
    explicitReminderCreate: false,
    hasGroceryFrame: false,
    pageEligible: true,
    chefMode: false,
    hasImage: false,
    unsupportedBulkMutation: true,
    sample: 0,
  }), false)
})

test('exact active-event mutations use the deterministic resolver before semantic planning', () => {
  assert.doesNotMatch(
    assistant,
    /\(!shouldRunAgentWrite \|\| isCanonicalRecurringEvent\(activeConversationEvent\)\)/,
  )
})
