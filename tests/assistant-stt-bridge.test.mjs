import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bridge = readFileSync(new URL('../pi/whisper-bridge-main.py', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../pi/start-casa.sh', import.meta.url), 'utf8')
const refresh = readFileSync(new URL('../pi/refresh-casa-kiosk.sh', import.meta.url), 'utf8')
const shadow = readFileSync(new URL('../pi/stt_flux_shadow.py', import.meta.url), 'utf8')
const wake = readFileSync(new URL('../src/hooks/useWakeWord.ts', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url), 'utf8')

test('Pi bridge requires runtime provider credentials', () => {
  assert.match(bridge, /os\.environ\.get\('DEEPGRAM_API_KEY'/)
  assert.doesNotMatch(bridge, /DEEPGRAM_KEY\s*=\s*['"][a-f0-9]{20,}/i)
  assert.match(launcher, /whisper-bridge\.env/)
})

test('Flux shadow is runtime-gated and cannot block Nova audio', () => {
  assert.match(bridge, /STT_FLUX_SHADOW_ENABLED/)
  assert.match(bridge, /STT_FLUX_SHADOW_SAMPLE_PERCENT/)
  assert.match(bridge, /_stt_protocol == 'candidate-v1'[\s\S]{0,100}_flux_shadow\.start/)
  assert.match(shadow, /put_nowait/)
  assert.match(shadow, /except queue\.Full/)
  assert.match(shadow, /chunk_bytes = int\(self\._sample_rate \* 0\.08\) \* 2/)
  assert.doesNotMatch(shadow, /eager_eot_threshold/)
})

test('Pi refresh deploys every tracked STT runtime module', () => {
  assert.match(refresh, /whisper-bridge-main\.py/)
  assert.match(refresh, /stt_flux_shadow\.py/)
})

test('candidate protocol keeps segment finals separate from turn commits', () => {
  assert.match(bridge, /_stt_protocol == 'candidate-v1'/)
  assert.match(bridge, /'type': 'segment_final'/)
  assert.match(bridge, /'type': 'turn_candidate'/)
  assert.match(bridge, /elif cmd == 'commit':/)
  assert.match(bridge, /elif cmd == 'discard':/)
  assert.match(bridge, /'type': 'committed'/)
})

test('accepted wake prewarms without discarding post-wake audio', () => {
  assert.match(bridge, /PRIMARY_STT_MODEL = os\.environ\.get\('STT_PRIMARY_MODEL', 'nova-3'\)/)
  assert.match(wake, /type: 'accept_wake', wake_id: msg\.wake_id/)
  assert.match(bridge, /cmd == 'accept_wake'/)
  assert.match(bridge, /start_recording\(reason='wake_accepted'\)/)
  assert.match(bridge, /'type': 'capturing'/)
  assert.match(bridge, /if not initial_buffer and warmup <= WARMUP_CHUNKS:/)
  assert.match(bridge, /_start_lock\.acquire\(blocking=False\)/)
})

test('ignored or abandoned wakes cannot strand the microphone', () => {
  assert.match(wake, /DRAWER_CLOSE_GRACE_MS/)
  assert.match(wake, /if \(now - drawerClosedAtRef\.current < DRAWER_CLOSE_GRACE_MS\) return/)
  assert.match(bridge, /PREWARM_ADOPTION_TIMEOUT_SECS = 2\.5/)
  assert.match(bridge, /_stt_disconnect_seq > claim_seq_before_prewarm/)
  assert.match(bridge, /not adopted:[\s\S]{0,180}stop_recording\(wake_disarm_secs=0\)/)
  assert.match(drawer, /onDismiss: \(\) => \{[\s\S]{0,120}speechStopRef\.current\(\)/)
})

test('legacy dictation protocol retains final messages', () => {
  assert.match(bridge, /_stt_protocol = 'legacy'/)
  assert.match(bridge, /'type': 'final'/)
})

// Jake, 2026-09-30: measured, nova-3's words come in 1-second steps; Flux sends an update every ~0.25 s of audio.
// Then (Oct 1) Jake made Flux the default: nova only when a session asks for it.
test('Flux is the recognizer by default: its turns in the wall\'s own messages, 80 ms chunks, a tap sends', () => {
  assert.match(bridge, /model=\{FLUX_MODEL\}/)
  assert.match(bridge, /^_stt_provider = 'flux'/m)
  assert.match(bridge, /_stt_provider = 'nova' if msg\.get\('stt_provider'\) == 'nova' else 'flux'/)
  assert.match(bridge, /FLUX_URL if flux else DG_URL/)
  assert.match(bridge, /on_message=_on_flux_message if flux else _on_message/)
  assert.match(bridge, /if event == 'StartOfTurn':[\s\S]{0,260}'type': 'speech_started'/)
  assert.match(bridge, /if event in \('Update', 'TurnResumed', 'EagerEndOfTurn'\):/)
  assert.match(bridge, /_emit_turn_candidate\('flux_end_of_turn', conf\)/)
  assert.match(bridge, /elif cmd == 'finalize' and _stt_provider == 'flux':[\s\S]{0,260}_emit_turn_candidate\('manual_finalize'\)/)
  assert.match(bridge, /chunk_bytes = \(RATE \* 2 \* 80\) \/\/ 1000/)
  // A wake opens the recognizer before the wall's 'start': the choice rides on the acceptance.
  assert.match(wake, /type: 'accept_wake', wake_id: msg\.wake_id, stt_provider: sttProvider\(\)/)
  assert.match(bridge, /if cmd == 'accept_wake':[\s\S]{0,400}_stt_provider = msg\['stt_provider'\]/)
})
