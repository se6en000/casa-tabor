import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { EventMode } from './eventCommandCenter'
import { inferEventMode } from './eventCommandCenter'

export type PersistedPlanOverrides = {
  verified?: boolean | null
  modeOverride?: EventMode | 'travel' | null
  waits?: boolean | null
  driverOverrides?: Record<number, string>
  twoDriverConfirmed?: boolean
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

function normalizeDriverOverrides(raw: unknown): Record<number, string> {
  if (!raw || typeof raw !== 'object') return {}
  const normalized: Record<number, string> = {}
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0) return
    if (typeof value !== 'string' || value.length === 0) return
    normalized[index] = value
  })
  return normalized
}

function normalizePersistedPlanOverrides(
  payload: PersistedPlanOverrides | null,
  event: EventWithDetails,
): PersistedPlanOverrides | null {
  if (!payload) return null
  if (payload.locationSignature !== locationSignature(event)) return null
  return {
    verified: payload.verified ?? null,
    waits: payload.waits ?? null,
    driverOverrides: normalizeDriverOverrides(payload.driverOverrides),
    modeOverride: payload.modeOverride ?? null,
    twoDriverConfirmed: Boolean(payload.twoDriverConfirmed),
    locationSignature: payload.locationSignature,
  }
}

function getDbPersistedPlanOverrides(event: EventWithDetails): PersistedPlanOverrides | null {
  const row = event.plan_override
  if (!row) return null
  return normalizePersistedPlanOverrides(
    {
      verified: row.verified ?? null,
      waits: row.waits ?? null,
      driverOverrides: normalizeDriverOverrides(row.driver_overrides ?? {}),
      modeOverride: row.mode_override ?? null,
      twoDriverConfirmed: Boolean(row.two_driver_confirmed),
      locationSignature: row.location_signature ?? undefined,
    },
    event,
  )
}

function getLocalPersistedPlanOverrides(event: EventWithDetails): PersistedPlanOverrides | null {
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
    return normalizePersistedPlanOverrides(parsed as PersistedPlanOverrides, event)
  } catch (error) {
    console.warn('eventPlanOverrides: failed to parse persisted plan overrides', error)
    return null
  }
}

export function getPersistedPlanOverrides(event: EventWithDetails): PersistedPlanOverrides {
  return getDbPersistedPlanOverrides(event)
    ?? getLocalPersistedPlanOverrides(event)
    ?? {
      verified: null,
      waits: null,
      driverOverrides: {},
      modeOverride: null,
      twoDriverConfirmed: false,
      locationSignature: undefined,
    }
}

export function getPersistedModeOverride(event: EventWithDetails): EventMode | null {
  const payload = getPersistedPlanOverrides(event)
  return normalizeModeOverride(payload.modeOverride)
}

export function getPersistedDriverOverrideMemberIds(event: EventWithDetails): Set<string> {
  const payload = getPersistedPlanOverrides(event)
  if (!payload.driverOverrides) return new Set<string>()
  const ids = Object.values(payload.driverOverrides).filter((value): value is string => typeof value === 'string' && value.length > 0)
  return new Set(ids)
}

export function resolveEventMode(event: EventWithDetails): EventMode {
  return getPersistedModeOverride(event) ?? inferEventMode(event)
}
