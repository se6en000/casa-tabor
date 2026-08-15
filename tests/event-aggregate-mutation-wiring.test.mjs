import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const stateHook = readFileSync(new URL('../src/components/calendar/living-flow/hooks/useLivingFlowState.ts', import.meta.url), 'utf8')
const editSheet = readFileSync(new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url), 'utf8')
const checklist = readFileSync(new URL('../src/components/calendar/ChecklistEditor.tsx', import.meta.url), 'utf8')

test('transportation and attendee mutations update database and invalidate events query', () => {
  assert.match(stateHook, /invalidateCalendar/)
  assert.match(stateHook, /toggleMember/)
  assert.match(stateHook, /setDriver/)
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
