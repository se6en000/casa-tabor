import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/living-flow/LivingFlowSidecar.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/components/calendar/living-flow/living-flow.css', import.meta.url), 'utf8')

test('the outer living-flow sidecar keeps overflow hidden while body scrolls internally', () => {
  assert.match(source, /living-sidecar-body/)
  assert.match(css, /\.living-flow-sidecar\s*\{[\s\S]*?overflow:\s*hidden/)
  assert.match(css, /\.living-sidecar-body\s*\{[\s\S]*?overflow-y:\s*auto/)
})
