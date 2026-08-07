import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const detailSource = readFileSync(
  new URL('../src/components/calendar/EventDetailPanel.tsx', import.meta.url),
  'utf8',
)
const editSource = readFileSync(
  new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url),
  'utf8',
)

test('Event Details keeps one panel mounted while switching to inline edit mode', () => {
  assert.match(detailSource, /\{event && \(/)
  assert.doesNotMatch(detailSource, /\{event && !showEdit && \(/)
  assert.match(detailSource, /showEdit \?\s*\([\s\S]*?<EventEditSheet[\s\S]*?presentation="inline"/)
  assert.doesNotMatch(detailSource, /\{event && \(\s*<EventEditSheet event=\{event\} open=\{showEdit\}/)
})

test('the editor supports an embedded presentation without its own backdrop or dialog shell', () => {
  assert.match(editSource, /presentation\?: 'sheet' \| 'inline'/)
  assert.match(editSource, /const inline = presentation === 'inline'/)
  assert.match(editSource, /\{!inline && \(\s*<motion\.div[\s\S]*key="edit-backdrop"/)
  assert.match(editSource, /data-inline-event-editor=\{inline \? '' : undefined\}/)
})

test('read mode exposes a labeled Edit action and edit mode owns Save and Cancel', () => {
  assert.match(detailSource, />\s*Edit\s*<\/Button>/)
  assert.match(editSource, /Save changes/)
  assert.match(editSource, />\s*Cancel\s*<\/Button>/)
})

test('outer panel dismissal cannot bypass inline editor dirty-state protection', () => {
  assert.match(detailSource, /const handlePanelClose = useCallback\(\(\) => \{\s*if \(!showEdit\) onClose\(\)\s*\}/)
  assert.match(detailSource, /onClick=\{handlePanelClose\}/)
  assert.match(detailSource, /if \(!showEdit && \(info\.velocity\.y/)
  assert.match(detailSource, /disabled=\{showEdit\}/)
})
