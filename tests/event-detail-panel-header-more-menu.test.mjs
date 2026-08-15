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

test('LivingFlowSidecar renders quick actions for deletion and AI copilot', () => {
  const src = read('src/components/calendar/living-flow/LivingFlowSidecar.tsx')
  assert.match(src, /aria-label="Delete this event"/, 'Sidecar should render a delete trigger')
  assert.match(src, /Ask Copilot about this…/, 'Sidecar should offer Copilot integration')
  assert.match(src, /deleteEvent/, 'Sidecar should bind delete action')
})

test('EventEditSheet supports an initialAiTools prop that auto-opens the AI tools modal', () => {
  const src = read('src/components/calendar/EventEditSheet.tsx')
  assert.match(src, /initialAiTools\?:\s*boolean/, 'Props should declare initialAiTools')
  assert.match(src, /if \(!open \|\| !initialAiTools \|\| initialAiToolsOpenedRef\.current\) return/, 'the auto-open effect should guard on initialAiTools and only fire once per open')
  assert.match(src, /setAiToolsModalOpen\(true\)/, 'the effect should open the AI tools modal')
})
