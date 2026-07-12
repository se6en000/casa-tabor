import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const bridge = readFileSync(new URL('../pi/whisper-bridge-main.py', import.meta.url), 'utf8')
const launcher = readFileSync(new URL('../pi/start-casa.sh', import.meta.url), 'utf8')

test('Pi bridge requires runtime provider credentials', () => {
  assert.match(bridge, /os\.environ\.get\('DEEPGRAM_API_KEY'/)
  assert.doesNotMatch(bridge, /DEEPGRAM_KEY\s*=\s*['"][a-f0-9]{20,}/i)
  assert.match(launcher, /whisper-bridge\.env/)
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
