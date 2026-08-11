import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../src/pages/AISettingsPage.tsx', import.meta.url),
  'utf8',
)

test('AI settings exposes independent collapsible workload controls', () => {
  assert.match(source, /title="Alexa \/ Do"/)
  assert.match(source, /title="Talk & Plan"/)
  assert.match(source, /title="Background"/)
  assert.match(source, /talk_plan_model/)
  assert.match(source, /do_reasoning_preset/)
  assert.match(source, /talk_plan_reasoning_preset/)
  assert.match(source, /background_reasoning_preset/)
})

test('mode checks use the side-effect-free model metadata path', () => {
  assert.match(source, /\.functions\.invoke\('ai-assistant'/)
  assert.match(source, /model_access_check: workload/)
  assert.doesNotMatch(source, /\.functions\.invoke\('generate-briefing'/)
})
