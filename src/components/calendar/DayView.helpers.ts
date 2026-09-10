import type { EventWithDetails } from '../../hooks/useCalendarEvents'

export const SHARED_GOLD = 'var(--color-casa-gold)'

export function eventColor(ev: EventWithDetails): string {
  if (!ev.members || ev.members.length === 0) return SHARED_GOLD
  if (ev.members.length >= 4) return SHARED_GOLD
  return ev.members[0].family_member?.color_hex ?? SHARED_GOLD
}
