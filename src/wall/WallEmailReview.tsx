import { useEffect, useMemo, useState } from 'react'
import { Mail } from 'lucide-react'
import { useSwipeDown } from './useSwipeDown'
import { headline, herEmails, lineDay, offerLines, postedHeader, showSkippedToday, whoAndWhen, type EmailAct, type EmailAnswer, type EmailOffer, type EmailReviewData, type SkippedEmail } from './emailReview'

// Casa reads the email, phase 2 (canvas 14a/14b, approved by Jake 2026-09-30): "What came in by email?" —
// one email at a time, in the band's place: who wrote, why it matters, the email's own words, what Casa
// would add; Add it / Not needed / Later / Open email. Then, once a day, "a few I skipped", each with its
// reason and "That one mattered". Every answer is a label. It closes like the band (a tap outside, a swipe
// down, Esc) — nothing is lost: what's unanswered waits.
// Phase 3 (canvas row 15, approved 2026-09-30): after the offers, "Keep me posted" — a kept sender's emails, a
// line each with Add it on anything dated (15b); "That one mattered" asks "Keep you posted on everything from
// her?" and brings the email back as an offer (15a); with "Email text on the wall" off, no email words (15c).

const SKIPPED_SHOWN_KEY = 'casa-email-skipped-shown'
const pill = 'h-[60px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[26px] text-wall-detail font-semibold text-wall-on-pigment'
const lightPill = 'h-[60px] rounded-full border-0 bg-wall-on-pigment px-[30px] text-wall-detail font-bold text-wall-ink'
const darkPill = 'h-[60px] whitespace-nowrap rounded-full border-0 bg-wall-ink px-[30px] text-wall-detail font-bold text-wall-on-pigment'
const inkPill = 'h-[60px] whitespace-nowrap rounded-full border border-solid border-wall-ink-2 bg-transparent px-[26px] text-wall-detail font-semibold text-wall-ink'

export default function WallEmailReview({ data, act, onClose, computer = false, today }: {
  data: EmailReviewData
  act: EmailAct
  onClose: () => void
  /** On a computer, Open email is a link; the kiosk has no mail to open. */
  computer?: boolean
  /** YYYY-MM-DD, for "a few I skipped" once a day. */
  today: string
}) {
  // The list as it was when the review opened: answers move it on without reshuffling it. An email he says
  // mattered comes back at the end, as an offer.
  const [offers, setOffers] = useState<EmailOffer[]>(data.offers)
  const [posted] = useState(data.posted ?? [])
  const [skipped] = useState(data.skipped)
  const [at, setAt] = useState(0)
  const [postedDone, setPostedDone] = useState(posted.length === 0)
  const [addedLines, setAddedLines] = useState<Record<string, true>>({})
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [judged, setJudged] = useState<Record<string, 'mattered' | 'fine'>>({})
  const [asking, setAsking] = useState<SkippedEmail | null>(null)
  const textOnWall = data.text_on_wall !== false
  const showSkipped = useMemo(() => {
    let last: string | null = null
    try { last = localStorage.getItem(SKIPPED_SHOWN_KEY) } catch { /* private mode */ }
    return showSkippedToday(last, today, skipped)
  }, [skipped, today])
  const phase = at < offers.length ? 'offers' : !postedDone ? 'posted' : showSkipped ? 'skipped' : 'done'
  useEffect(() => {
    if (phase !== 'skipped') return
    try { localStorage.setItem(SKIPPED_SHOWN_KEY, today) } catch { /* private mode */ }
  }, [phase, today])

  const answer = async (what: EmailAnswer) => {
    const offer = offers[at]
    if (!offer || working) return
    setWorking(true)
    setNote(null)
    const result = await act(offer.id, what)
    setWorking(false)
    if (!result.ok) {
      setNote(result.message ?? 'That didn’t save. Nothing was changed.')
      return
    }
    setNote(what === 'add' ? 'Added.' : what === 'later' ? 'Back tomorrow morning.' : null)
    setAt((i) => i + 1)
  }
  const addLine = async (id: string) => {
    if (working) return
    setWorking(true)
    const result = await act(id, 'add')
    setWorking(false)
    if (result.ok) setAddedLines((a) => ({ ...a, [id]: true }))
    else setNote(result.message ?? 'That didn’t save. Nothing was changed.')
  }
  const gotIt = async () => {
    setPostedDone(true)
    setNote(null)
    await act(posted[0].id, 'seen', posted.map((l) => l.id))
  }
  // "That one mattered": one question — keep her posted, or just this one — then it's read again as mattering
  // and comes back as an offer if there's anything in it.
  const mattered = async (row: SkippedEmail, what: 'keep_posted' | 'mattered') => {
    setWorking(true)
    setNote('Reading it again…')
    const result = await act(row.id, what)
    setWorking(false)
    setAsking(null)
    setJudged((j) => ({ ...j, [row.id]: 'mattered' }))
    const kept = what === 'keep_posted' ? `I’ll keep you posted on ${row.from}. ` : ''
    if (result.ok && result.offer) {
      setNote(`${kept}Here it is.`)
      setOffers((o) => [...o, result.offer as EmailOffer])
    } else setNote(result.ok ? `${kept}Noted — nothing in it to add.` : result.message ?? 'That didn’t save.')
  }
  const allFine = async () => {
    await Promise.all(skipped.filter((s) => !judged[s.id]).map((s) => act(s.id, 'fine')))
    onClose()
  }

  // Closing like the band: Esc; a swipe down on it; a tap outside (its own layer, under the band).
  const swipe = useSwipeDown(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const offer = offers[at]
  const her = herEmails(posted)
  return (
    <>
      <button type="button" aria-label="Close the email review" onClick={onClose} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />
      <section
        aria-label="From email"
        {...swipe}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 left-0 z-30 flex min-h-[560px] w-[1920px] touch-none gap-[48px] rounded-t-[32px] bg-wall-band px-[64px] py-[44px] font-body text-wall-on-pigment shadow-[0_-18px_48px] shadow-wall-night-ground/60"
      >
        <div className="flex w-[170px] shrink-0 flex-col items-center gap-[14px]">
          <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full border-2 border-solid border-wall-night-brass text-wall-night-brass"><Mail size={40} strokeWidth={1.6} /></div>
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">FROM EMAIL</div>
        </div>

        {phase === 'offers' && offer && (
          <div className="flex min-w-0 flex-1 flex-col gap-[16px]">
            <div className="flex items-baseline justify-between gap-[24px]">
              <span className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{at + 1} OF {offers.length}</span>
              <span className="text-wall-detail text-wall-night-ink-2">{whoAndWhen(offer)}</span>
            </div>
            <div className="font-display text-wall-quote font-semibold leading-tight">{headline(offer)}</div>
            {offer.quote && textOnWall && <div className="max-w-[1300px] border-0 border-l-[3px] border-solid border-wall-night-brass py-[4px] pl-[18px] text-wall-answer italic">“{offer.quote}”</div>}
            {offer.quote && !textOnWall && <div className="text-wall-detail text-wall-night-ink-2">The email’s own words are hidden on the wall · Open it on your phone</div>}
            <div className="flex max-w-[1300px] flex-col gap-[8px]">
              {offerLines(offer).map((line) => (
                <div key={`${line.label}:${line.text}`} className="flex items-center gap-[24px] rounded-[18px] bg-wall-on-pigment px-[24px] py-[16px] text-wall-ink">
                  <span className="shrink-0 text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink">{line.label}</span>
                  <span className="min-w-0 flex-1 text-wall-body font-semibold">{line.text}</span>
                  {line.when && <span className="shrink-0 text-wall-detail text-wall-ink-2">{line.when}</span>}
                </div>
              ))}
            </div>
            {note && <div role="status" className="text-wall-body text-wall-night-brass">{note}</div>}
            <div className="mt-auto flex items-center gap-[14px]">
              <button type="button" disabled={working} onClick={() => void answer('add')} className={lightPill}>{working ? 'Saving…' : offer.decision === 'details' ? 'Update it' : 'Add it'}</button>
              <button type="button" disabled={working} onClick={() => void answer('not_needed')} className={pill}>Not needed</button>
              <button type="button" disabled={working} onClick={() => void answer('later')} className={pill}>Later</button>
              {computer && <a href={offer.open} target="_blank" rel="noreferrer" className={`${pill} flex items-center no-underline`}>Open email</a>}
              {offers.length > at + 1 && <span className="ml-auto truncate text-wall-detail text-wall-night-ink-2">Next: {headline(offers[at + 1])}</span>}
            </div>
          </div>
        )}

        {phase === 'posted' && (
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            <div className="flex items-baseline justify-between gap-[24px]">
              <span className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{postedHeader(posted)}</span>
              <span className="text-wall-detail text-wall-night-ink-2">after the offers</span>
            </div>
            <div className="flex max-w-[1500px] flex-col">
              {posted.slice(0, 5).map((l) => (
                <div key={l.id} className="flex min-h-[60px] items-center gap-[20px] border-0 border-t border-solid border-wall-ink-2/40 py-[12px]">
                  <span className="w-[90px] shrink-0 text-wall-detail text-wall-night-ink-2">{lineDay(l.received_at)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-wall-body font-semibold">{l.gist}</div>
                    <div className="truncate text-wall-detail text-wall-night-ink-2">{[l.tag, new Set(posted.map((p) => p.kept_by)).size > 1 ? l.kept_by : null].filter(Boolean).join(' · ')}</div>
                  </div>
                  {addedLines[l.id]
                    ? <span className="shrink-0 text-wall-detail font-semibold text-wall-night-brass">Added</span>
                    : l.can_add && <button type="button" disabled={working} onClick={() => void addLine(l.id)} className={pill}>Add it</button>}
                </div>
              ))}
            </div>
            {note && <div role="status" className="text-wall-body text-wall-night-brass">{note}</div>}
            <div className="mt-auto flex items-center gap-[14px]">
              <button type="button" onClick={() => void gotIt()} className={lightPill}>Got it</button>
              {computer && her && <a href={her} target="_blank" rel="noreferrer" className={`${pill} flex items-center no-underline`}>Open her emails</a>}
              <span className="ml-auto max-w-[640px] text-right text-wall-detail text-wall-night-ink-2">A line for each email, so ads cost a glance. Nothing from a kept sender is skipped.</span>
            </div>
          </div>
        )}

        {phase === 'skipped' && (
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">A FEW I SKIPPED THIS WEEK · TELL ME IF ONE MATTERED</div>
            <div className="flex max-w-[1500px] flex-col">
              {(asking ? [asking] : skipped).map((s) => (
                <div key={s.id} className="flex items-center gap-[20px] border-0 border-t border-solid border-wall-ink-2/40 py-[14px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-wall-body font-semibold">{s.from} · <span className="font-normal">{s.subject}</span></div>
                    <div className="truncate text-wall-detail text-wall-night-ink-2">{s.reason?.startsWith('You said') ? `Quiet: ${s.reason}` : `Skipped: ${s.reason}`}</div>
                  </div>
                  {judged[s.id] === 'mattered' || asking?.id === s.id
                    ? <span className="shrink-0 text-wall-detail font-semibold text-wall-night-brass">Noted — it mattered</span>
                    : <button type="button" disabled={working} onClick={() => { setNote(null); setAsking(s) }} className={pill}>That one mattered</button>}
                </div>
              ))}
            </div>
            {asking && (
              <div className="flex max-w-[1500px] flex-col gap-[14px] rounded-[20px] bg-wall-on-pigment px-[26px] py-[22px] text-wall-ink">
                <div className="font-display text-wall-quote font-bold leading-tight">Keep you posted on everything from {asking.from}?</div>
                <div className="text-wall-detail text-wall-ink-2">You’d get a line for each of their emails, with Add it on anything with a date. Nothing from them gets skipped.</div>
                <div className="flex items-center gap-[14px]">
                  <button type="button" disabled={working} onClick={() => void mattered(asking, 'keep_posted')} className={darkPill}>Yes, a line for each</button>
                  <button type="button" disabled={working} onClick={() => void mattered(asking, 'mattered')} className={inkPill}>Just this one</button>
                  <span className="ml-auto text-wall-detail text-wall-ink-2">{working ? 'Reading it again…' : 'Either way, it comes next as an offer'}</span>
                </div>
              </div>
            )}
            {note && !asking && <div role="status" className="text-wall-body text-wall-night-brass">{note}</div>}
            {!asking && (
              <div className="mt-auto flex items-center gap-[14px]">
                <button type="button" onClick={() => void allFine()} className={lightPill}>All fine</button>
                <button type="button" onClick={onClose} className={pill}>Done</button>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="flex min-w-0 flex-1 flex-col gap-[16px]">
            {note && <div role="status" className="text-wall-body text-wall-night-brass">{note}</div>}
            <div className="font-display text-wall-quote font-semibold">{offers.length || posted.length ? 'That’s everything from email.' : 'Nothing from email right now.'}</div>
            <div className="mt-auto flex gap-[14px]"><button type="button" onClick={onClose} className={lightPill}>Done</button></div>
          </div>
        )}
      </section>
    </>
  )
}
