import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const component = readFileSync(new URL('../src/components/ui/LiveTranscript.tsx', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')
const speech = readFileSync(new URL('../src/hooks/useSpeechInput.ts', import.meta.url), 'utf8')

test('live transcript renders stable and revisable speech separately', () => {
  assert.match(component, /text-content-heading/)
  assert.match(component, /text-casa-muted/)
  assert.match(component, /aria-hidden="true"/)
  assert.match(component, /aria-live="polite"/)
  assert.match(component, /\{stableText\}/)
  assert.match(component, /\{liveText\}/)
  assert.match(component, /live-transcript-meter/)
  assert.match(component, /Live words are warming up/)
  assert.match(component, /phase === 'capturing'/)
})

test('drawer presents live voice revisions without replacing its editable control', () => {
  assert.match(drawer, /<LiveTranscript/)
  assert.match(drawer, /committed=\{voiceTranscript\.committed\}/)
  assert.match(drawer, /interim=\{voiceTranscript\.interim\}/)
  assert.match(drawer, /phase=\{speech\.phase\}/)
  assert.match(drawer, /volume=\{speech\.volume\}/)
  assert.match(drawer, /text-transparent caret-transparent/)
  assert.match(drawer, /aria-label="Assistant message"/)
  assert.match(drawer, /onChange=\{e => handleInputChange\(e\.target\.value\)\}/)
})

test('speech hook preserves structured transcript revisions', () => {
  assert.match(speech, /type VoiceTranscriptRevision/)
  assert.ok(speech.includes("committed: String(msg.committed ?? '')"))
  assert.ok(speech.includes("interim: String(msg.interim ?? '')"))
  assert.match(speech, /case 'capturing':/)
  assert.match(speech, /phase === 'capturing' \|\| phase === 'listening'/)
})
