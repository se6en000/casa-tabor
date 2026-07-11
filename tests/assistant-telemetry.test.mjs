import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(new URL('../src/hooks/useAIAssistant.ts', import.meta.url), 'utf8')
const speech = readFileSync(new URL('../src/hooks/useSpeechInput.ts', import.meta.url), 'utf8')
const wake = readFileSync(new URL('../src/hooks/useWakeWord.ts', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/pages/AISettingsPage.tsx', import.meta.url), 'utf8')

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
})

test('AI forensics reports the new client pipeline stages', () => {
  for (const event of ['drawer_opened', 'asr_final', 'assistant_first_token', 'assistant_invoke_started']) {
    assert.match(settings, new RegExp(event))
  }
  for (const metric of ['wakeToDrawerP95Ms', 'asrP95Ms', 'firstTokenP95Ms']) {
    assert.match(settings, new RegExp(metric))
  }
})
