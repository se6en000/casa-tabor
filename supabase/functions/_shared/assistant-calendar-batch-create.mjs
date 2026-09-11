import { assessCalendarCreatePreflight } from './assistant-calendar-create-preflight.mjs'

// Enriches a list of proposed calendar-event candidates (from a multi-event
// text request or a scanned flyer -- see the 2026-09-11 design discussion,
// both produce this same candidate-list shape) with a per-candidate
// duplicate check against real existing events. Reuses the exact dedupe
// logic a single create already runs, checked independently per candidate,
// so one candidate's duplicate status never affects another's.
export function enrichBatchCandidates(candidates, existingEvents) {
  const events = Array.isArray(existingEvents) ? existingEvents : []
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const eventType = candidate?.eventType === 'reminder' ? 'reminder' : 'event'
    const preflight = assessCalendarCreatePreflight(events, {
      title: candidate?.title,
      start: candidate?.start,
      end: candidate?.end,
      event_type: eventType,
      members: candidate?.members,
    })
    return {
      ...candidate,
      eventType,
      duplicate: preflight.status === 'clear' ? null : preflight,
    }
  })
}
