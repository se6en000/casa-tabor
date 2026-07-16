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

test('drawer morphs one composer between voice and editable text modes', () => {
  assert.match(drawer, /<LiveTranscript/)
  assert.match(drawer, /committed=\{voiceTranscript\.committed\}/)
  assert.match(drawer, /interim=\{voiceTranscript\.interim\}/)
  assert.match(drawer, /voiceComposerActive \? \(/)
  assert.match(drawer, /phase=\{voiceDisplayPhase\}/)
  assert.match(drawer, /volume=\{speech\.volume\}/)
  assert.match(drawer, /Type instead/)
  assert.match(drawer, /Ask Casa anything/)
  assert.doesNotMatch(drawer, /text-transparent caret-transparent/)
  assert.match(drawer, /aria-label="Assistant message"/)
  assert.match(drawer, /onChange=\{e => handleInputChange\(e\.target\.value\)\}/)
})

test('adaptive composer follows launch intent and responsive control contracts', () => {
  assert.match(drawer, /launchContext\?\.source === 'wake_word'/)
  assert.doesNotMatch(drawer, /launchContext\?\.source === 'wake_word' \|\| conversationModeRef\.current/)
  assert.match(drawer, /sm:hidden/)
  assert.match(drawer, /hidden size-control[\s\S]{0,180}sm:flex/)
  assert.match(drawer, /ai-composer-kiosk-only/)
  assert.match(drawer, /speechStopRef\.current\(\)/)
})

test('speech hook preserves structured transcript revisions', () => {
  assert.match(speech, /type VoiceTranscriptRevision/)
  assert.ok(speech.includes("committed: String(msg.committed ?? '')"))
  assert.ok(speech.includes("interim: String(msg.interim ?? '')"))
  assert.match(speech, /case 'capturing':/)
  assert.match(speech, /phase === 'capturing' \|\| phase === 'listening'/)
  assert.match(speech, /case 'committed':[\s\S]{0,260}setPhaseSync\('listening'\)/)
})
