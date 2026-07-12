import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('Flux shadow compares locally without exposing transcript text', () => {
  const script = String.raw`
import json
from pi.stt_flux_shadow import FluxShadow

class ABNF:
    OPCODE_BINARY = 2

class FakeApp:
    def __init__(self, url, header, on_open, on_message, on_error, on_close):
        self.on_open = on_open
        self.on_message = on_message
    def run_forever(self):
        self.on_open(self)
    def send(self, *_args):
        import time
        time.sleep(0.01)
    def close(self):
        pass

class FakeWebsocket:
    WebSocketApp = FakeApp
    ABNF = ABNF

events = []
shadow = FluxShadow(
    api_key='test',
    websocket_module=FakeWebsocket,
    emit=events.append,
    enabled=True,
    sample_percent=100,
    queue_chunks=2,
    random_value=lambda: 0,
)
assert shadow.start('session')
for _ in range(20):
    shadow.offer_audio(b'x' * 3200)
shadow.observe_primary_commit(0, 'turn-1', 'do we have milk')
shadow._on_message(None, json.dumps({
    'event': 'StartOfTurn',
    'turn_index': 0,
    'audio_window_end': 0.6,
    'words': [{'word': 'do', 'start': 0.4, 'end': 0.6}],
}))
shadow._on_message(None, json.dumps({
    'event': 'Update',
    'turn_index': 0,
}))
shadow._on_message(None, json.dumps({
    'event': 'EndOfTurn',
    'turn_index': 0,
    'transcript': 'do we have milk',
    'audio_window_end': 2.0,
    'end_of_turn_confidence': 0.86,
    'words': [
        {'word': 'do', 'end': 0.5, 'confidence': 0.9},
        {'word': 'milk', 'end': 1.2, 'confidence': 0.8},
    ],
}))
comparison = next(event for event in events if event.get('status') == 'turn_compared')
assert comparison['normalized_edit_distance'] == 0
assert comparison['last_word_to_eot_ms'] == 800
assert comparison['average_confidence'] == 0.85
assert comparison['speech_to_first_update_ms'] == 200
assert comparison['update_count'] == 2
assert comparison['queue_drops'] > 0
assert comparison['max_primary_offer_us'] >= 0
assert all('transcript' not in event for event in events)
print(json.dumps(comparison))
`
  const result = spawnSync('python3', ['-c', script], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const comparison = JSON.parse(result.stdout)
  assert.equal(comparison.provider, 'flux')
  assert.equal(comparison.status, 'turn_compared')
})

test('disabled Flux shadow performs no work', () => {
  const script = String.raw`
from pi.stt_flux_shadow import FluxShadow
shadow = FluxShadow(
    api_key='test',
    websocket_module=None,
    emit=lambda _event: None,
    enabled=False,
    sample_percent=100,
)
assert shadow.start('session') is False
assert shadow.offer_audio(b'audio') == 0
assert shadow.active is False
`
  const result = spawnSync('python3', ['-c', script], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('stopping a shadow session reports a missing Flux EOT without text', () => {
  const script = String.raw`
from pi.stt_flux_shadow import FluxShadow

class FakeApp:
    def __init__(self, _url, **kwargs):
        self.on_open = kwargs['on_open']
    def run_forever(self):
        self.on_open(self)
    def send(self, *_args):
        pass
    def close(self):
        pass

class FakeWebsocket:
    class ABNF:
        OPCODE_BINARY = 2
    WebSocketApp = FakeApp

events = []
shadow = FluxShadow(
    api_key='test',
    websocket_module=FakeWebsocket,
    emit=events.append,
    enabled=True,
    sample_percent=100,
    random_value=lambda: 0,
)
assert shadow.start('session')
shadow.observe_primary_commit(0, 'turn-1', 'private spoken words')
shadow.stop()
missing = next(event for event in events if event.get('status') == 'primary_committed_before_shadow_eot')
assert missing['primary_word_count'] == 3
assert 'transcript' not in missing
`
  const result = spawnSync('python3', ['-c', script], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})
