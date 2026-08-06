// Single source of truth for the small icon+label badge shown on every prep-item card
// (Home "Needs You" rail and Action Hub) that indicates where the item came from
// (Gmail scan, calendar AI, manual reminder, etc). Previously each surface hand-rolled
// its own copy of this mapping, which had already drifted (one defaulted unknown/null
// source_type to 'Calendar', the other silently fell through to 'System') — a single
// function is what keeps both surfaces showing the exact same label for the same item.
import type { ComponentType } from 'react'
import { AlertTriangle, Bell, BellOff, Calendar as CalendarIcon, Mail, Sparkles, UserPlus } from 'lucide-react'

type IconComponent = ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>

export interface PrepSourceBadge {
  label: string
  icon: IconComponent
}

/** Matches the shape of a PrepItem without requiring the full type import here. */
export interface PrepSourceBadgeInput {
  source_type?: string | null
}

export function sourceBadge(item: PrepSourceBadgeInput): PrepSourceBadge {
  // Unset/unknown-but-absent source_type defaults to 'calendar_ai' (matches the prior
  // ActionHubPage behavior) — most prep items without an explicit source came from the
  // calendar AI pipeline.
  const source = item.source_type ?? 'calendar_ai'
  if (source === 'reminder_manual') return { label: 'Reminder', icon: Bell }
  if (source === 'reminder_missed') return { label: 'Missed reminder', icon: BellOff }
  if (source === 'gmail') return { label: 'Email', icon: Mail }
  if (source === 'calendar_ai') return { label: 'Calendar', icon: CalendarIcon }
  if (source === 'conflict') return { label: 'Scheduling conflict', icon: AlertTriangle }
  if (source === 'directory_suggestion') return { label: 'Directory suggestion', icon: UserPlus }
  return { label: 'System', icon: Sparkles }
}
