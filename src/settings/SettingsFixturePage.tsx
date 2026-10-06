import { useMemo, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SettingsRoot from './SettingsRoot'
import { liveSource } from './liveSource'
import type { LightReading, MemoryItem, NightlyCheck, SettingsSource, UsageSummary } from './data'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { FamilyMember, SavedPlace } from '../types'
import type { MemberWithConnection } from '../hooks/useCalendarConnections'
import type { WallChore } from '../wall/engine/chores'
import { SCREENSAVER_DEFAULTS, type ScreensaverSettings } from '../hooks/useScreensaverSettings'

// /__settings-fixture (visual-test builds only): Settings V2 with fixed data, so every page is drawn and checked.
//   ?page=family|…|maintenance  ?wall=1 (the kitchen wall's size)  ?viewer=kelly (not Jake: Advanced is closed)
//   ?live=<member id> reads the real data instead (a developer's check; see below).

const NOW = new Date('2026-10-06T08:40:00-04:00')
const at = (iso: string) => new Date(iso).toISOString()

const member = (id: string, name: string, role: FamilyMember['role'], sort: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, full_name: null, role, color_hex: '', color_name: '', phone: null, email: null, google_calendar_id: null, can_drive: role !== 'child',
  availability_mode: 'flexible', show_on_home_sidebar: true, is_admin: role === 'parent', avatar_url: null, sort_order: sort, created_at: at('2026-01-01T00:00:00Z'), updated_at: at('2026-01-01T00:00:00Z'), ...extra,
})
const MEMBERS: FamilyMember[] = [
  member('jake', 'Jake', 'parent', 1, { full_name: 'Jake Tabor' }), member('kelly', 'Kelly', 'parent', 2), member('liv', 'Liv', 'child', 3), member('emme', 'Emme', 'child', 4),
  member('family', 'Tabor Family', 'child', 5, { show_on_home_sidebar: false }), member('owen', 'Owen', 'child', 5), member('giselle', 'Giselle', 'caregiver', 7),
  member('milo', 'Milo', 'child', 9, { show_on_home_sidebar: false }),
]
const place = (id: string, name: string, category: SavedPlace['category'], address: string, city = 'West Palm Beach'): SavedPlace => ({
  id, name, aliases: [], address, city, state: 'FL', zip: null, lat: null, lng: null, category, notes: null, phone: null, google_place_id: null, confirmed: true,
} as unknown as SavedPlace)
const PLACES = [
  place('p1', 'Lake Lytal Park', 'sports' as SavedPlace['category'], '3645 Gun Club Rd'), place('p2', 'Palm Beach Public Elementary', 'school' as SavedPlace['category'], '239 Cocoanut Row', 'Palm Beach'),
  place('p3', 'John S. Ledakis, DDS', 'medical' as SavedPlace['category'], '4512 N Flagler Dr'), place('p4', 'Cox Science Center and Aquarium', 'other' as SavedPlace['category'], '4801 Dreher Trail N'),
  place('p5', 'Dragon Elites batting cages', 'sports' as SavedPlace['category'], '1225 S Military Trail'),
  { ...place('p6', 'Pet Supermarket on Dixie', 'other' as SavedPlace['category'], '2501 N Dixie Hwy'), confirmed: false } as SavedPlace,
]
/** A day of the wall's light: cool and bright at midday, warm and dim at night (5-minute samples). */
const LIGHT: LightReading[] = Array.from({ length: 24 * 12 }, (_, i) => {
  const t = new Date(NOW.getTime() - (24 * 12 - 1 - i) * 5 * 60_000)
  const h = t.getHours() + t.getMinutes() / 60
  const day = Math.max(0, Math.sin(((h - 6.5) / 13) * Math.PI))
  const lamp = h >= 18 && h < 23 ? 0.35 : 0
  const lux = Math.round((day * 420 + lamp * 90 + 0.6) * 10) / 10
  const cct = Math.round(lamp && day < 0.2 ? 2900 : 3200 + day * 2600)
  const brightness = Math.round(Math.min(50, 4 + Math.log10(lux + 1) * 17))
  const g = Math.round(50 - (6500 - cct) / 260), b = Math.round(50 - (6500 - cct) / 150)
  return { at: t.toISOString(), cct, lux, brightness, rgb: [50, g, b], display_on: !(h >= 23.5 || h < 6) }
})
const ROUTINE = (memberId: string, title: string, venue: string, start: string, end: string, drop: string, pick: string): FamilyRoutine => ({
  id: `r-${memberId}`, key: 'main', memberId, title, routineType: 'school', venueName: venue, venueAddress: '', daysOfWeek: [1, 2, 3, 4, 5], startLocal: start, endLocal: end,
  dropoffDriverName: drop, dropoffDriverId: drop.toLowerCase(), pickupDriverName: pick, pickupDriverId: pick.toLowerCase(), enabled: true, startDate: '2026-08-10', endDate: '2027-05-28',
})
const CONTACTS = [
  { id: 'c1', name: 'Coach Salas', relationship: 'Liv’s softball coach', phone: '(561) 555-0142', place_name: 'Lake Lytal Park' },
  { id: 'c2', name: 'Dr. Ledakis', relationship: 'Dentist', phone: '(561) 555-0199', place_name: 'John S. Ledakis, DDS' },
  { id: 'c3', name: 'Towhid Nishat', relationship: 'Owen’s therapist', phone: null, place_name: 'Hope Center ABA' },
]
const conn = (m: FamilyMember, email: string | null, extra: object = {}): MemberWithConnection => ({
  ...m, connection: email ? {
    family_member_id: m.id, google_email: email, connected_at: at('2026-05-01T00:00:00Z'), last_sync_at: at('2026-10-06T08:36:00-04:00'), last_sync_error: null, connection_id: 'x', calendar_id: 'x',
    access_mode: 'writable', adoption_policy: 'automatic', is_enabled: true, health_status: 'healthy', health_checked_at: null, last_success_at: null, last_error_at: null, last_error_code: null,
    reauthorization_required: false, read_calendar_metadata: [{ id: 'a', summary: `${m.name}` }], ...extra,
  } : null,
})
const MEM = (id: string, text: string, who: string | null, sure: boolean, extra: Partial<MemoryItem> = {}): MemoryItem => ({
  id, kind: 'fact', about_label: who ? null : 'The house', about_member_id: who, text, confidence: sure ? 'sure' : 'not_sure', source: 'conversation', sensitive: false, created_at: at('2026-10-01T12:00:00Z'), ...extra,
})
const MEMORY: MemoryItem[] = [
  MEM('m1', 'Liv’s debate is on Thursdays', 'liv', false, { source: 'conversation' }),
  MEM('m2', 'Owen sees his therapist at Hope Center ABA', 'owen', false, { source: 'email', sensitive: true }),
  MEM('m3', 'The kids’ dentist is Dr. Ledakis', null, true, { source: 'Jake' }),
  MEM('m4', 'Emme plays violin, early strings on Mondays', 'emme', true, { source: 'calendar' }),
  MEM('m5', 'Kelly goes to the gym at 7:30 most evenings', 'kelly', true, { source: 'calendar' }),
  MEM('m6', 'Paint the house before the holidays', 'jake', false, { kind: 'thought', source: 'Jake' }),
]
const CHORES: WallChore[] = [
  { id: 'k1', title: 'Trash to the street', member_id: 'jake', for_member_id: null, days_of_week: [2, 5], time_local: '20:00:00', minutes: 5, enabled: true, every_weeks: 1, starts_on: '2026-01-03' },
  { id: 'k2', title: 'Take meds', member_id: 'liv', for_member_id: null, days_of_week: [0, 1, 2, 3, 4, 5, 6], time_local: '07:30:00', minutes: 2, enabled: true, every_weeks: 1, starts_on: '2026-01-03' },
  { id: 'k3', title: 'Change the cat litter', member_id: 'owen', for_member_id: null, days_of_week: [6], time_local: '10:00:00', minutes: 10, enabled: true, every_weeks: 4, starts_on: '2026-01-03' },
] as WallChore[]
const USAGE: UsageSummary = {
  today: { usd: 0.41, family: 0.06, nightly: 0.25, testing: 0.1, calls: 64 },
  period_usd: 9.2,
  days: [
    { date: '2026-09-30', family: 0.9, nightly: 0, testing: 2.1 }, { date: '2026-10-01', family: 0.6, nightly: 0, testing: 1.2 }, { date: '2026-10-02', family: 0.5, nightly: 0, testing: 0.9 },
    { date: '2026-10-03', family: 0.4, nightly: 0, testing: 0.6 }, { date: '2026-10-04', family: 0.19, nightly: 0, testing: 0 }, { date: '2026-10-05', family: 0.7, nightly: 0.25, testing: 1.1 },
    { date: '2026-10-06', family: 0.06, nightly: 0.25, testing: 0.1 },
  ],
  features: [{ feature: 'Assistant', usd: 7.18, calls: 2900 }, { feature: 'Email reader', usd: 0.83, calls: 300 }, { feature: 'Memory', usd: 0.27, calls: 5100 }, { feature: 'Enrichment', usd: 0.12, calls: 167 }],
  question: { rounds: 1081, avg_input: 28560, reused_share: 0.156, avg_usd: 0.0095 },
  models: [{ feature: 'Memory', model: 'gemini-embedding-001', calls: 5100 }, { feature: 'Assistant', model: 'gemini-2.5-flash', calls: 2900 }, { feature: 'Email reader', model: 'gemini-3.6-flash', calls: 300 }, { feature: 'Enrichment', model: 'gemini-2.5-flash-lite', calls: 167 }],
  unpriced_calls: 0,
  maps: { calls: 263 },
}
const CHECKS: NightlyCheck[] = [
  { run_date: '2026-10-06', kind: 'screens', ok: true, summary: 'Thu Oct 6 3:43 AM passed — 412 passed', details: [], created_at: at('2026-10-06T03:43:00-04:00') },
  { run_date: '2026-10-06', kind: 'assistant', ok: false, summary: '1 of 18 assistant checks failed: Marking a to-do done', details: [{ situation: 'Marking a to-do done', said: 'I finished order groceries for travel', ok: false, problem: 'expected a complete_reminder card, got a update_event card' }], created_at: at('2026-10-06T03:04:00-04:00') },
  ...Array.from({ length: 12 }, (_, i): NightlyCheck => ({ run_date: new Date(Date.UTC(2026, 8, 24 + i)).toISOString().slice(0, 10), kind: 'screens', ok: i !== 7, summary: '', details: [], created_at: at('2026-10-01T03:40:00Z') })),
]

function fixtureSource(params: URLSearchParams): SettingsSource {
  const viewerId = params.get('viewer') ?? 'jake'
  const onWall = params.get('wall') === '1'
  const ok = async () => ({ ok: true })
  return {
    now: () => NOW,
    onWall,
    useMembers: () => MEMBERS,
    useViewer: () => ({ id: viewerId, name: MEMBERS.find((m) => m.id === viewerId)?.name ?? null, token: 't', signOut: () => {} }),
    useFaceId: () => ({ here: viewerId === 'jake', available: true, setUp: async () => true }),
    setCanDrive: ok,
    addMember: ok,
    useHome: () => '412 Palm Way, West Palm Beach, FL',
    usePlaces: () => PLACES,
    useContacts: () => CONTACTS,
    renamePlace: ok,
    keepPlace: ok,
    dismissPlace: ok,
    deletePlace: ok,
    useConnections: () => [conn(MEMBERS[0], 'jake@example.com'), conn(MEMBERS[1], 'kelly@example.com', { reauthorization_required: true }), conn(MEMBERS[2], null), conn(MEMBERS[3], null)],
    connectGoogle: async () => {},
    useCalendarChoices: (memberId) => ({
      calendars: memberId ? [{ id: 'w', summary: 'Tabor House', color: null, primary: false }, { id: 'p', summary: 'jake@example.com', color: null, primary: true }, { id: 's', summary: 'Huskies Softball', color: null, primary: false }, { id: 'h', summary: 'US Holidays', color: null, primary: false }] : null,
      readIds: ['s'], writeId: 'w', save: ok,
    }),
    useEmailReaders: () => ({ on: { jake: true, kelly: false }, set: ok }),
    useEmail: () => {
      const [data, setData] = useState({ keep: [{ id: 'r1', kind: 'sender' as const, label: 'Liv’s softball coach', source: 'voice', created_at: '' }, { id: 'r2', kind: 'topic' as const, label: 'the school', source: 'settings', created_at: '' }], quiet: [{ id: 'q1', from: 'Target', kind: 'promotion', since: null, skipped: 12 }], text_on_wall: true })
      return { data, change: async (body: Record<string, unknown>) => { if (body.action === 'text_on_wall') setData((d) => ({ ...d, text_on_wall: body.on === true })); return { ok: true } } }
    },
    useDisplay: () => {
      const [config, setConfig] = useState({ brightness_min: 0, brightness_max: 50, auto_sleep_enabled: true, sleep_delay_s: 120, led_night_glow: true })
      return { config, save: async (patch) => { setConfig((c) => ({ ...c, ...patch })); return { ok: true } } }
    },
    useScreen: () => {
      const [settings, setSettings] = useState<ScreensaverSettings>(SCREENSAVER_DEFAULTS)
      return { settings, update: (patch) => setSettings((s) => ({ ...s, ...patch })) }
    },
    useWallLight: () => ({ now: LIGHT.at(-1)!, today: LIGHT }),
    useMemory: () => {
      const [items, setItems] = useState(MEMORY)
      return {
        items,
        forget: async (id) => { setItems((l) => l.filter((i) => i.id !== id)); return { ok: true } },
        confirm: async (id) => { setItems((l) => l.map((i) => (i.id === id ? { ...i, confidence: 'sure' as const } : i))); return { ok: true } },
      }
    },
    usePrivateOnWall: () => {
      const [hide, setHide] = useState(false)
      return [hide, async (v) => { setHide(v); return { ok: true } }]
    },
    useChores: () => ({ chores: CHORES, save: async () => {}, remove: async () => {} }),
    useKeptCount: () => 2,
    useRoutines: () => ({
      items: [
        { routine: ROUTINE('liv', 'School', 'Bak Middle School of the Arts', '08:15', '15:30', 'Jake', 'Kelly'), person: MEMBERS[2] },
        { routine: ROUTINE('emme', 'School', 'Palm Beach Public Elementary', '07:45', '14:00', 'Jake', 'Giselle'), person: MEMBERS[3] },
        { routine: ROUTINE('owen', 'School', 'Palm Beach Public Elementary', '07:45', '14:00', 'Jake', 'Giselle'), person: MEMBERS[5] },
      ],
      dayOffs: () => [],
      save: async () => {},
      remove: async () => {},
    }),
    useVoiceTurns: () => [
      { at: at('2026-10-06T07:52:00-04:00'), text: 'What do we have going on today?', page: 'wall' },
      { at: at('2026-10-05T21:40:00-04:00'), text: 'Add milk and eggs to the grocery list', page: 'phone' },
      { at: at('2026-10-05T18:26:00-04:00'), text: 'Update the address for batting practice', page: 'phone' },
    ],
    useUsage: () => USAGE,
    useHealth: () => {
      const [paused, setPausedState] = useState(false)
      return {
        summary: { breaker: { paused, hourly_cost_cap_usd: 3, daily_cost_cap_usd: 10 }, spend: { hour_cost_usd: 0.42, day_cost_usd: 2.31 }, last_check: { checked_at: at('2026-10-06T08:30:00-04:00'), background_calls: { total: 14, errors: 0, timeouts: 0 }, client_errors_last_hour: 0 }, client_errors: { last_24h: 0, last_7d: 2 } },
        setPaused: async (p) => { setPausedState(p); return { ok: true } },
        setCaps: ok,
      }
    },
    useChecks: () => CHECKS,
    useBugs: () => ({ open: 4, newest: at('2026-10-01T18:15:00Z') }),
    run: ok,
  }
}

export default function SettingsFixturePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  // ?live=<member id>: the real data, read as that person (no PIN in a test build) — for checking pages against the
  // family's own data on a developer machine. Nothing here changes anything unless a control is used.
  const source = useMemo(() => {
    const live = params.get('live')
    if (!live) return fixtureSource(params)
    return { ...liveSource, onWall: params.get('wall') === '1', useViewer: () => ({ id: live, name: 'Jake', token: null, signOut: null }), useFaceId: () => ({ here: false, available: false, setUp: null }) }
  }, [params])
  const client = useMemo(() => new QueryClient(), [])
  const page = params.get('page')
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[page ? `/settings/${page}` : '/settings']}>
        <div data-testid="settings-fixture"><SettingsRoot source={source} /></div>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
