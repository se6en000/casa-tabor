import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url), 'utf8')

test('EventDetailPanel renders ChecklistEditor in editable mode', () => {
  assert.match(source, /<ChecklistEditor items=\{event\.checklist\} eventId=\{event\.id\} editable \/>/)
})

test('EventDetailPanel always shows the checklist section so items can be added even when empty', () => {
  const section = source.match(/\{\/\* ── Bring \/ Pack ── \*\/\}[\s\S]*?<\/section>\s*\)\}/)
  assert.ok(section, 'expected to find the Bring/Pack section block')
  assert.doesNotMatch(section[0], /\{hasChecklist &&/, 'checklist section should no longer be gated behind hasChecklist now that items can be added directly')
})
