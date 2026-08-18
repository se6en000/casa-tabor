import { memo, useState } from 'react'
import { CheckCircle2, Clock } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { CalendarEvent } from '../../types'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'

export type ResolvedSyncStatus = 'synced' | 'pending' | 'failed' | 'local_only'

export interface EventSyncStatusDotProps {
  event: CalendarEvent | EventWithDetails
  size?: 'xs' | 'sm' | 'md'
  className?: string
  /** If true, tapping the dot opens sync detail popover/triage instead of bubbling */
  interactive?: boolean
  /** Optional override for sync status */
  statusOverride?: ResolvedSyncStatus
  /** Optional custom click handler */
  onStatusClick?: (status: ResolvedSyncStatus, event: CalendarEvent | EventWithDetails) => void
}

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

export const EventSyncStatusDot = memo(function EventSyncStatusDot({
  event,
  size = 'sm',
  className,
  interactive = true,
  statusOverride,
  onStatusClick,
}: EventSyncStatusDotProps) {
  const status = statusOverride ?? resolveEventSyncStatus(event)
  const [showPopover, setShowPopover] = useState(false)

  const sizeClasses = {
    xs: 'size-1.5',
    sm: 'size-2',
    md: 'size-2.5',
  }[size]

  const hitTargetPadding = {
    xs: 'p-2 -m-2',
    sm: 'p-2.5 -m-2.5',
    md: 'p-3 -m-3',
  }[size]

  function handleClick(e: React.MouseEvent) {
    if (!interactive) return
    e.stopPropagation()
    e.preventDefault()

    if (status === 'failed') {
      // Dispatch custom event for global triage opener or trigger callback
      window.dispatchEvent(
        new CustomEvent('casa:open-sync-triage', {
          detail: { eventId: event.id, event, error: event.google_sync_error },
        }),
      )
    }

    if (onStatusClick) {
      onStatusClick(status, event)
    } else {
      setShowPopover((prev) => !prev)
    }
  }

  // Local only doesn't need to crowd the view unless hovered/interactive
  if (status === 'local_only') {
    return null
  }

  return (
    <span className="relative inline-flex items-center justify-center shrink-0">
      {/* Interactive touch hit-target wrapper (min 44px/48px hit area) */}
      <span
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (interactive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            handleClick(e as unknown as React.MouseEvent)
          }
        }}
        className={cn(
          'inline-flex items-center justify-center rounded-full transition-transform active:scale-90 focus:outline-hidden cursor-pointer select-none',
          hitTargetPadding,
          className,
        )}
        title={getSyncStatusLabel(status)}
        aria-label={getSyncStatusLabel(status)}
      >
        <span
          className={cn(
            'rounded-full border border-white/60 shadow-2xs transition-all duration-200 shrink-0',
            sizeClasses,
            status === 'synced' && 'bg-emerald-500 ring-1 ring-emerald-400/40',
            status === 'pending' && 'bg-amber-500 ring-1 ring-amber-400/60 animate-pulse',
            status === 'failed' && 'bg-rose-500 ring-2 ring-rose-300 ring-offset-1 ring-offset-white animate-bounce',
          )}
        />
      </span>

      {/* Lightweight quick tooltip popover on tap if not a failed status (which opens full triage) */}
      {showPopover && status !== 'failed' && (
        <span
          className="absolute right-0 top-full mt-1 z-50 whitespace-nowrap rounded-lg border border-casa-border/80 bg-casa-surface/95 px-2.5 py-1.5 text-2xs font-semibold text-casa-navy shadow-lg backdrop-blur-sm flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => {
            e.stopPropagation()
            setShowPopover(false)
          }}
        >
          {status === 'synced' && <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />}
          {status === 'pending' && <Clock size={11} className="text-amber-600 shrink-0 animate-spin" />}
          <span>{getSyncStatusLabel(status)}</span>
        </span>
      )}
    </span>
  )
})

export default EventSyncStatusDot
