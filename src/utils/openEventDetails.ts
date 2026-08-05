/**
 * Opens the Event Details sheet for an existing event from anywhere in the app,
 * without going through the AI chat drawer. App.tsx listens for this globally.
 */
export function openEventDetails(eventId: string) {
  document.dispatchEvent(new CustomEvent('casa:open-event-details', { detail: { eventId } }))
}
