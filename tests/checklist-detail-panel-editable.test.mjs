import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url), 'utf8')

test('EventDetailPanel renders ChecklistEditor in editable mode', () => {
  assert.match(source, /<ChecklistEditor items=\{event\.checklist\} eventId=\{event\.id\} editable \/>/)
})

test('EventDetailPanel always shows the checklist section so items can be added even when empty', () => {
  const bringStart = source.indexOf('/* ── Bring / Pack ── */')
  const bringEnd = source.indexOf('/* ── Where', bringStart)
  const section = source.slice(bringStart, bringEnd)
  assert.ok(bringStart >= 0 && bringEnd > bringStart, 'expected to find the Bring/Pack section block')
  assert.doesNotMatch(section, /\{hasChecklist &&/, 'checklist section should no longer be gated behind hasChecklist now that items can be added directly')
})

test('What to Bring appears before a collapsed-by-default Where section', () => {
  const bringIndex = source.indexOf('/* ── Bring / Pack ── */')
  const whereIndex = source.indexOf('/* ── Where (map + weather + verify state) ── */')
  const whereBlock = source.slice(whereIndex, source.indexOf('/* ──', whereIndex + 10))

  assert.ok(bringIndex >= 0 && whereIndex > bringIndex)
  assert.match(whereBlock, /<DisclosureSection/)
  assert.match(whereBlock, /defaultOpen=\{false\}/)
  assert.match(whereBlock, /<LocationBlock/)
})
