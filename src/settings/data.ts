import { createContext, useContext } from 'react'
import type { EmailSettings } from '../wall/useEmailOffers'
import type { MemberWithConnection } from '../hooks/useCalendarConnections'
import type { WallChore } from '../wall/engine/chores'
import type { FamilyMember, SavedPlace } from '../types'
import type { ScreensaverSettings } from '../hooks/useScreensaverSettings'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { Arrangement, BugSeverity, BugStatus } from './model'
import type { DayOffRow } from '../wall/RoutineEditor'

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
  details: Array<{ situation?: string; said?: string; ok?: boolean; problem?: string | null; got?: { text?: string; tool?: string | null; ms?: number; args?: Record<string, unknown> } } | string>
  created_at: string
}

/** One report in the bug box (ai_bug_reports): from the phone's bug icon, the wall's, or said to the assistant. */
export interface BugReport {
  id: string
  title: string
  details: string | null
  severity: BugSeverity
  status: BugStatus
  source: string
  created_at: string
  member_name: string | null
  page: string | null
  /** The conversation it was sent from (the bug icon sends it). */
  transcript: Array<{ role?: string; text?: string; at?: string }> | null
}
export type BugPatch = Partial<Pick<BugReport, 'title' | 'details' | 'severity' | 'status'>>

export interface DisplayConfigLite {
  brightness_min?: number
  brightness_max?: number
  /** The Pi sleeps the screen when the room is darker than this, and wakes it when brighter than wake. */
  sleep_lux_threshold?: number
  wake_lux_threshold?: number
  /** While "Follow the room's light" is off: the range it had, to go back to. */
  follow_room_backup?: { min: number; max: number } | null
  auto_sleep_enabled?: boolean
  sleep_delay_s?: number
  led_night_glow?: boolean
  /** How far under the room's light the wall sits, 0–0.9 (the Pi's "below the room"; 0.30 when unset). */
  room_dim_strength?: number
  /** The colour shift toward the room's light: 0 = true to it, 0.4 = softened. */
  color_soften?: number
}

export type SaveResult = { ok: boolean; message?: string }

export type MemberPatch = Partial<Pick<FamilyMember, 'name' | 'full_name' | 'nicknames' | 'role' | 'can_drive' | 'show_on_home_sidebar'>>

/** What the wall's sensor measured and what the screen was set to (the Pi's bridge; Settings › The wall). */
export interface LightReading { at: string; cct: number | null; lux: number | null; brightness: number | null; rgb: number[] | null; display_on: boolean | null }

export interface CalendarChoice { id: string; summary: string; color: string | null; primary: boolean }

export interface SettingsSource {
  now: () => Date
  /** The phone/laptop, or the kitchen wall itself (its own screen settings and the wake word live there). */
  onWall: boolean
  useMembers: () => FamilyMember[] | null
  useViewer: () => { id: string | null; name: string | null; token: string | null; signOut: (() => void) | null }
  useFaceId: () => { here: boolean; available: boolean; setUp: (() => Promise<boolean>) | null }
  /** Changing people (Settings › Family): fields, a new person, colours and order; the family list refreshes after. */
  useMemberEdits: () => {
    update: (memberId: string, patch: MemberPatch) => Promise<SaveResult>
    add: (name: string, role: FamilyMember['role'], canDrive: boolean) => Promise<SaveResult>
    arrange: (changes: Arrangement[]) => Promise<SaveResult>
  }
  /** Where every drive starts (settings home_config). */
  useHome: () => string | null
  usePlaces: () => SavedPlace[] | null
  useContacts: () => Array<{ id: string; name: string; relationship: string | null; phone: string | null; place_name: string | null }> | null
  renamePlace: (id: string, name: string) => Promise<SaveResult>
  /** A place found in an email or an event, kept (confirmed) or put away (dismissed). */
  keepPlace: (id: string) => Promise<SaveResult>
  dismissPlace: (id: string) => Promise<SaveResult>
  deletePlace: (id: string) => Promise<SaveResult>
  useConnections: () => MemberWithConnection[] | null
  connectGoogle: (memberId: string) => Promise<void>
  /** A person's Google calendars: the one we write to, and which others are read onto the family calendar. */
  useCalendarChoices: (memberId: string | null) => { calendars: CalendarChoice[] | null; readIds: string[]; writeId: string | null; save: (readIds: string[]) => Promise<SaveResult> }
  /** Whose email the email reader reads (Google connection's Gmail switch). */
  useEmailReaders: () => { on: Record<string, boolean> | null; set: (memberId: string, on: boolean) => Promise<SaveResult> }
  useEmail: () => { data: EmailSettings | null; change: (body: Record<string, unknown>) => Promise<SaveResult> }
  useDisplay: () => { config: DisplayConfigLite | null; save: (patch: DisplayConfigLite) => Promise<SaveResult> }
  useScreen: () => { settings: ScreensaverSettings; update: (patch: Partial<ScreensaverSettings>) => void }
  /** Right now (live on the wall itself; else the last five-minute sample) and the last 24 hours. */
  useWallLight: () => { now: LightReading | null; today: LightReading[] | null }
  useMemory: () => { items: MemoryItem[] | null; forget: (id: string) => Promise<SaveResult>; confirm: (id: string) => Promise<SaveResult> }
  usePrivateOnWall: () => [boolean, (hide: boolean) => Promise<SaveResult>]
  useChores: () => { chores: WallChore[] | null; save: (chore: WallChore) => Promise<void>; remove: (id: string) => Promise<void> }
  useKeptCount: () => number
  /** Everyone's routines — school, work, camp — with their days off (the wall's school runs). */
  useRoutines: () => {
    items: Array<{ routine: FamilyRoutine; person: FamilyMember }> | null
    dayOffs: (memberId: string) => DayOffRow[]
    save: (routine: FamilyRoutine, offs: { add: string[]; remove: string[] }) => Promise<void>
    remove: (routine: FamilyRoutine) => Promise<void>
  }
  /** The last things the assistant heard, family only (no test runs). */
  useVoiceTurns: () => Array<{ at: string; text: string; page: string | null }> | null
  useUsage: () => UsageSummary | null
  useHealth: () => { summary: HealthSummary | null; setPaused: (paused: boolean) => Promise<SaveResult>; setCaps: (hourly: number, daily: number) => Promise<SaveResult> }
  useChecks: () => NightlyCheck[] | null
  useBugs: () => { open: number; newest: string | null } | null
  /** Every report, open ones first (most urgent, then newest); edit, close or delete one. */
  useBugBox: () => { bugs: BugReport[] | null; edit: (id: string, patch: BugPatch) => Promise<SaveResult>; remove: (id: string) => Promise<SaveResult> }
  run: (job: 'sync_calendars' | 'refresh_wall') => Promise<SaveResult>
  /** Jake's PIN, checked (Advanced on the wall asks each visit, whoever the kiosk is signed in as). */
  checkOwnerPin: (ownerId: string, pin: string) => Promise<boolean>
  /** The wall's own hardware (the Pi's bridges, only reachable on the wall itself). */
  useWallHardware: () => { sensorOk: boolean | null; listener: 'ready' | 'busy' | 'off' | null; wakeScore: number | null; panel: { min: number; max: number } | null }
  wallDo: (job: 'test_light' | 'calibrate_panel' | 'reload_here' | { wakeScore: number }) => Promise<SaveResult>
}

export const SettingsSourceContext = createContext<SettingsSource | null>(null)

export function useSource(): SettingsSource {
  const source = useContext(SettingsSourceContext)
  if (!source) throw new Error('Settings pages need a SettingsSourceContext.')
  return source
}

/** The people settings shows: the family, not the "Tabor Family" calendar member. */
const byOrder = (a: FamilyMember, b: FamilyMember) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name)
export const people = (members: FamilyMember[] | null) => (members ?? []).filter((m) => m.name !== 'Tabor Family' && m.show_on_home_sidebar !== false).sort(byOrder)
/** Everyone a profile can be opened for, on the wall or not (pets, someone switched off), without the mailbox. */
export const everyone = (members: FamilyMember[] | null) => (members ?? []).filter((m) => m.name !== 'Tabor Family').sort(byOrder)
