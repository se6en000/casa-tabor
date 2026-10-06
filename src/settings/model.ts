// Settings V2 (canvas 47; plan https://claude.ai/code/artifact/2d448df8-9864-43bb-8094-82443acb4abc). Jake, Oct 5:
// "redo the settings page … the organization of it is just terrible … keep the general and advanced areas because I
// still want to geek out on the details especially around usage, ai throttling". Pure: the pages, where old links
// go, who sees Advanced, and search.

export type SettingsPageId =
  | 'family' | 'places' | 'calendars' | 'wall' | 'knows' | 'chores'
  | 'usage' | 'limits' | 'checks' | 'voice' | 'maintenance'

export type SettingsIcon = 'users' | 'pin' | 'cal' | 'wall' | 'spark' | 'chores' | 'chart' | 'gauge' | 'check' | 'mic' | 'wrench'

export interface SettingsPage {
  id: SettingsPageId
  name: string
  /** What the page is for, in a line (under its title). */
  about: string
  icon: SettingsIcon
  advanced: boolean
  /** Extra words people search with ("Face ID" finds Family). */
  words: string[]
}

export const SETTINGS_PAGES: SettingsPage[] = [
  { id: 'family', name: 'Family', about: 'Who’s in the house, their colors, and how each signs in.', icon: 'users', advanced: false, words: ['people', 'members', 'pin', 'pins', 'face id', 'passkey', 'sign in', 'colors', 'kids', 'parents'] },
  { id: 'places', name: 'Places and people', about: 'Home, the places you go and the people you call.', icon: 'pin', advanced: false, words: ['home', 'address', 'addresses', 'contacts', 'directory', 'saved places', 'phone numbers'] },
  { id: 'calendars', name: 'Calendars and email', about: 'Google, which calendars show, and what the email reader does.', icon: 'cal', advanced: false, words: ['google', 'gmail', 'calendar', 'sync', 'email', 'keep me posted', 'mailbox', 'inbox'] },
  { id: 'wall', name: 'The wall', about: 'How bright the kitchen screen is, and when it sleeps.', icon: 'wall', advanced: false, words: ['brightness', 'sleep', 'screen', 'display', 'night glow', 'led', 'light', 'kiosk', 'dark'] },
  { id: 'knows', name: 'What the assistant knows', about: 'What it remembers to answer better. Correct or forget any of it.', icon: 'spark', advanced: false, words: ['memory', 'memories', 'remember', 'forget', 'facts', 'private', 'assistant'] },
  { id: 'chores', name: 'Chores and routines', about: 'Who does what and when, the school runs, and what’s kept from whom.', icon: 'chores', advanced: false, words: ['chore', 'routine', 'trash', 'school run', 'drop-off', 'pickup', 'keep from', 'privacy'] },
  { id: 'usage', name: 'Usage and cost', about: 'What the AI and maps cost, by day, by who, by feature.', icon: 'chart', advanced: true, words: ['cost', 'spend', 'money', 'tokens', 'gemini', 'billing', 'usage', 'dollars'] },
  { id: 'limits', name: 'Limits and health', about: 'The breaker’s caps, the models each job uses, and whether everything’s running.', icon: 'gauge', advanced: true, words: ['breaker', 'throttle', 'throttling', 'cap', 'caps', 'pause', 'models', 'errors', 'health', 'sync'] },
  { id: 'checks', name: 'Checks', about: 'Every night at 3 AM; you get an email only when something fails.', icon: 'check', advanced: true, words: ['nightly', 'tests', 'bugs', 'bug box', 'reports', 'screens'] },
  { id: 'voice', name: 'Voice', about: 'Talking to the wall and the phone.', icon: 'mic', advanced: true, words: ['wake word', 'mic', 'microphone', 'listening', 'sensitivity', 'voice logs'] },
  { id: 'maintenance', name: 'Maintenance', about: 'Fixes you can run yourself. Each asks before it does anything.', icon: 'wrench', advanced: true, words: ['sync', 'refresh', 'reload', 'drive times', 'old settings', 'admin'] },
]

export const pageById = (id: string | null | undefined) => SETTINGS_PAGES.find((p) => p.id === id) ?? null

/**
 * Advanced is Jake's (Jake, Oct 5: "only jake"). Kelly is an admin too, so it isn't the admin flag: it's the first
 * parent in the family's order — the same "first parent" rule the to-dos default to.
 */
export function ownerId(members: Array<{ id: string; role?: string | null; sort_order?: number | null }>): string | null {
  const parents = members.filter((m) => m.role === 'parent').sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
  return parents[0]?.id ?? null
}

/** The page a path names: /settings/family → family; an old link (/settings/google) → its new page; else none. */
export function pageFromPath(pathname: string): SettingsPageId | null {
  const part = pathname.replace(/^\/settings\/?/, '').split('/')[0]
  if (!part) return null
  if (pageById(part)) return part as SettingsPageId
  return OLD_PATHS[part] ?? null
}

/** Old settings links still in the app and in Google's return address land on the new page that took their place. */
const OLD_PATHS: Record<string, SettingsPageId> = {
  google: 'calendars', calendars: 'calendars', 'gmail-scan': 'calendars',
  home: 'places', profile: 'places',
  memory: 'knows',
  display: 'wall', 'art-mode': 'wall', screensaver: 'wall', theme: 'wall',
  ai: 'limits', health: 'limits', 'bug-tracker': 'checks',
  status: 'usage', analytics: 'usage',
  'admin-ops': 'maintenance', 'design-system': 'maintenance',
}

/** Search across names, what each page is for, and the words people use for it; best match first. */
export function searchPages(query: string, canSeeAdvanced: boolean): SettingsPage[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const score = (p: SettingsPage) => {
    if (p.name.toLowerCase().startsWith(q)) return 3
    if (p.name.toLowerCase().includes(q) || p.words.some((w) => w.startsWith(q))) return 2
    if (p.about.toLowerCase().includes(q) || p.words.some((w) => w.includes(q))) return 1
    return 0
  }
  return SETTINGS_PAGES.filter((p) => canSeeAdvanced || !p.advanced)
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p)
}

/** Dollars for a glance: "$2.31", "6¢", "$0". */
export function money(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '—'
  if (usd > 0 && usd < 0.995) return `${Math.max(1, Math.round(usd * 100))}¢`
  if (usd === 0) return '$0'
  return `$${usd.toFixed(2)}`
}

/** "4 min ago", "2 hr ago", "Oct 3". */
export function ago(iso: string | null | undefined, now: Date): string {
  if (!iso) return 'never'
  const ms = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'never'
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hr ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** One square a night for the last two weeks: green when every check that night passed. */
export function nightStatus(checks: Array<{ run_date: string; ok: boolean }>): Array<{ date: string; ok: boolean }> {
  const byDate = new Map<string, boolean>()
  for (const c of checks) byDate.set(c.run_date, (byDate.get(c.run_date) ?? true) && c.ok)
  return [...byDate.entries()].map(([date, ok]) => ({ date, ok })).sort((a, b) => a.date.localeCompare(b.date))
}

// ── The wall's light (Settings › The wall; Jake, Oct 6: "where it is on the color spectrum currently") ──────────
// The Pi measures the room's colour temperature (K) and brightness (lux) and sets the screen to match: warmer
// colours in warm light, brighter in a bright room.
export const CCT_WARM = 2500
export const CCT_COOL = 6500

/** Where a colour temperature sits on the band, 0 (warmest) to 1 (coolest). */
export const spectrumAt = (cct: number) => Math.min(1, Math.max(0, (cct - CCT_WARM) / (CCT_COOL - CCT_WARM)))

/** The light in words: "candle-warm", "warm", "neutral", "cool daylight". */
export function lightWords(cct: number | null | undefined): string {
  if (cct == null) return 'not measured'
  if (cct < 3000) return 'candle-warm'
  if (cct < 4300) return 'warm'
  if (cct < 5300) return 'neutral'
  return 'cool daylight'
}

/** A colour temperature as an RGB colour (Tanner Helland's blackbody fit), for drawing it. */
export function cctColor(cct: number): string {
  const t = Math.min(40000, Math.max(1000, cct)) / 100
  const clamp = (v: number) => Math.round(Math.min(255, Math.max(0, v)))
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`
}

/** The screen's tint (the monitor's R/G/B gains, 50 = neutral) as the colour white turns into. */
export function tintColor(rgb: number[] | null | undefined): string | null {
  if (!rgb || rgb.length !== 3) return null
  const top = Math.max(...rgb, 1)
  return `rgb(${rgb.map((v) => Math.round((v / top) * 255)).join(', ')})`
}

// ── Family profiles: colour and order (Jake, Oct 6: "change the profile avatar color … customize the wall") ──────
export interface Arrangement { id: string; pigment?: number | null; sort_order?: number }
type Placed = { id: string; sort_order?: number | null }

/**
 * Picking a colour: it's theirs, and whoever had it takes theirs, so nobody else's colour moves. `shown` is each
 * person's colour now (0–5).
 */
export function pickColor(personId: string, color: number, shown: Map<string, number>): Arrangement[] {
  const mine = (shown.get(personId) ?? 0) % 6
  if (mine === color) return []
  const other = [...shown.entries()].find(([id, c]) => id !== personId && c % 6 === color)?.[0]
  return [{ id: personId, pigment: color }, ...(other ? [{ id: other, pigment: mine }] : [])]
}

/**
 * Moving someone up or down the wall's order (`ordered` = the people on the wall, in order): they swap places with
 * the neighbour, and both keep their colours (colours otherwise follow the order).
 */
export function moveInOrder(personId: string, dir: -1 | 1, ordered: Placed[], shown: Map<string, number>): Arrangement[] {
  const i = ordered.findIndex((m) => m.id === personId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ordered.length) return []
  const a = ordered[i]
  const b = ordered[j]
  const sa = a.sort_order ?? i + 1
  const sb = b.sort_order ?? j + 1
  // Equal places (two people at 5) still need to come out in the new order.
  const [na, nb] = sa === sb ? [sb + dir, sa] : [sb, sa]
  return [
    { id: a.id, sort_order: na, pigment: (shown.get(a.id) ?? 0) % 6 },
    { id: b.id, sort_order: nb, pigment: (shown.get(b.id) ?? 0) % 6 },
  ]
}
