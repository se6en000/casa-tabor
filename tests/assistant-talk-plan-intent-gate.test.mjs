import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  resolveTalkPlanIntentGate,
  shouldUseTalkPlanDeterministicLane,
} from '../supabase/functions/_shared/talk-plan-intent-gate.mjs'

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

test('Talk and Plan has one boundary for every deterministic domain responder', () => {
  assert.equal(shouldUseTalkPlanDeterministicLane('do', null), true)
  assert.equal(
    shouldUseTalkPlanDeterministicLane(
      'talk_plan',
      resolveTalkPlanIntentGate('Help me work through this project.', null),
    ),
    false,
  )
  assert.equal(
    shouldUseTalkPlanDeterministicLane(
      'talk_plan',
      resolveTalkPlanIntentGate('Delete the calendar event.', null),
    ),
    false,
  )
  assert.equal(
    shouldUseTalkPlanDeterministicLane(
      'talk_plan',
      resolveTalkPlanIntentGate('Delete the calendar event.', 'confirmed_action'),
    ),
    true,
  )
})

test('Talk and Plan preflight runs before domain responders and conversational turns cannot enter them', () => {
  assert.ok(
    server.indexOf("talkPlanIntentGate?.decision === 'confirm_intent'") <
      server.indexOf('if (talkPlanCommandLane && reminderClarification)'),
  )
  for (const guardedBranch of [
    /if \(talkPlanCommandLane && reminderClarification\)/,
    /if \(talkPlanCommandLane && bugReportRequest\.kind === 'clarify'\)/,
    /if \(talkPlanCommandLane && providerListRequest/,
    /if \(talkPlanCommandLane && householdDirectoryQuestion/,
    /if \(talkPlanCommandLane && \(memoryInsightsReadIntent \|\| bugTrackerReadIntent\)\)/,
    /if \(talkPlanCommandLane && cookingFrame\?\.intent === 'recipe\.find'\)/,
    /if \(talkPlanCommandLane && defaultCalendarCreate\)/,
    /if \(talkPlanCommandLane && requestAmbiguity\)/,
    /if \(talkPlanCommandLane && intentRouting\.profile === 'grocery' && groceryFrame\)/,
  ]) {
    assert.match(server, guardedBranch)
  }
})

test('Talk and Plan keeps grounded read tools while excluding mutation tools', () => {
  assert.match(
    server,
    /intentRouting\.profile === 'talk_plan' && !talkPlanCommandLane[\s\S]{0,120}new Set\(\['search_events', 'search_web', 'search_places', 'get_weather_forecast'\]\)/,
  )
  assert.match(
    server,
    /includeRawDomainContext = experienceMode !== 'talk_plan' \|\| talkPlanCommandLane/,
  )
})

test('an accepted durable planning proposal may prepare write confirmations without opening deterministic responders', () => {
  assert.match(server, /acceptedPlanningProposal/)
  assert.match(
    server,
    /intentRouting\.profile === 'talk_plan' && !talkPlanCommandLane && !acceptedPlanningProposal/,
  )
  assert.match(server, /ACCEPTED PLANNING PROPOSAL/)
})
