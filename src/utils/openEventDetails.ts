/**
 * Opens the Event Details sheet or focuses Copilot for an existing event from anywhere in the app.
 * App.tsx listens for this globally and handles Copilot Focus Swap if AI drawer is open.
 */
export function openEventDetails(eventId: string) {
  document.dispatchEvent(new CustomEvent('casa:open-event-details', { detail: { eventId } }))
}

