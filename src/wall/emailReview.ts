// Casa reads the email, phase 2 (canvas row 14, approved by Jake 2026-09-30): what the review shows.

export interface EmailOfferItem {
  kind: 'event' | 'reminder' | 'todo' | 'prep' | 'shopping'
  title: string
  date?: string
  start?: string
  place?: string
}

export interface EmailOffer {
  id: string
  from: string
  subject: string | null
  received_at: string | null
  open: string
  decision: 'offer' | 'details' | 'person'
  reason: string | null
  quote: string | null
  offers: EmailOfferItem[]
  person: { who: string; wants: string } | null
}

export interface SkippedEmail {
  id: string
  from: string
  subject: string | null
  received_at: string | null
  open: string
  reason: string | null
}

/** Keep me posted (canvas 15b): one line of what a kept sender's (or topic's) email says. */
export interface PostedLine {
  id: string
  from: string
  subject: string | null
  received_at: string | null
  open: string
  gist: string
  tag: string | null
  can_add: boolean
  kept_by: string
  sender: string
  decision: string
  reason: string | null
  quote: string | null
  offers: EmailOfferItem[]
  person: { who: string; wants: string } | null
}

export interface EmailReviewData {
  count: number
  offers: EmailOffer[]
  skipped: SkippedEmail[]
  posted?: PostedLine[]
  /** "Email text on the wall" (Settings › Email): off hides the email's own words on the wall. */
  text_on_wall?: boolean
}

export type EmailAnswer = 'add' | 'not_needed' | 'later' | 'mattered' | 'fine' | 'keep_posted' | 'seen'

export type EmailAct = (id: string, what: EmailAnswer, ids?: string[]) => Promise<{ ok: boolean; message?: string; offer?: EmailOffer | null }>

const KIND: Record<EmailOfferItem['kind'], string> = { event: 'EVENT', reminder: 'REMINDER', todo: 'TO-DO', prep: 'GET & PACK', shopping: 'SHOPPING' }

/** What the card says Casa would add: "EVENT · Oct 24 · 2026 Strings Festival". */
export function offerLines(offer: EmailOffer): Array<{ label: string; text: string; when: string | null }> {
  if (offer.decision === 'person' && offer.person) return [{ label: 'REPLY', text: `Reply to ${offer.person.who}`, when: null }]
  return offer.offers.map((o) => ({
    label: offer.decision === 'details' ? 'UPDATE' : KIND[o.kind] ?? 'ADD',
    text: o.title,
    when: o.date ? `${new Date(`${o.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${o.start ? ` · ${formatTime(o.start)}` : ''}` : null,
  }))
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const hour = ((h + 11) % 12) + 1
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/** "Mon, Sep 28 · Mrs. Paine" */
export function whoAndWhen(item: { from: string; received_at: string | null }): string {
  const day = item.received_at ? new Date(item.received_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
  return [day, item.from].filter(Boolean).join(' · ')
}

/** The line the card leads with: why it matters, or who wants what. */
export function headline(offer: EmailOffer): string {
  if (offer.decision === 'person' && offer.person) return `${offer.person.who}: ${offer.person.wants}`
  return offer.reason ?? offer.subject ?? 'From email'
}

/** "A few I skipped" shows once a day, after the offers (canvas 14b: "now and then"). */
export function showSkippedToday(lastShown: string | null, today: string, skipped: SkippedEmail[]): boolean {
  return skipped.length > 0 && lastShown !== today
}

/** "KEEP ME POSTED · SALLY ROZANSKI · 3 THIS WEEK" — named when the lines are all one sender's. */
export function postedHeader(lines: PostedLine[]): string {
  const names = new Set(lines.map((l) => l.kept_by))
  return names.size === 1 ? `KEEP ME POSTED · ${[...names][0].toUpperCase()} · ${lines.length} THIS WEEK` : `KEEP ME POSTED · ${lines.length} THIS WEEK`
}

/** Open her emails: a Gmail search for that sender (only when the lines are one sender's). */
export function herEmails(lines: PostedLine[]): string | null {
  const senders = new Set(lines.map((l) => l.sender))
  return senders.size === 1 ? `https://mail.google.com/mail/#search/${encodeURIComponent(`from:${[...senders][0]}`)}` : null
}

/** "Mon": the day a posted line's email came. */
export function lineDay(receivedAt: string | null): string {
  return receivedAt ? new Date(receivedAt).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' }) : ''
}
