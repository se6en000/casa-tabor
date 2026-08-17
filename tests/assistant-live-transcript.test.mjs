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
  assert.match(drawer, /Ask Casa (anything|AI)/)
  assert.doesNotMatch(drawer, /text-transparent caret-transparent/)
  assert.match(drawer, /aria-label="Assistant message"/)
  assert.match(drawer, /onChange=\{e => handleInputChange\(e\.target\.value\)\}/)
})

test('adaptive composer follows launch intent and responsive control contracts', () => {
  assert.match(drawer, /launchContext\?\.source === 'wake_word'/)
  assert.doesNotMatch(drawer, /launchContext\?\.source === 'wake_word' \|\| conversationModeRef\.current/)
  assert.equal((drawer.match(/aria-label="Add attachment"/g) ?? []).length, 1)
  assert.match(drawer, /aria-expanded=\{attachmentMenuOpen\}/)
  assert.match(drawer, /aria-controls="assistant-attachment-actions"/)
  assert.match(drawer, /Attach image/)
  assert.match(drawer, /Take photo/)
  assert.doesNotMatch(drawer, /Attach image from library/)
  assert.doesNotMatch(drawer, /className="mb-2 flex gap-2 sm:hidden"/)
  assert.doesNotMatch(drawer, /hidden size-control[\s\S]{0,180}sm:flex/)
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

test('wake sessions have bounded silence and unusable-speech dismissal paths', () => {
  assert.match(speech, /WAKE_SILENCE_TIMEOUT_MS = 8000/)
  assert.match(speech, /SPEECH_WITHOUT_TRANSCRIPT_TIMEOUT_MS = 6000/)
  assert.match(speech, /MAX_UNUSABLE_FINALS = 2/)
  assert.match(speech, /autoDismissOnFailure = false/)
  assert.match(speech, /voice_session_auto_dismissed/)
  assert.match(speech, /autoDismissSession\('wake_silence'\)/)
  assert.match(speech, /autoDismissSession\('speech_without_transcript'\)/)
  assert.match(speech, /autoDismissSession\('repeated_gibberish'\)/)
  assert.match(drawer, /onAutoDismiss: \(\) => \{/)
  assert.match(drawer, /autoDismissOnFailure: launchContext\?\.source === 'wake_word'/)
  assert.match(drawer, /A failed wake session is not user activity or a conversation to resume/)
})
