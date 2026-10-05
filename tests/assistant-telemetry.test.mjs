import { voiceFinalIntent } from '../src/lib/voiceTurnTaking.mjs'
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
const agentWrite = readFileSync(new URL('../supabase/functions/_shared/assistant-agent-write.mjs', import.meta.url), 'utf8')
const householdDirectory = readFileSync(new URL('../supabase/functions/_shared/assistant-household-directory.mjs', import.meta.url), 'utf8')
const familyIdentity = readFileSync(new URL('../supabase/functions/_shared/family-identity.mjs', import.meta.url), 'utf8')
const householdGraph = readFileSync(new URL('../supabase/functions/build-household-graph/index.ts', import.meta.url), 'utf8')
const familyContactMigration = readFileSync(new URL('../supabase/migrations/20260805200500_add_confirmed_family_contact_relationships.sql', import.meta.url), 'utf8')
const contactPlaceMigration = readFileSync(new URL('../supabase/migrations/20260805201500_add_contact_place_relationships.sql', import.meta.url), 'utf8')

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

test('assistant telemetry spans invocation, streaming, fallback, and failure outcomes', () => {
  for (const event of [
    'assistant_invoke_started',
    'assistant_first_token',
    'assistant_result_received',
    'assistant_stream_fallback',
    'turn_completed',
    'turn_failed',
  ]) {
    assert.match(assistant, new RegExp(`emitAssistantTrace\\('${event}'`))
  }
  assert.match(assistant, /outcome\.resultType === 'error' \|\| outcome\.safetyRejection/)
  assert.match(assistant, /failure_class: outcome\.safetyRejection \? 'safety_rejection' : 'assistant_error'/)
})

test('voice telemetry covers wake through final ASR without recording transcript text', () => {
  assert.match(wake, /traceId, wakeAt/)
  for (const event of ['asr_connect_started', 'asr_capture_ready', 'asr_listening_ready', 'asr_first_interim', 'asr_final', 'asr_error']) {
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
  assert.match(speech, /utterance_id: heldUtteranceId/)
})

test('AI forensics reports the new client pipeline stages', () => {
  for (const event of ['drawer_opened', 'asr_final', 'assistant_first_token', 'assistant_invoke_started']) {
    assert.match(settings, new RegExp(event))
  }
  for (const metric of ['wakeToDrawerP95Ms', 'asrP95Ms', 'firstTokenP95Ms']) {
    assert.match(settings, new RegExp(metric))
  }
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

test('household relationships remain many-to-many across shared contacts and places', () => {
  assert.match(familyContactMigration, /unique \(family_member_id, contact_id, relationship\)/)
  assert.match(contactPlaceMigration, /unique \(contact_id, place_id, relationship\)/)
  assert.doesNotMatch(familyContactMigration, /unique \(contact_id\)/)
  assert.doesNotMatch(contactPlaceMigration, /unique \(place_id\)/)
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

test('voice confirmation keeps the drawer open and relies on explicit dismiss phrases', () => {
  assert.doesNotMatch(drawer, /onConfirm:[\s\S]{0,320}startFresh\(\)/)
  assert.doesNotMatch(drawer, /onCancel:[\s\S]{0,320}startFresh\(\)/)
  assert.doesNotMatch(drawer, /onConfirm:[\s\S]{0,320}setTimeout\(onClose, 350\)/)
  assert.doesNotMatch(drawer, /onCancel:[\s\S]{0,320}setTimeout\(onClose, 350\)/)
  assert.match(assistant, /const GOODBYE_PHRASES = /)
  assert.doesNotMatch(assistant, /GOODBYE_PHRASES = [^\n]*thank you/)
  // The speech hook sorts each sentence with voiceFinalIntent (tests/voice-final-intent.test.mjs):
  // "go away" ends the session, "thank you" doesn't.
  assert.match(speech, /voiceFinalIntent\(transcript, \{ hasPending: hasPendingRef\.current \}\)/)
  assert.equal(voiceFinalIntent('go away'), 'dismiss')
  assert.notEqual(voiceFinalIntent('thank you'), 'dismiss')
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
