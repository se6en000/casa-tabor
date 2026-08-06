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
const householdDirectory = readFileSync(new URL('../supabase/functions/_shared/assistant-household-directory.mjs', import.meta.url), 'utf8')
const familyIdentity = readFileSync(new URL('../supabase/functions/_shared/family-identity.mjs', import.meta.url), 'utf8')
const householdGraph = readFileSync(new URL('../supabase/functions/build-household-graph/index.ts', import.meta.url), 'utf8')

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
  assert.match(assistantFunction, /resolveModelParts\(secondaryParts, secondaryDepth \+ 1,\s*writeRescueUsed\)/)
  assert.match(assistantFunction, /server_ai_assistant_secondary_cap/)
  assert.match(assistantFunction, /runCompactFallback\('primary_timeout'\)/)
  assert.match(assistantFunction, /server_ai_assistant_fallback_recovered/)
  assert.match(assistantFunction, /server_ai_assistant_write_tool_rescue/)
  assert.match(assistantFunction, /WRITE TOOL RESCUE/)
  assert.match(assistantFunction, /llm_write_tool_rescue/)
  assert.doesNotMatch(assistantFunction, /stage=llm_retry/)
})

test('reminder create safety clarifies missing details before write-tool rescue', () => {
  assert.match(assistantFunction, /reminderCreateClarification\(reminderCreateRequestText\)/)
  assert.match(assistantFunction, /args\.title = reminderSubject/)
  assert.match(assistantFunction, /args\.event_type = 'reminder'/)
  assert.match(assistantFunction, /const deterministicArgs = \(/)
  assert.match(assistantFunction, /buildDisplayText\(deterministicMutation\.tool, deterministicArgs\)/)
  assert.match(assistantFunction, /server_ai_assistant_reminder_clarification/)
  assert.match(assistantFunction, /const userLikelyRequestedWrite = explicitReminderCreate \|\| userRequestedWriteIntent/)
  assert.match(
    assistantFunction,
    /explicitReminderCreate[\s\S]{0,250}source: 'explicit_reminder_create'[\s\S]{0,250}activeEntityType === 'calendar_clarification'/,
  )
})

test('assistant buffers model text until output safety validation completes', () => {
  assert.match(assistantFunction, /secureAssistantResult\(rawResult/)
  assert.match(assistantFunction, /server_ai_assistant_output_rejected/)
  assert.match(assistantFunction, /emitToken = \(\) => \{\}/)
  assert.doesNotMatch(assistantFunction, /emitToken = \(delta: string\)/)
})

test('assistant image context is conversation-scoped and never salvages partial streams', () => {
  assert.match(assistant, /const activeImageRef = useRef/)
  assert.match(assistant, /image \?\? activeImageRef\.current/)
  assert.match(assistant, /image_context: imageContext/)
  assert.match(assistantFunction, /IMAGE_REQUEST_HARD_TIMEOUT_MS = 26000/)
  assert.match(assistantFunction, /IMAGE_PRIMARY_HARD_TIMEOUT_MS = 22000/)
  assert.match(assistantFunction, /requestHardTimeoutMs = image/)
  assert.match(assistantFunction, /const primaryHardTimeoutMs = image/)
  assert.match(assistantFunction, /const imageEventCreateHint = Boolean\(/)
  assert.match(assistantFunction, /const imageEventCreateFollowUp = Boolean\(/)
  assert.match(assistantFunction, /source: 'image_event_hint'/)
  assert.match(assistantFunction, /source: 'image_event_followup'/)
  assert.match(assistantFunction, /const imageDirectEventCreateFlow = Boolean\(/)
  assert.match(assistantFunction, /!imageDirectEventCreateFlow/)
  assert.match(assistantFunction, /image_context: imageContext/)
  assert.match(assistantFunction, /thought_tokens: usage\.thoughtTokens/)
  assert.match(assistantFunction, /finish_reason:/)
  assert.doesNotMatch(assistant, /salvagePartial/)
  assert.doesNotMatch(assistant, /salvage rather than double-call/)
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
  assert.match(assistantFunction, /source: 'explicit_reminder_create'/)
  assert.match(assistantFunction, /const directReminderCreateFlow =/)
  assert.match(assistantFunction, /const shouldRunAgentWrite =[\s\S]{0,320}!explicitReminderCreate/)
  assert.match(assistantFunction, /directReminderCreateFlow[\s\S]{0,160}tool\.name === 'create_event'/)
  assert.match(assistantFunction, /REMINDER CREATE MODE:/)
  assert.match(assistantFunction, /directReminderCreateFlow[\s\S]{0,180}function_calling_config: \{ mode: 'ANY', allowed_function_names: \['create_event'\] \}/)
  assert.match(assistantFunction, /resolveExplicitReminderDaypartRange\(reminderCreateRequestText/)
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

test('household directory lookups load confirmed contacts and their primary places', () => {
  assert.match(assistantFunction, /isHouseholdDirectoryQuestion\(latestUserText\)/)
  assert.match(assistantFunction, /HOUSEHOLD DIRECTORY ANSWER MODE/)
  assert.match(assistantFunction, /const groceryFrame = householdDirectoryQuestion \|\|/)
  assert.match(assistantFunction, /primary_place:saved_places!saved_contacts_primary_place_id_fkey/)
  assert.match(assistantFunction, /usually at \$\{c\.primary_place\.name\}/)
  assert.match(assistantFunction, /includePlaceContext = [\s\S]{0,180}householdDirectoryQuestion/)
  for (const role of ['coach', 'dentist', 'dermatologist', 'doctor', 'orthodontist']) {
    assert.match(householdDirectory, new RegExp(role))
  }
  assert.match(householdDirectory, /what do you know about/)
})

test('assistant grounds provider answers in confirmed family relationships', () => {
  assert.match(assistantFunction, /family_contact_relationships/)
  assert.match(assistantFunction, /CONFIRMED FAMILY RELATIONSHIPS/)
  assert.match(assistantFunction, /never infer relationships from event attendees/)
  assert.match(assistantFunction, /family_member:family_members\(name, full_name\)/)
})

test('unconfirmed provider lookups offer evidence-backed confirmation actions', () => {
  assert.match(assistantFunction, /associate_family_contact/)
  assert.match(assistantFunction, /Suggested from explicit family-member and provider calendar evidence/)
  assert.match(assistantFunction, /Another possibility is/)
  assert.match(assistantFunction, /never infer relationships from event attendees/)
  assert.match(actionFunction, /family_member_id, contact_id, and relationship are required/)
  assert.match(actionFunction, /family_contact_relationships/)
  assert.match(actionFunction, /onConflict: 'family_member_id,contact_id,relationship'/)
})

test('directory fallback can confirm entities and persist contact-place associations', () => {
  assert.match(assistantFunction, /confirm_directory_entity/)
  assert.match(assistantFunction, /associate_contact_place/)
  assert.match(assistantFunction, /contact_place_relationships/)
  assert.match(assistantFunction, /CONFIRMED PEOPLE ↔ PLACES/)
  assert.match(actionFunction, /set_contact_place_relationship/)
  assert.match(actionFunction, /Saved .* as .*'s \$\{relationship\.replaceAll/)
  assert.match(householdGraph, /contactPlacesResult/)
  assert.match(householdGraph, /edge_type: 'has_provider'/)
  assert.match(assistantFunction, /\.from\('event_enrichments'\)[\s\S]{0,180}\.ilike\('contact_name'/)
  assert.match(assistantFunction, /genericPlaceTerms = new Set/)
  assert.match(householdGraph, /nodeRows\.slice\(index \* 75/)
})

test('assistant preserves full family names for alias-aware identity resolution', () => {
  assert.match(assistant, /full_name: f\.full_name/)
  assert.match(assistantFunction, /canonicalizeFamilyReferences\(rawLatestUserText, familyMembers\)/)
  assert.match(assistantFunction, /FAMILY IDENTITY ALIASES/)
  assert.match(actionFunction, /resolveFamilyMemberByName\(family, name\)/)
  assert.match(familyIdentity, /fullName\.split/)
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
  assert.match(speech, /const DISMISS_PHRASES = /)
  assert.doesNotMatch(assistant, /GOODBYE_PHRASES = [^\n]*thank you/)
  assert.doesNotMatch(speech, /DISMISS_PHRASES = [^\n]*thank you/)
  assert.match(speech, /DISMISS_PHRASES = [^\n]*go away/)
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

test('create_event action normalizes unsupported event_type values before insert', () => {
  assert.match(actionFunction, /function normalizeCreateEventType\(value: unknown\)/)
  assert.match(actionFunction, /event_type: normalizedEventType/)
  assert.match(actionFunction, /\\['reminder', 'task', 'todo'\\]/)
  assert.match(actionFunction, /if \(normalizedEventType !== 'reminder'\)/)
  assert.match(actionFunction, /sync_status: 'synced'/)
  assert.match(assistantFunction, /Got it — reminder set for/)
})
