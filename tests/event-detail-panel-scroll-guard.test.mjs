import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/living-flow/LivingFlowSidecar.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/components/calendar/living-flow/living-flow.css', import.meta.url), 'utf8')

// Header and footer were pinned flex siblings around an independently
// scrolling body until 2026-09-15, when the user asked for them to scroll
// away with everything else instead of staying fixed -- the whole panel is
// now one continuous scroll region.
test('the whole living-flow sidecar scrolls as one region, not just an inner body', () => {
  assert.match(source, /living-sidecar-body/)
  assert.match(css, /\.living-flow-sidecar\s*\{[\s\S]*?overflow-y:\s*auto/)
  assert.doesNotMatch(css, /\.living-sidecar-body\s*\{[\s\S]*?overflow-y:\s*auto/)
})
