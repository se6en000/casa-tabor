// Shared "meta line" text builders for the Needs You card (Home rail + Action Hub).
// The card's meta row previously showed only an icon-only sourceBadge() with no
// visible text — the approved mockup (needs-you-combined-system-TMP.html) shows a
// short, readable line on every card ("Tomorrow · 3:00 PM", "via email · Jake",
// "Today · 8:30 AM & 12:00 PM", "Auto-detected · needs your review"). This module
// is the single source of truth for that text so both surfaces render it
// identically, the same way prepSourceBadge.ts is the shared source for the icon.
import type { ComponentType } from 'react'
import { format, isToday, isTomorrow } from 'date-fns'
import { Clock, Sparkles } from 'lucide-react'
import { sourceBadge, type PrepSourceBadgeInput } from './prepSourceBadge.ts'
import type { Conflict } from '../types'

type IconComponent = ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>

export interface NeedsYouMetaLine {
  icon: IconComponent
  /** Accessible label for the leading icon (role="img" aria-label/title). */
  label: string
  /** Visible meta text shown next to the icon. */
  text: string
}

function dayLabel(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  return format(date, 'EEE, MMM d')
}

/** "Today · 3:00 PM" / "Tomorrow · 3:00 PM" / "Wed, Aug 12 · 3:00 PM" */
function formatDayAndTime(iso: string): string {
  const date = new Date(iso)
  return `${dayLabel(date)} · ${format(date, 'h:mm a')}`
}

export interface PrepMetaLineInput extends PrepSourceBadgeInput {
  due_by?: string | null
}

/** Regular prep items (bills, reminders, calendar-AI actions, etc). Prefers a due
 * date when one exists; otherwise falls back to "via {source} · {assignee}". */
export function prepMetaLine(item: PrepMetaLineInput, assigneeName?: string | null): NeedsYouMetaLine {
  if (item.due_by) {
    return { icon: Clock, label: 'Due date', text: formatDayAndTime(item.due_by) }
  }
  const source = sourceBadge(item)
  const via = `via ${source.label.toLowerCase()}`
  return { icon: source.icon, label: source.label, text: assigneeName ? `${via} · ${assigneeName}` : via }
}

type ConflictMetaInput = Pick<Conflict, 'event_a' | 'event_b'> | null | undefined

/** "Today · 8:30 AM & 12:00 PM" — day comes from the first available event's start
 * time; falls back to a plain label if neither joined event loaded yet. */
export function conflictMetaLine(conflict: ConflictMetaInput): NeedsYouMetaLine {
  const startTimes = [conflict?.event_a?.start_time, conflict?.event_b?.start_time].filter(
    (value): value is string => Boolean(value),
  )
  if (startTimes.length === 0) {
    return { icon: Clock, label: 'Scheduling conflict', text: 'Scheduling conflict' }
  }
  const day = dayLabel(new Date(startTimes[0]))
  const times = startTimes.map((iso) => format(new Date(iso), 'h:mm a')).join(' & ')
  return { icon: Clock, label: 'Scheduling conflict', text: `${day} · ${times}` }
}

export const directorySuggestionMetaLine: NeedsYouMetaLine = {
  icon: Sparkles,
  label: 'Directory suggestion',
  text: 'Auto-detected · needs your review',
}
