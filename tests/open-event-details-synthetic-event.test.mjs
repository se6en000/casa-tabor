import assert from 'node:assert/strict'
import test from 'node:test'

// Bug (2026-09-23 living-canvas.spec.mjs investigation, confirmed live via
// browser + Playwright trace evidence, not just a test artifact): routine-
// computed "departure" cards (MorningLaunchpadWidget's school drop-offs,
// built by useFamilyRoutineIntelligence.ts when no real calendar row backs
// the milestone) carry a synthetic id like "routine-drop-emme-owen-<date>"
// instead of a real events-table UUID. openEventDetails() only ever
// forwarded the id, so SidecarCompanion's ['event-details', id] query
// fetched nothing, `selectedEvent` stayed null, and its own "nothing
// resolved" effect immediately called closeSidecar() -- a genuine silent
// dead click (confirmed: clicking the card never opened anything visible).
//
// Fix: let callers that already hold the full computed object pass it
// through, so App.tsx's listener can seed the query cache directly and
// skip the (necessarily-failing, for a synthetic id) network fetch --
// mirroring the rollingEvents-first lookup SidecarCompanion.tsx already
// does before falling back to a network call.
//
// document isn't a Node global (this module is browser-only), so this test
// provides the minimal EventTarget-backed stand-in the real DOM's
// addEventListener/dispatchEvent contract needs -- Node's own CustomEvent/
// EventTarget globals (available since Node 19) do the rest.
class FakeDocument extends EventTarget {}
globalThis.document = new FakeDocument()

const { openEventDetails } = await import('../src/utils/openEventDetails.ts')

test('openEventDetails dispatches eventId alone when no event object is given (existing real-event callers)', () => {
  let captured = null
  const handler = (e) => { captured = e.detail }
  document.addEventListener('casa:open-event-details', handler)
  try {
    openEventDetails('real-event-id-123')
  } finally {
    document.removeEventListener('casa:open-event-details', handler)
  }
  assert.deepEqual(captured, { eventId: 'real-event-id-123', event: undefined })
})

test('openEventDetails forwards the full event object when the caller already has one computed locally', () => {
  let captured = null
  const handler = (e) => { captured = e.detail }
  document.addEventListener('casa:open-event-details', handler)
  const syntheticEvent = { id: 'routine-drop-emme-owen-2026-09-23', title: 'Drop off Emme & Owen' }
  try {
    openEventDetails(syntheticEvent.id, syntheticEvent)
  } finally {
    document.removeEventListener('casa:open-event-details', handler)
  }
  assert.deepEqual(captured, { eventId: syntheticEvent.id, event: syntheticEvent })
})
