// An event's or reminder's notes (canvas 65, Jake, Oct 7: "display notes on events and reminders as a field to
// edit … plus its add context for Alexa. Like if a todo or reminder is created from an email, that email context
// should be added to the notes"). They live in events.description, which also holds what people never wrote: the
// details block the app keeps for Google (google-event-details-core.mjs) and the house's own tags, one line each
// ("Casa · date we keep · birthday", "Tabor House · from Coach Rivera’s email · Sep 22 · <link>"). Pure, so the
// wall, the phone, Alexa and the email reader read and write them the same way.

const BLOCK_START = '<!-- CASA-TABOR-DETAILS:START -->'
const BLOCK_END = '<!-- CASA-TABOR-DETAILS:END -->'
const TAG = /^(Casa|Tabor House) · /
const SOURCE = /^Tabor House · from (.+?)(?: · (https?:\/\/\S+))?$/

/** The description in its three parts: what people wrote, the tag lines, the details block (as kept). */
function parts(description) {
  const text = String(description ?? '')
  const start = text.indexOf(BLOCK_START)
  const end = text.indexOf(BLOCK_END)
  // A block cut short (Google's length limit) runs to the end.
  const block = start < 0 ? '' : end > start ? text.slice(start, end + BLOCK_END.length) : text.slice(start)
  const rest = start < 0 ? text : `${text.slice(0, start)}${end > start ? text.slice(end + BLOCK_END.length) : ''}`
  const lines = rest.replace(/\r\n?/g, '\n').split('\n')
  return { written: lines.filter((l) => !TAG.test(l.trim())).join('\n'), tags: lines.map((l) => l.trim()).filter((l) => TAG.test(l)), block }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' }
/** Google keeps notes typed there as HTML: plain lines. */
function plain(text) {
  return text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*li\s*>/gi, '')
    .replace(/<\s*\/\s*(p|div|ul|ol)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_m, e) => ENTITIES[e])
    .split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** What people wrote on it, as plain lines ('' when nothing). */
export function notesOf(description) {
  return plain(parts(description).written)
}

/** Where its notes came from, when an email made it: { text: "From Coach Rivera’s email · Sep 22", url }. */
export function notesSource(description) {
  for (const tag of parts(description).tags) {
    const m = SOURCE.exec(tag)
    if (m) return { text: `From ${m[1]}`, url: m[2] ?? null }
  }
  return null
}

const join = (notes, tags, block) => {
  const head = [String(notes ?? '').trim(), ...tags].filter(Boolean).join('\n')
  const all = [head, block].filter(Boolean).join('\n\n')
  return all || null
}

/** The description with these notes in place of what people wrote; its tags and details block kept. */
export function withNotes(description, notes) {
  const { tags, block } = parts(description)
  return join(notes, tags, block)
}

/** New lines added under the notes, each once (any case). */
export function addNotes(description, lines) {
  const { tags, block } = parts(description)
  const now = notesOf(description)
  const have = new Set(now.split('\n').map((l) => l.replace(/^•\s*/, '').trim().toLowerCase()).filter(Boolean))
  const fresh = (lines ?? []).map((l) => String(l ?? '').trim()).filter((l) => l && !have.has(l.replace(/^•\s*/, '').toLowerCase()))
  if (!fresh.length) return description ?? null
  return join([now, ...fresh].filter(Boolean).join('\n'), tags, block)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Coach Rivera <r@x.org>" → "Coach Rivera"; "photo@walgreens.com" → "Walgreens". */
function senderName(from) {
  const s = String(from ?? '').trim()
  const named = s.replace(/<[^>]*>/, '').replace(/^"|"$/g, '').trim()
  if (named && !named.includes('@')) return named
  const domain = (s.match(/@([^>.\s]+)/) ?? [])[1] ?? ''
  return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : 'an'
}

/** The tag for notes from an email: who sent it, the day (home time), and a link to it in Gmail. */
export function sourceTag({ from, receivedAt, gmailId }) {
  const name = senderName(from)
  const d = receivedAt ? new Date(receivedAt) : null
  const day = d && !Number.isNaN(d.getTime())
    ? (() => { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric' }).formatToParts(d); const v = (t) => Number(p.find((x) => x.type === t)?.value); return `${MONTHS[v('month') - 1]} ${v('day')}` })()
    : null
  const who = name === 'an' ? 'an email' : `${name}’s email`
  return ['Tabor House · from ' + who, day, gmailId ? `https://mail.google.com/mail/#all/${encodeURIComponent(gmailId)}` : null].filter(Boolean).join(' · ')
}

/** A new item's description from an email's specifics: one bulleted line each, its source underneath (null when none). */
export function notesFromEmail(lines, source) {
  const kept = (lines ?? []).map((l) => String(l ?? '').trim().replace(/^[•\-*]\s*/, '')).filter(Boolean)
  if (!kept.length) return null
  return join(kept.map((l) => `• ${l}`).join('\n'), [sourceTag(source ?? {})], '')
}
