import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { inferEventMode, inferEventPlanKind } from '../../lib/eventCommandCenter'

export function isHeroTravel(ev: EventWithDetails | null | undefined): boolean {
  if (!ev || ev.all_day || ev.event_type === 'reminder') return false
  const mode = inferEventMode(ev)
  const kind = inferEventPlanKind(ev, mode)
  if (kind !== 'travel') return false
  const loc = (ev.location_name || '').trim().toLowerCase()
  if (loc === 'home' || loc.includes('at home')) return false
  return Boolean(
    (ev.address && ev.address.trim().length > 0) ||
    (ev.location_name && ev.location_name.trim().length > 0)
  )
}
