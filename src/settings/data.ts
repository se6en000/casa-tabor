import { createContext, useContext } from 'react'
import type { EmailSettings } from '../wall/useEmailOffers'
import type { MemberWithConnection } from '../hooks/useCalendarConnections'
import type { WallChore } from '../wall/engine/chores'
import type { FamilyMember, SavedPlace } from '../types'
import type { ScreensaverSettings } from '../hooks/useScreensaverSettings'

// Settings V2's data, one source the pages read (canvas 47). The live source (liveSource.ts) is the app's own hooks and
// the server; the fixture (SettingsFixturePage) is fixed data, so every page can be drawn and screenshot-checked.

export interface MemoryItem {
  id: string
  kind: 'fact' | 'thought'
  about_label: string | null
  about_member_id: string | null
  text: string
  confidence: 'sure' | 'not_sure'
  source: string | null
  sensitive: boolean
  created_at: string
}

export interface UsageSummary {
  today: { usd: number; family: number; nightly: number; testing: number; calls: number }
  period_usd: number
  days: Array<{ date: string; family: number; nightly: number; testing: number }>
  features: Array<{ feature: string; usd: number; calls: number }>
  question: { rounds: number; avg_input: number; reused_share: number; avg_usd: number }
  models: Array<{ feature: string; model: string; calls: number }>
  unpriced_calls: number
  maps: { calls: number }
}

export interface HealthSummary {
  breaker: { paused?: boolean; pause_scope?: string | null; pause_until?: string | null; tripped_at?: string | null; trip_reason?: string | null; tripped_by?: string | null; hourly_cost_cap_usd: number; daily_cost_cap_usd: number; auto_trip_enabled?: boolean }
  spend: { hour_cost_usd: number; day_cost_usd: number; hour_calls?: number }
  last_check: { checked_at: string; background_calls: { total: number; errors: number; timeouts: number }; client_errors_last_hour: number } | null
  client_errors: { last_24h: number; last_7d: number }
}

export interface NightlyCheck {
  run_date: string
  kind: 'assistant' | 'screens'
  ok: boolean
  summary: string
  details: Array<{ situation?: string; said?: string; ok?: boolean; problem?: string | null } | string>
  created_at: string
}

export interface DisplayConfigLite {
  brightness_min?: number
  brightness_max?: number
  auto_sleep_enabled?: boolean
  sleep_delay_s?: number
  led_night_glow?: boolean
}

export type SaveResult = { ok: boolean; message?: string }

export interface SettingsSource {
  now: () => Date
  /** The phone/laptop, or the kitchen wall itself (its own screen settings and the wake word live there). */
  onWall: boolean
  useMembers: () => FamilyMember[] | null
  useViewer: () => { id: string | null; name: string | null; token: string | null; signOut: (() => void) | null }
  useFaceId: () => { here: boolean; available: boolean; setUp: (() => Promise<boolean>) | null }
  setCanDrive: (memberId: string, canDrive: boolean) => Promise<SaveResult>
  /** Where every drive starts (settings home_config). */
  useHome: () => string | null
  usePlaces: () => SavedPlace[] | null
  useContacts: () => Array<{ id: string; name: string; relationship: string | null; phone: string | null; place_name: string | null }> | null
  renamePlace: (id: string, name: string) => Promise<SaveResult>
  deletePlace: (id: string) => Promise<SaveResult>
  useConnections: () => MemberWithConnection[] | null
  connectGoogle: (memberId: string) => Promise<void>
  useEmail: () => { data: EmailSettings | null; change: (body: Record<string, unknown>) => Promise<SaveResult> }
  useDisplay: () => { config: DisplayConfigLite | null; save: (patch: DisplayConfigLite) => Promise<SaveResult> }
  useScreen: () => { settings: ScreensaverSettings; update: (patch: Partial<ScreensaverSettings>) => void }
  useMemory: () => { items: MemoryItem[] | null; forget: (id: string) => Promise<SaveResult>; confirm: (id: string) => Promise<SaveResult> }
  usePrivateOnWall: () => [boolean, (hide: boolean) => Promise<SaveResult>]
  useChores: () => { chores: WallChore[] | null; save: (chore: WallChore) => Promise<void>; remove: (id: string) => Promise<void> }
  useKeptCount: () => number
  useUsage: () => UsageSummary | null
  useHealth: () => { summary: HealthSummary | null; setPaused: (paused: boolean) => Promise<SaveResult>; setCaps: (hourly: number, daily: number) => Promise<SaveResult> }
  useChecks: () => NightlyCheck[] | null
  useBugs: () => { open: number; newest: string | null } | null
  run: (job: 'sync_calendars' | 'refresh_wall') => Promise<SaveResult>
}

export const SettingsSourceContext = createContext<SettingsSource | null>(null)

export function useSource(): SettingsSource {
  const source = useContext(SettingsSourceContext)
  if (!source) throw new Error('Settings pages need a SettingsSourceContext.')
  return source
}

/** The people settings shows: the family, not the "Tabor Family" calendar member. */
export const people = (members: FamilyMember[] | null) => (members ?? []).filter((m) => m.name !== 'Tabor Family' && m.show_on_home_sidebar !== false)
