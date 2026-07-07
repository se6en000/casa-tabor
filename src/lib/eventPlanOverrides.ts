import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { EventMode } from './eventCommandCenter'
import { inferEventMode } from './eventCommandCenter'

type PersistedPlanOverrides = {
  modeOverride?: EventMode | 'travel' | null
  locationSignature?: string
}

const PANEL_OVERRIDES_KEY_PREFIX = 'event-command-center-overrides:v1'

export function overridesStorageKey(eventId: string): string {
  return `${PANEL_OVERRIDES_KEY_PREFIX}:${eventId}`
}

export function locationSignature(event: EventWithDetails): string {
  return [
    event.location_name?.trim().toLowerCase() ?? '',
    event.address?.trim().toLowerCase() ?? '',
    event.lat ?? '',
    event.lng ?? '',
  ].join('|')
}

function normalizeModeOverride(mode: PersistedPlanOverrides['modeOverride']): EventMode | null {
  if (mode === 'travel') return 'appointment'
  return mode ?? null
}

export function getPersistedModeOverride(event: EventWithDetails): EventMode | null {
  if (typeof window === 'undefined') return null

  const raw = (() => {
    try {
      return window.localStorage.getItem(overridesStorageKey(event.id))
    } catch (error) {
      console.warn('eventPlanOverrides: failed to read persisted plan overrides', error)
      return null
    }
  })()
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const payload = parsed as PersistedPlanOverrides
    if (payload.locationSignature !== locationSignature(event)) return null
    return normalizeModeOverride(payload.modeOverride)
  } catch (error) {
    console.warn('eventPlanOverrides: failed to parse persisted plan overrides', error)
    return null
  }
}

export function resolveEventMode(event: EventWithDetails): EventMode {
  return getPersistedModeOverride(event) ?? inferEventMode(event)
}
