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

export interface EmailReviewData {
  count: number
  offers: EmailOffer[]
  skipped: SkippedEmail[]
}

export type EmailAnswer = 'add' | 'not_needed' | 'later' | 'mattered' | 'fine'

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
