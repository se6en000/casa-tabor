import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
const speech = readFileSync(new URL('../src/hooks/useSpeechInput.ts', import.meta.url), 'utf8')
const wake = readFileSync(new URL('../src/hooks/useWakeWord.ts', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/pages/AISettingsPage.tsx', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')
const assistantFunction = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
const actionFunction = readFileSync(new URL('../supabase/functions/execute-ai-action/index.ts', import.meta.url), 'utf8')

test('assistant requests carry complete client trace provenance', () => {
  for (const field of [
    'correlation_id:',
    'trace_id:',
    'turn_id:',
    'lane:',
    'device_id:',
    'client_trace_present: true',
    'client_build:',
    'client_trace_source:',
  ]) {
    assert.match(assistant, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('assistant telemetry spans deterministic, streaming, fallback, and failure outcomes', () => {
  for (const event of [
    'assistant_fast_path_matched',
    'assistant_first_token',
    'assistant_result_received',
    'assistant_stream_fallback',
    'turn_completed',
    'turn_failed',
  ]) {
    assert.match(assistant, new RegExp(`emitAssistantTrace\\('${event}'`))
  }
})

test('voice telemetry covers wake through final ASR without recording transcript text', () => {
  assert.match(wake, /traceId, wakeAt/)
  for (const event of ['asr_connect_started', 'asr_listening_ready', 'asr_first_interim', 'asr_final', 'asr_error']) {
    assert.match(speech, new RegExp(`onTraceRef\\.current\\?\\.\\('${event}'`))
  }
  assert.doesNotMatch(speech, /onTraceRef\.current\?\.\('asr_final',\s*\{[^}]*transcript/s)
  assert.match(speech, /asr_fragment_held/)
  assert.match(speech, /asr_fragment_discarded/)
  assert.match(speech, /endpoint_reason:/)
  assert.match(drawer, /turnId: utteranceId/)
})

test('voice turn lifecycle separates provider segments from committed turns', () => {
  for (const event of ['asr_speech_started', 'asr_transcript_revision', 'asr_segment_final', 'asr_turn_candidate', 'asr_turn_resumed']) {
    assert.match(speech, new RegExp(`onTraceRef\\.current\\?\\.\\('${event}'`))
  }
  assert.match(speech, /turn_protocol: STT_TURN_PROTOCOL/)
  assert.match(speech, /next_utterance_id:/)
  assert.match(speech, /TURN_COMMIT_GRACE_MS/)
  assert.match(speech, /asr_flux_shadow/)
  assert.doesNotMatch(speech, /case 'shadow_metric':[\s\S]{0,1200}transcript:/)
})

test('active continuation speech cannot expire a held ASR fragment', () => {
  assert.match(speech, /if \(pendingFragmentRef\.current\) scheduleFragmentTimeout\(\)/)
  assert.match(speech, /pendingFragmentUtteranceIdRef\.current = utteranceIdRef\.current/)
  assert.match(speech, /utterance_id: abandonedUtteranceId/)
})

test('AI forensics reports the new client pipeline stages', () => {
  for (const event of ['drawer_opened', 'asr_final', 'assistant_first_token', 'assistant_invoke_started']) {
    assert.match(settings, new RegExp(event))
  }
  for (const metric of ['wakeToDrawerP95Ms', 'asrP95Ms', 'firstTokenP95Ms']) {
    assert.match(settings, new RegExp(metric))
  }
})

test('assistant model calls have hard budgets and only one secondary synthesis round', () => {
  assert.match(assistantFunction, /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/)
  assert.match(assistantFunction, /clearTimeout\(timeoutId\)/)
  assert.match(assistantFunction, /PRIMARY_HARD_TIMEOUT_MS = 6800/)
  assert.match(assistantFunction, /secondaryDepth === 0 && remainingRequestBudgetMs\(\) >= 1000/)
  assert.match(assistantFunction, /resolveModelParts\(secondaryParts, secondaryDepth \+ 1\)/)
  assert.match(assistantFunction, /server_ai_assistant_secondary_cap/)
  assert.match(assistantFunction, /runCompactFallback\('primary_timeout'\)/)
  assert.match(assistantFunction, /server_ai_assistant_fallback_recovered/)
  assert.doesNotMatch(assistantFunction, /stage=llm_retry/)
})

test('assistant buffers model text until output safety validation completes', () => {
  assert.match(assistantFunction, /secureAssistantResult\(rawResult/)
  assert.match(assistantFunction, /server_ai_assistant_output_rejected/)
  assert.match(assistantFunction, /emitToken = \(\) => \{\}/)
  assert.doesNotMatch(assistantFunction, /emitToken = \(delta: string\)/)
})

test('voice turns captured during loading are queued rather than dropped', () => {
  assert.match(drawer, /queuedVoiceTurnsRef\.current\.push/)
  assert.match(drawer, /voice_turn_queued/)
  assert.match(drawer, /voice_turn_dequeued/)
})

test('revised event confirmations supersede stale pending cards', () => {
  assert.match(assistant, /status: 'cancelled' as const/)
  assert.match(assistant, /message\.toolAction\.args\.id === finalMsg\.toolAction\?\.args\.id/)
})

test('assistant narrows prompt context and tools by intent profile', () => {
  assert.match(assistantFunction, /classifyAssistantIntent\(latestUserText/)
  assert.match(assistantFunction, /selectedToolDeclarations/)
  assert.match(assistantFunction, /primaryToolDeclarations/)
  assert.match(assistantFunction, /server_ai_assistant_prompt_profile/)
  assert.match(assistantFunction, /allowed_function_names: \['search_events'\]/)
  assert.match(assistantFunction, /includeEventContext/)
  assert.match(assistantFunction, /includeGroceryContext/)
  assert.match(assistantFunction, /updated_at: e\.updated_at/)
  assert.match(assistantFunction, /required: \['id', 'expected_updated_at'\]/)
  for (const gate of [
    'needsEventData',
    'needsPlaceData',
    'needsContactData',
    'needsGroceryData',
    'needsRecipeData',
    'needsAvailabilityData',
  ]) {
    assert.match(assistantFunction, new RegExp(gate))
  }
  assert.match(assistantFunction, /loaded_domains:/)
  assert.match(assistantFunction, /server_ai_assistant_deterministic_mutation/)
  assert.match(assistantFunction, /server_ai_assistant_calendar_language_match/)
  assert.match(assistantFunction, /server_ai_assistant_calendar_language_unmatched/)
  assert.match(assistantFunction, /server_ai_assistant_calendar_semantic_read/)
})

test('confirmation state is atomic, self-clearing, and fully traced', () => {
  assert.match(drawer, /state: 'pending' \| 'executing'/)
  assert.match(drawer, /pending\.state = 'executing'/)
  assert.match(drawer, /dispatchPendingConfirmation/)
  assert.match(drawer, /isActivePending && hasPendingAction/)
  assert.match(drawer, /return \(\) => registerPendingAction\(msg\.id, null\)/)
  for (const event of [
    'confirmation_accepted',
    'confirmation_cancelled',
    'confirmation_ignored',
    'action_execute_started',
    'action_execute_completed',
    'action_execute_failed',
  ]) {
    assert.match(drawer, new RegExp(`emitAssistantTrace\\('${event}'`))
  }
})

test('voice confirmation closes the drawer without clearing saved conversation history', () => {
  assert.doesNotMatch(drawer, /onConfirm:[\s\S]{0,320}startFresh\(\)/)
  assert.doesNotMatch(drawer, /onCancel:[\s\S]{0,320}startFresh\(\)/)
})

test('confirmed actions preserve client trace provenance on the server', () => {
  for (const field of [
    'trace_id: actionTrace?.traceId',
    'turn_id: actionTrace?.turnId',
    'device_id: getAssistantDeviceId()',
    'client_trace_present: Boolean(actionTrace)',
    'client_build:',
    'client_trace_source:',
  ]) {
    assert.match(drawer, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(actionFunction, /server_ai_action_started/)
  assert.match(actionFunction, /server_ai_action_failed/)
})
