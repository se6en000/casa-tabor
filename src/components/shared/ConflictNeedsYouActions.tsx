/**
 * Phase 2 Needs You inline actions for a scheduling conflict card. Shared by both
 * HomeRightPanel (compact rail) and ActionHubPage (full list) since this is new
 * behavior, not a refactor of two already-diverged card densities — unlike the
 * Phase 0 sourceBadge() extraction, there's no established precedent here for the
 * two surfaces needing different action-row density.
 *
 * Unified action placement (matches the existing prep-item pattern instead of
 * introducing a third layout): the card header owns a top-right icon-button
 * cluster — [Resolved (ShieldCheck, amber-outlined)] + [expand toggle
 * (ChevronDown, rotates open)] — rendered by the parent card, not this
 * component. This component is only the *expanded* panel content, shown below
 * the description when the parent's shared reveal state is open for this item
 * (same spot/toggle prep already uses for its Snooze/Not-relevant row).
 *
 * Picking "Keep this one" resolves the conflict and opens the *other* event's
 * Event Details sheet so the user can reschedule/cancel it right there.
 * "Resolved" (the header's primary icon) acknowledges the conflict as-is — no
 * schedule change — and lives in the header, not here. ShieldCheck (rather
 * than the prep item's solid navy Check) is deliberate: it must never read as
 * "done", since the conflicting events are still both on the calendar.
 */
import { Calendar, Clock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Conflict } from '../../types'
import { useResolveConflict, useSnoozeConflict } from '../../hooks/useConflicts'
import { pickConflictLoserEventId } from '../../utils/conflictResolution'
import { openEventDetails } from '../../utils/openEventDetails'
import { Button } from '../ui'

export default function ConflictNeedsYouActions({ conflict }: { conflict: Conflict }) {
  const resolveConflict = useResolveConflict()
  const snoozeConflict = useSnoozeConflict()

  async function handleKeep(keptEventId: string) {
    const loserEventId = pickConflictLoserEventId(conflict, keptEventId)
    await resolveConflict(conflict.id, `kept_${keptEventId}`)
    if (loserEventId) openEventDetails(loserEventId)
  }

  return (
    <div className="pt-2.5 pl-[2.375rem] space-y-1.5">
      {conflict.event_a && (
        <EventChip
          title={conflict.event_a.title}
          startTime={conflict.event_a.start_time}
          onKeep={() => handleKeep(conflict.event_a!.id)}
        />
      )}
      {conflict.event_b && (
        <EventChip
          title={conflict.event_b.title}
          startTime={conflict.event_b.start_time}
          onKeep={() => handleKeep(conflict.event_b!.id)}
        />
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leadingIcon={<Clock size={14} strokeWidth={2.2} />}
        onClick={() => snoozeConflict(conflict.id)}
      >
        Snooze until tomorrow
      </Button>
    </div>
  )
}

function EventChip({ title, startTime, onKeep }: { title: string; startTime: string; onKeep: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-button border border-casa-border bg-casa-surface px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Calendar size={13} className="shrink-0 text-casa-muted" />
        <span className="truncate text-body-sm font-semibold text-casa-text">{title}</span>
        <span className="shrink-0 text-caption text-casa-muted">{format(parseISO(startTime), 'h:mm a')}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 rounded-full border border-casa-navy bg-casa-surface !text-caption font-bold text-casa-navy hover:bg-casa-navy/5"
        onClick={onKeep}
      >
        Keep this one
      </Button>
    </div>
  )
}
