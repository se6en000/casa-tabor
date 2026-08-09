import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const detailPanel = readFileSync(new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url), 'utf8')
const editSheet = readFileSync(new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url), 'utf8')
const checklist = readFileSync(new URL('../src/components/calendar/ChecklistEditor.tsx', import.meta.url), 'utf8')

test('transportation and attendee mutations publish aggregate patches', () => {
  assert.match(detailPanel, /publishEventAggregatePatch/)
  assert.match(detailPanel, /plan_override:/)
  assert.match(detailPanel, /members: nextMembers/)
})

test('event title and time saves publish aggregate patches', () => {
  assert.match(editSheet, /publishEventAggregatePatch/)
  assert.match(editSheet, /title: titleToSave/)
  assert.match(editSheet, /start_time: masterStart/)
})

test('checklist add, remove, and toggle mutations publish aggregate patches', () => {
  assert.match(checklist, /publishEventAggregatePatch/)
  assert.match(checklist, /checklist:/)
})
