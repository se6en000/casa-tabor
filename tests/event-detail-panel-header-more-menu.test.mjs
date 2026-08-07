import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function read(relPath) {
  return readFileSync(path.join(root, relPath), 'utf8')
}

// Regression: the read-only Event Details header now exposes the same "more
// actions" menu (Ask AI to fill in details / Delete Event) that Edit Details
// already has, positioned to the left of the responsible-person eyebrow label,
// so users don't have to open Edit Details first just to delete an event or
// re-run AI enrichment.

test('EventDetailPanel header renders a more-actions menu with AI and delete entries', () => {
  const src = read('src/components/calendar/EventDetailPanel.tsx')
  assert.match(src, /aria-label="More actions"/, 'PanelHeader should render a More actions trigger')
  assert.match(src, /Ask AI to fill in details/, 'menu should offer to re-run AI enrichment')
  assert.match(src, /Delete \{reminder \? 'Reminder' : 'Event'\}/, 'menu should offer to delete the event/reminder')
})

test('EventDetailPanel wires the more-actions menu into EventEditSheet via onOpenEdit', () => {
  const src = read('src/components/calendar/EventDetailPanel.tsx')
  assert.match(src, /onOpenEdit=\{\(intent\) => \{ setEditIntent\(intent\); setShowEdit\(true\) \}\}/, 'PanelHeader should receive an onOpenEdit callback that opens the editor with an intent')
  assert.match(src, /initialDelete=\{editIntent === 'delete'\}/, 'EventEditSheet should be told to auto-open the delete confirmation when intent is delete')
  assert.match(src, /initialAiTools=\{editIntent === 'ai'\}/, 'EventEditSheet should be told to auto-open the AI tools modal when intent is ai')
})

test('EventEditSheet supports an initialAiTools prop that auto-opens the AI tools modal', () => {
  const src = read('src/components/calendar/EventEditSheet.tsx')
  assert.match(src, /initialAiTools\?:\s*boolean/, 'Props should declare initialAiTools')
  assert.match(src, /if \(!open \|\| !initialAiTools \|\| initialAiToolsOpenedRef\.current\) return/, 'the auto-open effect should guard on initialAiTools and only fire once per open')
  assert.match(src, /setAiToolsModalOpen\(true\)/, 'the effect should open the AI tools modal')
})
