import { useEffect, useMemo, useRef, useState } from 'react'
import { Mail } from 'lucide-react'
import { headline, offerLines, showSkippedToday, whoAndWhen, type EmailAnswer, type EmailReviewData } from './emailReview'

// Casa reads the email, phase 2 (canvas 14a/14b, approved by Jake 2026-09-30): "What came in by email?" —
// one email at a time, in the band's place: who wrote, why it matters, the email's own words, what Casa
// would add; Add it / Not needed / Later / Open email. Then, once a day, "a few I skipped", each with its
// reason and "That one mattered". Every answer is a label. It closes like the band (a tap outside, a swipe
// down, Esc) — nothing is lost: what's unanswered waits.

const SKIPPED_SHOWN_KEY = 'casa-email-skipped-shown'
const pill = 'h-[60px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[26px] text-wall-detail font-semibold text-wall-on-pigment'
const lightPill = 'h-[60px] rounded-full border-0 bg-wall-on-pigment px-[30px] text-wall-detail font-bold text-wall-ink'

export default function WallEmailReview({ data, act, onClose, computer = false, today }: {
  data: EmailReviewData
  act: (id: string, what: EmailAnswer) => Promise<{ ok: boolean; message?: string }>
  onClose: () => void
  /** On a computer, Open email is a link; the kiosk has no mail to open. */
  computer?: boolean
  /** YYYY-MM-DD, for "a few I skipped" once a day. */
  today: string
}) {
  // The list as it was when the review opened: answers move it on without reshuffling it.
  const [offers] = useState(data.offers)
  const [skipped] = useState(data.skipped)
  const [at, setAt] = useState(0)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [judged, setJudged] = useState<Record<string, 'mattered' | 'fine'>>({})
  const showSkipped = useMemo(() => {
    let last: string | null = null
    try { last = localStorage.getItem(SKIPPED_SHOWN_KEY) } catch { /* private mode */ }
    return showSkippedToday(last, today, skipped)
  }, [skipped, today])
  const phase = at < offers.length ? 'offers' : showSkipped ? 'skipped' : 'done'
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
  const judge = async (id: string, what: 'mattered' | 'fine') => {
    setJudged((j) => ({ ...j, [id]: what }))
    await act(id, what)
  }
  const allFine = async () => {
    await Promise.all(skipped.filter((s) => !judged[s.id]).map((s) => act(s.id, 'fine')))
    onClose()
  }

  // Closing like the band: Esc; a swipe down on it; a tap outside (its own layer, under the band).
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const offer = offers[at]
  return (
    <>
      <button type="button" aria-label="Close the email review" onClick={onClose} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />
      <section
        aria-label="From email"
        onPointerDown={(e) => { swipeStart.current = { x: e.clientX, y: e.clientY, t: Date.now() } }}
        onPointerUp={(e) => {
          const s = swipeStart.current
          swipeStart.current = null
          if (s && e.clientY - s.y >= 140 && Math.abs(e.clientX - s.x) < (e.clientY - s.y) / 2 && Date.now() - s.t <= 900) onClose()
        }}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 left-0 z-30 flex min-h-[560px] w-[1920px] gap-[48px] rounded-t-[32px] bg-wall-band px-[64px] py-[44px] font-body text-wall-on-pigment shadow-[0_-18px_48px] shadow-wall-night-ground/60"
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
            {offer.quote && <div className="max-w-[1300px] border-0 border-l-[3px] border-solid border-wall-night-brass py-[4px] pl-[18px] text-wall-answer italic">“{offer.quote}”</div>}
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

        {phase === 'skipped' && (
          <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
            {note && <div role="status" className="text-wall-body text-wall-night-brass">{note}</div>}
            <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">A FEW I SKIPPED THIS WEEK · TELL ME IF ONE MATTERED</div>
            <div className="flex max-w-[1500px] flex-col">
              {skipped.map((s) => (
                <div key={s.id} className="flex items-center gap-[20px] border-0 border-t border-solid border-wall-ink-2/40 py-[14px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-wall-body font-semibold">{s.from} · <span className="font-normal">{s.subject}</span></div>
                    <div className="truncate text-wall-detail text-wall-night-ink-2">Skipped: {s.reason}</div>
                  </div>
                  {judged[s.id] === 'mattered'
                    ? <span className="shrink-0 text-wall-detail font-semibold text-wall-night-brass">Noted — it mattered</span>
                    : <button type="button" onClick={() => void judge(s.id, 'mattered')} className={pill}>That one mattered</button>}
                </div>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-[14px]">
              <button type="button" onClick={() => void allFine()} className={lightPill}>All fine</button>
              <button type="button" onClick={onClose} className={pill}>Done</button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex min-w-0 flex-1 flex-col gap-[16px]">
            {note && <div role="status" className="text-wall-body text-wall-night-brass">{note}</div>}
            <div className="font-display text-wall-quote font-semibold">{offers.length ? 'That’s everything from email.' : 'Nothing from email right now.'}</div>
            <div className="mt-auto flex gap-[14px]"><button type="button" onClick={onClose} className={lightPill}>Done</button></div>
          </div>
        )}
      </section>
    </>
  )
}
