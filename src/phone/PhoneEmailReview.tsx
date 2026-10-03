import { useState } from 'react'
import { addLabel, headline, herEmails, lineDay, offerLines, postedHeader, whoAndWhen, type EmailAct, type EmailAnswer, type EmailOffer, type EmailReviewData, type SkippedEmail } from '../wall/emailReview'

// Casa reads the email, phase 2, on the phone (canvas 14c, approved by Jake 2026-09-30): "Anything from
// email?" in Ask Casa — the same review as the wall's, one email at a time, then a few it skipped.
// Phase 3 (canvas row 15): the kept-posted lines after the offers, and "Keep you posted on everything from
// her?" after "It mattered" — the email comes back as an offer.

const label = 'text-phone-label font-bold tracking-[0.16em]'
const dark = 'h-[44px] rounded-full border-0 bg-wall-ink px-[18px] text-phone-body font-bold text-wall-on-pigment'
const pill = 'h-[44px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[14px] text-phone-detail font-semibold text-wall-ink'

export default function PhoneEmailReview({ data, act }: { data: EmailReviewData; act: EmailAct }) {
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
  const [finished, setFinished] = useState(false)
  const offer = offers[at]

  const answer = async (what: EmailAnswer) => {
    if (!offer || working) return
    setWorking(true)
    setNote(null)
    const result = await act(offer.id, what)
    setWorking(false)
    if (!result.ok) return setNote(result.message ?? 'That didn’t save. Nothing was changed.')
    setNote(what === 'add' ? result.note ?? 'Added.' : what === 'later' ? 'Back tomorrow morning.' : null)
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

  if (offer) {
    return (
      <section aria-label="From email" className="flex flex-col gap-[10px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment p-[14px]">
        <div className="flex flex-col gap-[2px]"><span className={`${label} whitespace-nowrap text-wall-brass-ink`}>FROM EMAIL · {at + 1} OF {offers.length}</span><span className="truncate text-phone-detail text-wall-ink-2">{whoAndWhen(offer)}</span></div>
        <div className="font-display text-phone-heading font-bold leading-tight">{headline(offer)}</div>
        {offer.quote && <div className="border-0 border-l-[3px] border-solid border-wall-brass pl-[10px] text-phone-detail italic text-wall-ink-2">“{offer.quote}”</div>}
        {offerLines(offer).map((line) => (
          <div key={`${line.label}:${line.text}`} className="rounded-[12px] bg-phone-ground px-[12px] py-[10px]">
            <div className={`${label} text-wall-ink-2`}>{line.label}{line.when ? ` · ${line.when}` : ''}</div>
            <div className="text-phone-body font-semibold">{line.text}</div>
            {line.adds && <div className="text-phone-detail text-wall-ink-2">{line.adds}</div>}
          </div>
        ))}
        {note && <div role="status" className="text-phone-detail font-semibold text-wall-brass-ink">{note}</div>}
        <button type="button" disabled={working} onClick={() => void answer('add')} className={dark}>{working ? 'Saving…' : addLabel(offer)}</button>
        <div className="flex gap-[8px]">
          <button type="button" disabled={working} onClick={() => void answer('not_needed')} className={`${pill} flex-1 whitespace-nowrap`}>Not needed</button>
          <button type="button" disabled={working} onClick={() => void answer('later')} className={`${pill} flex-1 whitespace-nowrap`}>Later</button>
        </div>
        <a href={offer.open} target="_blank" rel="noreferrer" className="flex h-[44px] items-center justify-center text-phone-detail font-semibold text-wall-ink-2 underline">Open email</a>
      </section>
    )
  }
  if (!postedDone) {
    const her = herEmails(posted)
    return (
      <section aria-label="From email" className="flex flex-col gap-[8px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment p-[14px]">
        <span className={`${label} text-wall-brass-ink`}>{postedHeader(posted)}</span>
        {posted.map((l) => (
          <div key={l.id} className="flex items-center gap-[10px] border-0 border-t border-solid border-wall-stone pt-[8px]">
            <div className="min-w-0 flex-1">
              <div className="text-phone-body font-semibold">{l.gist}</div>
              <div className="text-phone-detail text-wall-ink-2">{[lineDay(l.received_at), l.tag].filter(Boolean).join(' · ')}</div>
            </div>
            {addedLines[l.id]
              ? <span className="shrink-0 text-phone-detail font-semibold text-wall-brass-ink">Added</span>
              : l.can_add && <button type="button" disabled={working} onClick={() => void addLine(l.id)} className={`${pill} shrink-0 whitespace-nowrap`}>Add it</button>}
          </div>
        ))}
        {note && <div role="status" className="text-phone-detail font-semibold text-wall-brass-ink">{note}</div>}
        <button type="button" onClick={() => { setPostedDone(true); setNote(null); void act(posted[0].id, 'seen', posted.map((l) => l.id)) }} className={dark}>Got it</button>
        {her && <a href={her} target="_blank" rel="noreferrer" className="flex h-[44px] items-center justify-center text-phone-detail font-semibold text-wall-ink-2 underline">Open their emails</a>}
      </section>
    )
  }
  if (skipped.length && !finished) {
    return (
      <section aria-label="From email" className="flex flex-col gap-[8px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment p-[14px]">
        {note && !asking && <div role="status" className="text-phone-detail font-semibold text-wall-brass-ink">{note}</div>}
        <span className={`${label} text-wall-brass-ink`}>A FEW I SKIPPED · TELL ME IF ONE MATTERED</span>
        {(asking ? [asking] : skipped).map((s) => (
          <div key={s.id} className="flex items-center gap-[10px] border-0 border-t border-solid border-wall-stone pt-[8px]">
            <div className="min-w-0 flex-1"><div className="truncate text-phone-body font-semibold">{s.from}</div><div className="text-phone-detail text-wall-ink-2">{s.reason?.startsWith('You said') ? `Quiet: ${s.reason}` : `Skipped: ${s.reason}`}</div></div>
            {judged[s.id] === 'mattered' || asking?.id === s.id ? <span className="shrink-0 text-phone-detail font-semibold text-wall-brass-ink">Noted</span> : <button type="button" disabled={working} onClick={() => { setNote(null); setAsking(s) }} className={pill}>It mattered</button>}
          </div>
        ))}
        {asking ? (
          <div className="flex flex-col gap-[8px] rounded-[12px] bg-phone-ground p-[12px]">
            <div className="font-display text-phone-heading font-bold leading-tight">Keep you posted on everything from {asking.from}?</div>
            <div className="text-phone-detail text-wall-ink-2">A line for each of their emails, with Add it on anything dated.</div>
            <button type="button" disabled={working} onClick={() => void mattered(asking, 'keep_posted')} className={dark}>Yes, a line for each</button>
            <button type="button" disabled={working} onClick={() => void mattered(asking, 'mattered')} className={pill}>{working ? 'Reading it again…' : 'Just this one'}</button>
          </div>
        ) : (
          <button type="button" onClick={() => { void Promise.all(skipped.filter((s) => !judged[s.id]).map((s) => act(s.id, 'fine'))); setFinished(true) }} className={dark}>All fine</button>
        )}
      </section>
    )
  }
  return (
    <div className="flex flex-col gap-[8px]">
      {note && <div role="status" className="text-phone-detail font-semibold text-wall-brass-ink">{note}</div>}
      <div className="text-phone-body text-wall-ink-2">{offers.length || posted.length ? 'That’s everything from email.' : 'Nothing from email right now.'}</div>
    </div>
  )
}
