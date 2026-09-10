import type { CalendarEvent } from '../../types'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'

export type ResolvedSyncStatus = 'synced' | 'pending' | 'failed' | 'local_only'

export function resolveEventSyncStatus(event: CalendarEvent | EventWithDetails): ResolvedSyncStatus {
  // Reminders stay in Casa only
  if (event.event_type === 'reminder') {
    return 'local_only'
  }

  // Explicit sync status from backend / local state
  if (event.google_sync_status) {
    if (event.google_sync_status === 'failed') return 'failed'
    if (
      event.google_sync_status === 'pending' ||
      event.google_sync_status === 'queued' ||
      event.google_sync_status === 'retrying'
    ) {
      return 'pending'
    }
    if (event.google_sync_status === 'synced') return 'synced'
    if (event.google_sync_status === 'local_only' || event.google_sync_status === 'not_synced') {
      return 'local_only'
    }
  }

  // Fallback: If it has a Google Event ID, it's synced
  if (event.google_event_id) {
    return 'synced'
  }

  // If no Google ID and event is confirmed, it is in transit/pending
  return 'pending'
}

export function getSyncStatusLabel(status: ResolvedSyncStatus): string {
  switch (status) {
    case 'synced':
      return 'Synced to Google Calendar'
    case 'pending':
      return 'Syncing to Google Calendar…'
    case 'failed':
      return 'Sync failed · Tap for Action Center Triage'
    case 'local_only':
      return 'Casa household item (Not synced to Google)'
  }
}
