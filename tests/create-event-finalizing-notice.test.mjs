import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// create_event now fires enrich-event fire-and-forget on the server (see
// tests/dedupe-server-find-similar-wiring.test.mjs), so contact/address
// resolution and logistics happen a few seconds after the event appears —
// the confirmation card should say so instead of implying everything is
// already fully resolved the instant "Create event" is tapped.
const source = readFileSync(
  new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url),
  'utf8',
)

test('create_event success card tells the user details are still finalizing in the background', () => {
  const createEventCard = source.slice(
    source.indexOf("ta.tool === 'create_event' && ta.resultEventId"),
    source.indexOf("ta.tool === 'create_recipe' &&"),
  )
  assert.match(createEventCard, /Visible on your calendar now/)
  assert.match(createEventCard, /[Ff]inaliz/, 'should mention background finalization (contact/address/logistics)')
})
