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
