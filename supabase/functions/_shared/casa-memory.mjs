// Casa's memory, phase 1 (design doc https://claude.ai/code/artifact/c1bc97e8-3b45-4c9f-b005-7a06d57d7db6).
// Facts about the people, places and things in the family's life, and open thoughts he asked Casa to keep —
// each with where it came from and how sure Casa is. Pure pieces here, so they're tested without the network.
import { memberNamed } from './family-names.mjs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const since = (iso) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` }
const whereFrom = (row) => (Array.isArray(row.evidence) && row.evidence.length ? row.evidence.map((e) => [e?.what, e?.when].filter(Boolean).join(', ')).join('; ') : row.source === 'told' ? 'you said it' : 'learned')

/** The memory as the model reads it: sure facts first, then not sure yet, each with where from; open thoughts apart. */
export function memoryContext(rows, { due = null } = {}) {
  const facts = (rows ?? []).filter((r) => r.kind !== 'thought')
  const thoughts = (rows ?? []).filter((r) => r.kind === 'thought')
  if (!facts.length && !thoughts.length) return 'WHAT CASA KNOWS: nothing yet.'
  const order = [...facts.filter((r) => r.confidence === 'sure'), ...facts.filter((r) => r.confidence !== 'sure')]
  const lines = order.map((r) => `- [${r.id}] ${r.about_label}: ${r.text} (${r.confidence === 'sure' ? 'sure' : 'not sure yet'} · ${whereFrom(r)})`)
  const out = [`WHAT CASA KNOWS ([id] first; use the sure facts to tell who something is for; "not sure yet" only when asked):\n${lines.join('\n') || '- nothing yet'}`]
  if (thoughts.length) out.push(`OPEN THOUGHTS HE ASKED CASA TO KEEP:\n${thoughts.map((r) => `- [${r.id}] ${r.about_label}: ${r.text} (since ${since(r.created_at)})${r.id === due ? ' — DUE: bring it up once, in passing, at the end of your answer ("You asked me to remember: … Still on your mind?")' : ''}`).join('\n')}`)
  return out.join('\n\n')
}

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** remember's arguments, read strictly: who or what it's about (a family member by any name, else as said). */
export function readRemember(args, { family = [], rows = [] }) {
  const about = text(args?.about)
  const said = text(args?.fact) ?? text(args?.text)
  if (!about || !said) return { error: 'Remember what, about whom?' }
  const member = memberNamed(about, family)
  const replaced = (rows ?? []).find((r) => r.id === args?.replaces_id && r.kind !== 'thought')
  return {
    about: member?.name ?? about.slice(0, 80),
    memberId: member?.id ?? null,
    text: said.slice(0, 300),
    kind: args?.kind === 'thought' ? 'thought' : 'fact',
    words: (Array.isArray(args?.words) ? args.words : []).map(text).filter(Boolean).slice(0, 8),
    replaces: replaced?.id ?? null,
  }
}

/** Only the parents change the memory (design doc #3); the kids can ask. No one chosen (the wall): the parents. */
export function mayChangeMemory(viewerMemberId, family) {
  if (!viewerMemberId) return true
  return (family ?? []).find((m) => m.id === viewerMemberId)?.role === 'parent'
}

// Phase 3 — using it: whose a flyer, an email or an event is. Only sure facts are used.
const sureOf = (facts, memberId) => (facts ?? []).filter((f) => f.kind !== 'thought' && f.confidence === 'sure' && f.about_member_id === memberId)

/** "Liv (child) — Goes to Bak …; Plays softball … · words: Bak, Huskies, softball" for a prompt's family list. */
export function personLine(member, facts) {
  const mine = sureOf(facts, member.id)
  const head = member.role ? `${member.name} (${member.role})` : member.name
  if (!mine.length) return head
  const words = [...new Set(mine.flatMap((f) => f.words ?? []))]
  return `${head} — ${mine.map((f) => f.text).join('; ')}${words.length ? ` · words: ${words.join(', ')}` : ''}`
}

const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The one family member whose sure facts' words appear (whole words) in the text; none or several: null. */
export function memberFromWords(text, facts, family) {
  const t = String(text ?? '')
  if (!t.trim()) return null
  const hits = (family ?? []).filter((m) => sureOf(facts, m.id).some((f) => (f.words ?? []).some((w) => w && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}($|[^\\p{L}\\p{N}])`, 'iu').test(t))))
  return hits.length === 1 ? hits[0] : null
}

/** "I", "I'm", "me", "my", "myself" in what was said (any apostrophe, or none: "im"). */
export function saysI(said) {
  return /(^|[^\p{L}'’])(i|i['’]?m|i['’]?ll|i['’]?ve|i['’]?d|me|my|myself)(?=$|[^\p{L}'’])/iu.test(String(said ?? ''))
}

/**
 * Who's going when he didn't say (Jake's bug report 2026-09-30 11:44: "it should assume that Jake is the person
 * who's going and Jake is the driver … they should never be unassigned"): whoever is signed in when they say "I"
 * (Jake, Oct 3: "when Kelly is logged in and says, Im going to the gym at 7:30 … kelly is the attendee and driver"),
 * else the one person the title's words point to, else whoever is speaking, else the admin. Who drives, when nobody
 * said: the one parent going; with two, the one talking.
 */
export function defaultPeople({ title, said = '', people = [], speakerId = null, facts = [], family = [] }) {
  const speaker = family.find((m) => m.id === speakerId) ?? null
  const drives = (m) => m && m.role === 'parent' && m.can_drive !== false
  if (people.length) {
    const going = people.map((n) => family.find((m) => m.name.toLowerCase() === String(n).toLowerCase())).filter(drives)
    const driver = going.length === 1 ? going[0] : going.find((m) => m.id === speakerId && saysI(said)) ?? null
    return { people, driver: driver?.name ?? null }
  }
  const who = (speaker && saysI(said) ? speaker : null) ?? memberFromWords(title, facts, family) ?? speaker ?? family.find((m) => m.is_admin) ?? null
  if (!who) return { people: [], driver: null }
  return { people: [who.name], driver: drives(who) ? who.name : null }
}

/** For Casa: who is talking, so "I" is them and "you" is Casa. Not signed in (the wall): "I" is the admin. */
export function speakerLine(speakerId, family = []) {
  const speaker = family.find((m) => m.id === speakerId)
  if (speaker) return `WHO IS TALKING: ${speaker.name} is talking (signed in on this screen). "I", "me" and "my" mean ${speaker.name} — "I'm going to the gym at 7:30" puts ${speaker.name} on it, and ${speaker.name} drives — unless they name someone else; so "I", "my", "I've got" already say whose it is: never ask whose it is or who it's for. "he", "his" elsewhere here means whoever is talking. "you" means you, Casa.`
  const admin = family.find((m) => m.is_admin)?.name ?? 'Jake'
  return `WHO IS TALKING: nobody is signed in on this screen; "I", "me" and "my" mean ${admin} unless they say who they are (then them, for the rest of the conversation) — "I have a dentist appointment Tuesday at 3" is ${admin}'s, "my yoga class" is ${admin}'s: never ask whose it is or who it's for. "you" means you, Casa.`
}

// Phase 4 — open thoughts come back (design doc): at most one a day; each at most weekly; quiet after three.
const DAY = 86400e3
/** The open thought to bring up now, or null. */
export function dueThought(rows, now = new Date()) {
  const t = now.getTime()
  const thoughts = (rows ?? []).filter((r) => r.kind === 'thought' && (r.status ?? 'active') === 'active')
  if (thoughts.some((r) => r.last_nudged_at && t - Date.parse(r.last_nudged_at) < 20 * 3600e3)) return null
  return thoughts
    .filter((r) => (r.nudge_count ?? 0) < 3 && t - Date.parse(r.created_at) >= 20 * 3600e3 && (!r.last_nudged_at || t - Date.parse(r.last_nudged_at) >= 7 * DAY))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0] ?? null
}

// Phase 5 — a person's page (canvas 16c): what Casa knows about them, sure first, each with where it came from.
const WHERE = { told: 'you said it', old_app: 'your old contacts', learned: 'learned' }
/** One person's facts for their page: { sure: [{id, text, from}], notSure: [...] }; the privacy switch hides the sensitive ones on the wall. */
export function aboutPerson(rows, memberId, { hideSensitive = false } = {}) {
  const mine = (rows ?? []).filter((r) => r.kind !== 'thought' && (r.status ?? 'active') === 'active' && r.about_member_id === memberId && !(hideSensitive && r.sensitive))
  const line = (r) => ({ id: r.id, text: r.text, from: Array.isArray(r.evidence) && r.evidence.length ? r.evidence.map((e) => e?.what).filter(Boolean).join('; ') : WHERE[r.source] ?? 'learned' })
  return { sure: mine.filter((r) => r.confidence === 'sure').map(line), notSure: mine.filter((r) => r.confidence !== 'sure').map(line) }
}
