/**
 * Phase 2 Needs You inline actions for a scheduling conflict card. Shared by both
 * HomeRightPanel (compact rail) and ActionHubPage (full list) since this is new
 * behavior, not a refactor of two already-diverged card densities — unlike the
 * Phase 0 sourceBadge() extraction, there's no established precedent here for the
 * two surfaces needing different action-row density.
 *
 * Staged flow (user-approved design, see needs-you-phase2-actions-TMP.html):
 *   Step 1 (landing): "View both" / "Resolved" / icon-only Snooze.
 *   Step 2 (after "View both"): both events as chips, each with "Keep this one".
 *     Picking one calls resolveConflict() and opens the *other* event's Event
 *     Details sheet so the user can reschedule/cancel it right there.
 *   "Resolved" from Step 1 acknowledges the conflict as-is — no schedule change.
 */
import { useState } from 'react'
import { Calendar, Check, ChevronDown, Clock, Eye } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Conflict } from '../../types'
import { useResolveConflict, useSnoozeConflict } from '../../hooks/useConflicts'
import { pickConflictLoserEventId } from '../../utils/conflictResolution'
import { openEventDetails } from '../../utils/openEventDetails'
import { Button, IconButton } from '../ui'

export default function ConflictNeedsYouActions({ conflict }: { conflict: Conflict }) {
  const [expanded, setExpanded] = useState(false)
  const resolveConflict = useResolveConflict()
  const snoozeConflict = useSnoozeConflict()

  async function handleKeep(keptEventId: string) {
    const loserEventId = pickConflictLoserEventId(conflict, keptEventId)
    await resolveConflict(conflict.id, `kept_${keptEventId}`)
    if (loserEventId) openEventDetails(loserEventId)
  }

  if (!expanded) {
    return (
      <div className="flex items-center gap-2 pt-2.5 pl-[2.375rem]">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<Eye size={14} strokeWidth={2.2} />}
          onClick={() => setExpanded(true)}
        >
          View both
        </Button>
        <Button
          type="button"
          variant="strong"
          size="sm"
          leadingIcon={<Check size={14} strokeWidth={2.5} />}
          onClick={() => resolveConflict(conflict.id, 'acknowledged_no_change')}
        >
          Resolved
        </Button>
        <IconButton
          onClick={() => snoozeConflict(conflict.id)}
          variant="ghost"
          size="sm"
          icon={<Clock size={15} strokeWidth={2.2} />}
          aria-label="Snooze until tomorrow"
          title="Snooze until tomorrow"
        />
      </div>
    )
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
        variant="ghost"
        size="sm"
        leadingIcon={<ChevronDown size={14} className="rotate-180" />}
        onClick={() => setExpanded(false)}
      >
        Collapse
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
        className="shrink-0 rounded-full border border-casa-gold/45 bg-casa-gold/15 !text-caption font-bold text-casa-navy hover:bg-casa-gold/25"
        onClick={onKeep}
      >
        Keep this one
      </Button>
    </div>
  )
}
