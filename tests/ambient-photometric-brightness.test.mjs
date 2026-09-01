import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mainPyPath = new URL('../pi/sensor-bridge/main.py', import.meta.url).pathname
const settingsHookSource = readFileSync(
  new URL('../src/hooks/useScreensaverSettings.ts', import.meta.url),
  'utf8',
)
const settingsPageSource = readFileSync(
  new URL('../src/pages/ArtModeSettingsPage.tsx', import.meta.url),
  'utf8',
)

function evaluatePyBrightness(lux, artMode = false, dimOffset = 0.0) {
  const script = `
import sys
sys.path.insert(0, '/Users/taboj/Public/casa-tabor/pi/sensor-bridge')
import main

main._art_mode_active = ${artMode ? 'True' : 'False'}
main._art_dim_offset = ${dimOffset}
print(main.lux_to_brightness(${lux}))
`
  const output = execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim()
  return parseInt(output, 10)
}

test('Frontend UI StepPicker allows full 0% to 90% range for Dim below ambient', () => {
  assert.match(settingsHookSource, /artDimOffset:\s*number\s*\/\/\s*how much dimmer than ambient lux in art mode \(0–90/)
  assert.match(settingsPageSource, /min=\{0\}\s*max=\{90\}\s*step=\{5\}\s*unit="%"/)
})

test('pi/sensor-bridge main.py sets BRIGHTNESS_MIN_DEFAULT to 0 for true dark floor', () => {
  const mainPySource = readFileSync(mainPyPath, 'utf8')
  assert.match(mainPySource, /BRIGHTNESS_MIN_DEFAULT\s*=\s*0/)
  assert.match(mainPySource, /LUX_MIN_NIGHT\s*=\s*0\.05/)
})

test('lux_to_brightness reaches DDC 0 in near pitch-black rooms (<= 0.1 lux)', () => {
  const pitchDarkActive = evaluatePyBrightness(0.05, false, 0.0)
  const pitchDarkArt30 = evaluatePyBrightness(0.05, true, 0.30)
  const pitchDarkArt50 = evaluatePyBrightness(0.05, true, 0.50)
  const pitchDarkArt80 = evaluatePyBrightness(0.05, true, 0.80)

  assert.equal(pitchDarkActive, 0)
  assert.equal(pitchDarkArt30, 0)
  assert.equal(pitchDarkArt50, 0)
  assert.equal(pitchDarkArt80, 0)

  const faintLedArt50 = evaluatePyBrightness(0.10, true, 0.50)
  assert.equal(faintLedArt50, 0)
})

test('lux_to_brightness is strictly monotonic with ambient lux in both active and art modes', () => {
  const luxValues = [0.05, 0.1, 0.5, 2.0, 10.0, 50.0, 150.0, 400.0, 800.0]

  let prevActive = -1
  let prevArt50 = -1

  for (const lx of luxValues) {
    const act = evaluatePyBrightness(lx, false, 0.0)
    const art50 = evaluatePyBrightness(lx, true, 0.50)

    assert.ok(act >= prevActive, `Active brightness should not decrease with rising lux: ${act} < ${prevActive} at ${lx} lx`)
    assert.ok(art50 >= prevArt50, `Art brightness should not decrease with rising lux: ${art50} < ${prevArt50} at ${lx} lx`)
    assert.ok(art50 <= act, `Art mode should be <= active mode at all times: ${art50} > ${act} at ${lx} lx`)

    prevActive = act
    prevArt50 = art50
  }
})

test('Daylight ratio preservation: 50% dim does not over-crush into darkness in bright sunlight', () => {
  const dayActive = evaluatePyBrightness(800.0, false, 0.0)
  const dayArt30 = evaluatePyBrightness(800.0, true, 0.30)
  const dayArt50 = evaluatePyBrightness(800.0, true, 0.50)

  assert.equal(dayActive, 90)
  assert.ok(dayArt30 >= 38 && dayArt30 <= 45, `Day Art 30% should be around 41 DDC, got ${dayArt30}`)
  assert.ok(dayArt50 >= 18 && dayArt50 <= 25, `Day Art 50% should be around 20 DDC, got ${dayArt50}`)
})

test('Evening lamp light: 50% dim maintains natural soft wall art feel', () => {
  const eveningActive = evaluatePyBrightness(50.0, false, 0.0)
  const eveningArt30 = evaluatePyBrightness(50.0, true, 0.30)
  const eveningArt50 = evaluatePyBrightness(50.0, true, 0.50)

  assert.ok(eveningActive >= 50 && eveningActive <= 62, `Evening active expected ~57 DDC, got ${eveningActive}`)
  assert.ok(eveningArt30 >= 22 && eveningArt30 <= 30, `Evening Art 30% expected ~26 DDC, got ${eveningArt30}`)
  assert.ok(eveningArt50 >= 10 && eveningArt50 <= 16, `Evening Art 50% expected ~12 DDC, got ${eveningArt50}`)
})
