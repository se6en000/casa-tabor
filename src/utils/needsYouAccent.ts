// Coarse 3-icon accent system for the Needs You card's left icon slot (Home rail
// and Action Hub). Deliberately distinct from sourceBadge() in prepSourceBadge.ts,
// which still renders the fine-grained per-source icon (Mail/Bell/Calendar/etc) in
// the meta row — this is a *category*-level classifier used for at-a-glance kiosk
// scanning, not a replacement for that detail.
//
// Only 3 buckets on purpose (see needs-you-icon-system-TMP.html "Option A"): category
// detail is already conveyed by the card text and Action Hub's existing filter chips,
// so a 9+ icon system (one per prepCategories.ts entry) would add visual noise without
// adding scannable information.
import type { ComponentType } from 'react'
import { CalendarX2, ClipboardList, UserPlus } from 'lucide-react'

type IconComponent = ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>

export interface NeedsYouAccent {
  icon: IconComponent
  label: string
  bgClass: string
  textClass: string
}

export interface NeedsYouAccentInput {
  source_type?: string | null
}

export function needsYouAccent(item: NeedsYouAccentInput): NeedsYouAccent {
  if (item.source_type === 'conflict') {
    return { icon: CalendarX2, label: 'Scheduling conflict', bgClass: 'bg-casa-error/10', textClass: 'text-casa-error' }
  }
  if (item.source_type === 'directory_suggestion') {
    return { icon: UserPlus, label: 'Directory suggestion', bgClass: 'bg-casa-success-soft', textClass: 'text-casa-success-strong' }
  }
  return { icon: ClipboardList, label: 'Prep item', bgClass: 'bg-casa-accent-soft', textClass: 'text-content-heading' }
}
