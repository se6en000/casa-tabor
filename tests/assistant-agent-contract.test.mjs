import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  AGENT_ACCEPTANCE_THRESHOLDS,
  AGENT_CONFIRMATION_POLICY,
  AGENT_CONTRACT_VERSION,
  AGENT_EXECUTION_BUDGET,
  AGENT_RESPONSIBILITIES,
  AGENT_ROLLOUT_STAGES,
  CURRENT_ASSISTANT_TOOL_INVENTORY,
  TARGET_AGENT_TOOLS,
} from '../supabase/functions/_shared/assistant-agent-contract.mjs'

const assistantSource = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)
const executorSource = readFileSync(
  new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url),
  'utf8',
)

test('bounded agent contract separates probabilistic planning from trusted execution', () => {
  assert.equal(AGENT_CONTRACT_VERSION, 'bounded-agent-v1')
  assert.ok(AGENT_RESPONSIBILITIES.planner.includes('interpret_language'))
  assert.ok(AGENT_RESPONSIBILITIES.planner.includes('choose_tools'))
  assert.ok(!AGENT_RESPONSIBILITIES.planner.includes('apply_idempotent_writes'))
  assert.ok(AGENT_RESPONSIBILITIES.policy.includes('enforce_confirmation'))
  assert.ok(AGENT_RESPONSIBILITIES.executor.includes('report_verified_results'))
})

test('agent budgets and acceptance thresholds protect Alexa-grade behavior', () => {
  assert.ok(AGENT_EXECUTION_BUDGET.maxToolCallsPerTurn <= 3)
  assert.ok(AGENT_EXECUTION_BUDGET.maxPlannerRetries <= 1)
  assert.ok(AGENT_EXECUTION_BUDGET.readTurnP95Ms < AGENT_EXECUTION_BUDGET.writeProposalP95Ms)
  assert.equal(AGENT_ACCEPTANCE_THRESHOLDS.destructiveTargetAccuracy, 1)
  assert.equal(AGENT_ACCEPTANCE_THRESHOLDS.unauthorizedExecutionRate, 0)
  assert.equal(AGENT_ACCEPTANCE_THRESHOLDS.duplicateWriteRate, 0)
  assert.equal(AGENT_ACCEPTANCE_THRESHOLDS.unverifiedSuccessClaimRate, 0)
  assert.equal(AGENT_CONFIRMATION_POLICY.destructive, 'always')
})

test('target capability tools cover calendar, grocery, and cooking conversations', () => {
  const names = new Set(TARGET_AGENT_TOOLS.map((tool) => tool.name))
  for (const required of [
    'calendar.search',
    'calendar.check_conflicts',
    'calendar.create',
    'calendar.update',
    'calendar.delete',
    'grocery.get_list',
    'grocery.add_items',
    'grocery.remove_item',
    'recipe.suggest_substitution',
    'recipe.add_ingredients_to_grocery',
  ]) {
    assert.ok(names.has(required), required)
  }
})

test('current tool inventory stays synchronized with planner declarations and action execution', () => {
  for (const tool of CURRENT_ASSISTANT_TOOL_INVENTORY) {
    assert.match(assistantSource, new RegExp(`name: ['"]${tool.name}['"]`), `${tool.name} declaration`)
    if (tool.execution === 'action') {
      assert.match(executorSource, new RegExp(`tool === ['"]${tool.name}['"]`), `${tool.name} executor`)
    }
  }
})

test('rollout remains staged and ends with a reversible default', () => {
  assert.deepEqual(AGENT_ROLLOUT_STAGES.slice(0, 4), [
    'contract',
    'tool_api',
    'conversation_state',
    'policy_gateway',
  ])
  assert.equal(AGENT_ROLLOUT_STAGES.at(-1), 'default_with_kill_switch')
})
