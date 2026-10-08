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

// Jake, Oct 7: "a different variation of the low Led glow 'candle' light when its dark? something that is a little more
// random like a candle flame". The glow wanders like a flame — no steady rhythm — with now and then a gust that makes it
// dip and flutter, and a brighter spot that drifts along the strip.
test('night glow is a candle: irregular, with gusts, a drifting bright spot, never a steady rhythm', () => {
  const series = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'pi/sensor-bridge')
import importlib.util
spec = importlib.util.spec_from_file_location('main', 'pi/sensor-bridge/main.py')
main = importlib.util.module_from_spec(spec); spec.loader.exec_module(main)
frames = [[main._frame_color('glow', i, t / 20.0, 0.0, True)[0] for i in range(main.NUM_LEDS)] for t in range(0, 20 * 120)]
print(json.dumps(frames))
`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }))
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
  const level = series.map((f) => mean(f))
  const m = mean(level)
  // Lively enough to read as a flame.
  const sd = Math.sqrt(mean(level.map((x) => (x - m) ** 2)))
  assert.ok(sd / m > 0.08, `too steady: ${(sd / m).toFixed(3)}`)
  // Gusts: now and then it dips well under its usual level.
  assert.ok(level.some((x) => x < m * 0.7), 'no gusts')
  assert.ok(level.filter((x) => x < m * 0.7).length < level.length * 0.15, 'dips too often')
  // No rhythm: the gaps between its flickers vary.
  const peaks = []
  for (let k = 1; k < level.length - 1; k++) if (level[k] > level[k - 1] && level[k] >= level[k + 1]) peaks.push(k)
  const gaps = peaks.slice(1).map((p, k) => p - peaks[k])
  const gm = mean(gaps)
  const cv = Math.sqrt(mean(gaps.map((g) => (g - gm) ** 2))) / gm
  assert.ok(cv > 0.4, `too regular: gaps vary by ${cv.toFixed(2)}`)
  // A bright spot that moves along the strip, while the strip stays one flame.
  const brightest = series.map((f) => f.indexOf(Math.max(...f)))
  assert.ok(new Set(brightest).size > 8, 'the bright spot never moves')
  for (const f of series) assert.ok(Math.min(...f) > Math.max(...f) * 0.2, 'the strip breaks apart')
  // The strip runs up the left side, across the top and down the right (Jake: "only 3 sides have the leds"): the
  // flame burns brightest across the top, a little dimmer at the bottom of each side.
  const at = (i) => mean(series.map((f) => f[i]))
  assert.ok(at(30) > at(0) * 1.3 && at(30) > at(59) * 1.3, `top ${at(30).toFixed(1)} vs bottoms ${at(0).toFixed(1)} / ${at(59).toFixed(1)}`)
  // The hot spot sways along the top edge.
  // (a gust dims the top a beat after the sides, so now and then a side is brightest for a moment)
  assert.ok(brightest.filter((k) => k >= 12 && k <= 47).length > brightest.length * 0.9, 'the hot spot left the top')
})
