import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import test from 'node:test'

// The LED strip's colours (pi/sensor-bridge/main.py `_frame_color`). Jake, 2026-09-27: "a deep
// yellow gold … too bright for my eyes, especially at night … as warm as possible … more
// mellow, less bright." And listening vs thinking must read at a glance: listening a steady
// breath along the whole strip, thinking a light that travels.

const bridgeDir = dirname(new URL('../pi/sensor-bridge/main.py', import.meta.url).pathname)
const frames = JSON.parse(execFileSync('python3', ['-c', `
import sys, json
sys.path.insert(0, ${JSON.stringify(bridgeDir)})
import main
out = {}
for night in (False, True):
    for mode in ('listening', 'processing', 'waiting', 'glow'):
        for voice in (0.0, 1.0):
            key = f"{mode}|{'night' if night else 'day'}|{voice}"
            out[key] = [[main._frame_color(mode, i, t / 10.0, voice, night) for i in range(main.NUM_LEDS)] for t in range(0, 60)]
out['bursts'] = {'confirm_day': main.CONFIRM_DAY, 'confirm_night': main.CONFIRM_NIGHT}
print(json.dumps(out))
`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))

const lit = (key) => frames[key].flat().filter(([r]) => r >= 4)
const peak = (key) => Math.max(...frames[key].flat().flat())

test('every moment is a deep gold: red leads, green well under it, next to no blue', () => {
  for (const key of Object.keys(frames).filter((k) => k !== 'bursts')) {
    const night = key.includes('night')
    for (const [r, g, b] of lit(key)) {
      assert.ok(b <= r * 0.08, `${key}: blue ${b.toFixed(1)} against red ${r.toFixed(1)} reads whitish`)
      assert.ok(g <= r * (night ? 0.45 : 0.62), `${key}: green ${g.toFixed(1)} against red ${r.toFixed(1)} is too yellow-white`)
      assert.ok(g >= r * (night ? 0.18 : 0.35), `${key}: green ${g.toFixed(1)} against red ${r.toFixed(1)} is orange, not gold`)
    }
  }
  for (const [name, [r, g, b]] of Object.entries(frames.bursts)) assert.ok(b <= r * 0.08 && g <= r * 0.62, name)
})

test('mellow: about half as bright by day, and low at night', () => {
  for (const key of Object.keys(frames).filter((k) => k.includes('|day|'))) assert.ok(peak(key) <= 64, `${key} peaks at ${peak(key).toFixed(1)}`)
  for (const key of Object.keys(frames).filter((k) => k.includes('|night|'))) assert.ok(peak(key) <= 24, `${key} peaks at ${peak(key).toFixed(1)}`)
  assert.ok(frames.bursts.confirm_day[0] <= 64 && frames.bursts.confirm_night[0] <= 24)
})

test('listening breathes as one; thinking is a light that travels', () => {
  const spread = (frame) => { const reds = frame.map(([r]) => r); return Math.max(...reds) - Math.min(...reds) }
  for (const when of ['day', 'night']) {
    for (const frame of frames[`listening|${when}|0.0`]) assert.ok(spread(frame) < 0.5, `listening (${when}) should be even along the strip`)
    const moving = frames[`processing|${when}|0.0`].map((frame) => frame.findIndex(([r]) => r === Math.max(...frame.map(([x]) => x))))
    assert.ok(new Set(moving).size > 10, `thinking (${when}) should travel`)
    assert.ok(Math.max(...frames[`processing|${when}|0.0`].map(spread)) > (when === 'day' ? 10 : 4), `thinking (${when}) should have a visible bright spot`)
  }
})
