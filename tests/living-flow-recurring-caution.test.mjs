import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('LivingFlowHeader displays high-visibility caution banner when editing all repeating events', () => {
  const headerPath = resolve('src/components/calendar/living-flow/components/LivingFlowHeader.tsx')
  const content = readFileSync(headerPath, 'utf8')

  assert.match(content, /AlertTriangle/, 'LivingFlowHeader must import AlertTriangle icon')
  assert.match(
    content,
    /recurScope === 'all'/,
    'LivingFlowHeader must check if recurScope is set to all'
  )
  assert.match(
    content,
    /Caution: Changes will apply to all/,
    'LivingFlowHeader must display an explicit caution banner when editing all repeating events'
  )
})
