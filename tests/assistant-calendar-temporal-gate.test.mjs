import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistantSource = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const drawerSource = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')
const hookSource = readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')

test('assistant validates temporal evidence before auto-executing create_event', () => {
  const createBlock = assistantSource.split("if (name === 'create_event')")[1]?.split("if (name === 'create_recipe'")[0] ?? ''
  assert.match(assistantSource, /classifyCalendarTemporalEvidence/)
  assert.match(createBlock, /date_mismatch_blocked|date_clarification_required/)
  assert.match(createBlock, /temporal_provenance/)
  assert.match(createBlock, /requiresExactDateConfirmation/)
  assert.ok(createBlock.indexOf('classifyCalendarTemporalEvidence') < createBlock.indexOf('isLowRiskCreate'))
  const defaultCreateBlock = assistantSource.split('if (talkPlanCommandLane && defaultCalendarCreate)')[1]?.split('const shouldRunAgentWrite')[0] ?? ''
  assert.match(defaultCreateBlock, /date_clarification_required/)
  const agentAdoptionBlock = assistantSource.split("agentWriteData.type === 'tool_action'")[1]?.split("appendServerTrace('server_agent_write_adopted'")[0] ?? ''
  assert.match(agentAdoptionBlock, /classifyCalendarTemporalEvidence|temporal_provenance/)
})

test('assistant saves undated Talk and Plan calendar ideas as draft tasks', () => {
  assert.match(assistantSource, /saveUndatedCalendarDraft/)
  assert.match(assistantSource, /kind: 'next_action'/)
  assert.match(assistantSource, /due_at: null/)
  assert.match(assistantSource, /draft_saved/)
})

test('assistant carries a matching undated draft into later event creation', () => {
  assert.match(assistantSource, /findUndatedCalendarDraft/)
  assert.match(assistantSource, /draft_project_item_id/)
})

test('assistant uses authoritative duplicate and conflict preflight before create', () => {
  const createBlock = assistantSource.split("if (name === 'create_event')")[1]?.split("if (name === 'create_recipe'")[0] ?? ''
  assert.match(assistantSource, /assessCalendarCreatePreflight/)
  assert.match(createBlock, /exact_duplicate_suppressed/)
  assert.match(createBlock, /calendar_conflict_detected/)
  assert.match(createBlock, /calendar_preflight/)
})

test('client preserves source message IDs and explicitly confirms conflict overrides', () => {
  assert.match(hookSource, /id: m\.id/)
  assert.match(drawerSource, /allow_calendar_conflicts/)
})
