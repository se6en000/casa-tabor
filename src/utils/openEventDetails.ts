import type { EventWithDetails } from '../hooks/useCalendarEvents'

/**
 * Opens the Event Details sheet or focuses Copilot for an existing event from anywhere in the app.
 * App.tsx listens for this globally and handles Copilot Focus Swap if AI drawer is open.
 *
 * `event`, when the caller already has the full object in hand, lets App.tsx's
 * listener seed the sidecar's query cache directly instead of re-fetching by
 * id -- required for routine-computed cards (school drop-offs synthesized by
 * useFamilyRoutineIntelligence.ts when no real calendar row exists yet) whose
 * id isn't a real events-table row the network fetch could ever find.
 */
export function openEventDetails(eventId: string, event?: EventWithDetails) {
  document.dispatchEvent(new CustomEvent('casa:open-event-details', { detail: { eventId, event } }))
}
