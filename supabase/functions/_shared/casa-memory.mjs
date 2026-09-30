// Casa's memory, phase 1 (design doc https://claude.ai/code/artifact/c1bc97e8-3b45-4c9f-b005-7a06d57d7db6).
// Facts about the people, places and things in the family's life, and open thoughts he asked Casa to keep —
// each with where it came from and how sure Casa is. Pure pieces here, so they're tested without the network.
import { memberNamed } from './family-names.mjs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const since = (iso) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` }
const whereFrom = (row) => (Array.isArray(row.evidence) && row.evidence.length ? row.evidence.map((e) => [e?.what, e?.when].filter(Boolean).join(', ')).join('; ') : row.source === 'told' ? 'you said it' : 'learned')

/** The memory as the model reads it: sure facts first, then not sure yet, each with where from; open thoughts apart. */
export function memoryContext(rows) {
  const facts = (rows ?? []).filter((r) => r.kind !== 'thought')
  const thoughts = (rows ?? []).filter((r) => r.kind === 'thought')
  if (!facts.length && !thoughts.length) return 'WHAT CASA KNOWS: nothing yet.'
  const order = [...facts.filter((r) => r.confidence === 'sure'), ...facts.filter((r) => r.confidence !== 'sure')]
  const lines = order.map((r) => `- [${r.id}] ${r.about_label}: ${r.text} (${r.confidence === 'sure' ? 'sure' : 'not sure yet'} · ${whereFrom(r)})`)
  const out = [`WHAT CASA KNOWS ([id] first; use the sure facts to tell who something is for; "not sure yet" only when asked):\n${lines.join('\n') || '- nothing yet'}`]
  if (thoughts.length) out.push(`OPEN THOUGHTS HE ASKED CASA TO KEEP:\n${thoughts.map((r) => `- [${r.id}] ${r.about_label}: ${r.text} (since ${since(r.created_at)})`).join('\n')}`)
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

/**
 * Who's going when he didn't say (Jake's bug report 2026-09-30 11:44: "it should assume that Jake is the person
 * who's going and Jake is the driver … they should never be unassigned"): the one person the title's words point
 * to, else whoever is speaking, else the admin. A parent going to their own thing drives.
 */
export function defaultPeople({ title, people = [], speakerId = null, facts = [], family = [] }) {
  if (people.length) return { people, driver: null }
  const pointed = memberFromWords(title, facts, family)
  const who = pointed ?? family.find((m) => m.id === speakerId) ?? family.find((m) => m.is_admin) ?? null
  if (!who) return { people: [], driver: null }
  return { people: [who.name], driver: who.role === 'parent' && who.can_drive !== false ? who.name : null }
}
