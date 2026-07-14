import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const assistant = readFileSync(
  new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
  'utf8',
)

test('production shadow planning is settings-gated and sampled', () => {
  assert.match(assistant, /agent_shadow_config/)
  assert.match(assistant, /enabled === true/)
  assert.match(assistant, /Math\.random\(\) < agentShadowRate/)
  assert.match(assistant, /!dryRun/)
})

test('production shadow planning is non-blocking and cannot replace authoritative results', () => {
  assert.match(assistant, /EdgeRuntime\.waitUntil\(shadowPromise\)/)
  assert.match(assistant, /sb\.functions\.invoke\('ai-agent-shadow'/)
  assert.doesNotMatch(
    assistant,
    /const\s+(?:result|response|payload)\s*=\s*await\s+sb\.functions\.invoke\('ai-agent-shadow'/,
  )
})

test('production shadow context carries authoritative versions and pending capability state', () => {
  assert.match(assistant, /version: event\.updated_at/)
  assert.match(assistant, /recurring: Boolean/)
  assert.match(assistant, /getAgentToolByLegacyName/)
  assert.match(assistant, /authoritativeEntities/)
  assert.match(assistant, /activeEntity/)
})
