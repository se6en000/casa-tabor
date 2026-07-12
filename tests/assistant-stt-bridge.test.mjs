import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bridge = readFileSync(new URL('../pi/whisper-bridge-main.py', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../pi/start-casa.sh', import.meta.url), 'utf8')
const refresh = readFileSync(new URL('../pi/refresh-casa-kiosk.sh', import.meta.url), 'utf8')
const shadow = readFileSync(new URL('../pi/stt_flux_shadow.py', import.meta.url), 'utf8')

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

test('legacy dictation protocol retains final messages', () => {
  assert.match(bridge, /_stt_protocol = 'legacy'/)
  assert.match(bridge, /'type': 'final'/)
})
