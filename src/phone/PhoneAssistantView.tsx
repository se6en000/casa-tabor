import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Bug, Camera, ChevronLeft, CircleHelp, Loader2, Mic } from 'lucide-react'
import { REPORT_CATEGORIES } from '../wall/bugReport'
import type { PhoneLine } from './assistant'
import type { WhichOne } from '../wall/assistant'
import type { AssistantCard } from '../wall/assistantCard'
import type { WallMember } from '../wall/engine/types'
import { PhoneCard, PhoneWhich } from './PhoneAssistantCard'
import { noteSaid, tipFor, tipsByTopic } from '../wall/tips'
import { telOf } from '../wall/WallDirections'

// Say it (board 05e): the family's assistant on the phone — the same one the wall's band
// talks to. Type (or use the keyboard's dictation, or the mic), read the answer, and a
// change waits for a Yes. The bug icon sends the whole conversation, as on the wall.
// Drawn from props only, so the fixture scripts it (PhoneFixturePage).

export interface PhoneAssistantViewProps {
  lines: PhoneLine[]
  thinking: boolean
  /** What Casa is doing on a longer think ("Searching the web: …"), in place of the tip. */
  status?: string | null
  /** The change waiting for a yes: "Add “Jaida watching the kids” · Sat 12–3 PM". */
  pending: string | null
  working: boolean
  note: string | null
  /** Press-to-talk, where the phone's browser can listen. */
  mic?: { listening: boolean; interim: string; toggle: () => void }
  /** The calendar item the latest answer is about. */
  onOpenEvent?: () => void
  /** The day the answer is about (show_day): "Open Saturday, Oct 17". */
  openDay?: { label: string; go: () => void } | null
  /** Directions to someone (canvas 13d): Directions opens Google Maps; Call, Text. */
  directions?: { name: string; address: string; phone: string | null; maps: string } | null
  onSend: (text: string) => void
  onConfirm: () => void
  onCancel: () => void
  onReport: (report: { categories: string[]; expected: string; happened: string }) => Promise<void>
  onClose: () => void
  /** The draft told from the family's day (board 06e); without it, `pending` is shown as words. */
  card?: AssistantCard | null
  /** "Which one?" as tiles (board 06f); a tap sends the name. */
  which?: WhichOne | null
  /** A one-tap yes when the answer offers to do something. */
  offer?: { label: string; say: string } | null
  members?: WallMember[]
  pigmentOf?: (memberId: string) => number | null
  /** A change can take a driver right on the card. */
  onPickDriver?: (name: string) => void
  /** A plan on screen (P3.25; board 12e): shown in the card's place. */
  planSlot?: ReactNode
  /** Casa opened from its button (canvas 32f): the old form one tap away ("Use the form"), and Scan beside the box. */
  onForm?: () => void
  onScan?: () => void
}

const EXAMPLES = ['What’s on Saturday?', 'Who’s driving Liv tomorrow?', 'Add Jaida watching the kids Saturday 12 to 3']

export default function PhoneAssistantView({ lines, thinking, status = null, pending, working, note, mic, onOpenEvent, openDay = null, directions = null, onSend, onConfirm, onCancel, onReport, onClose, card = null, which = null, offer = null, members = [], pigmentOf = () => null, onPickDriver, planSlot = null, onForm, onScan }: PhoneAssistantViewProps) {
  const [text, setText] = useState('')
  const [reporting, setReporting] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [expected, setExpected] = useState('')
  const [happened, setHappened] = useState('')
  const [reportState, setReportState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  // "What can I say?" (board 07f) and a tip while Casa thinks (07e), from the wall's own list.
  const [saying, setSaying] = useState(false)
  const lastAsked = [...lines].reverse().find((l) => l.role === 'user')
  const noted = useRef<string | null>(null)
  useEffect(() => {
    if (!lastAsked || noted.current === lastAsked.id) return
    noted.current = lastAsked.id
    noteSaid(lastAsked.text)
  }, [lastAsked])
  const tip = useMemo(() => (thinking ? tipFor(lastAsked?.text ?? null, lines.length) : null), [thinking, lastAsked?.text, lines.length])

  // The newest line in view as the conversation grows.
  // The conversation stays on its newest line (Jake's iPhone, Oct 2: the keyboard took the list from 693 to 280 pt and it
  // kept its old place, so Casa's answer sat out of sight below the box). It scrolls inside itself — never the page — and
  // whenever its space changes, it stays at the bottom unless you've scrolled up to read.
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    pinned.current = true
  }, [lines.length, thinking, pending, note, card, which, reporting, saying])
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (pinned.current) el.scrollTop = el.scrollHeight })
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [reporting, saying])
  // The box grows with what's typed, up to about five lines, so all of it is in view.
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const shown = mic?.listening && mic.interim ? mic.interim : text
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    // Empty, it's one line (the hint never stretches it); typed in, it grows with the words.
    box.style.height = ''
    if (!shown) return
    box.style.height = 'auto'
    box.style.height = `${Math.max(48, Math.min(box.scrollHeight, 140))}px`
  }, [shown])

  const submit = (value: string) => {
    const q = value.trim()
    if (!q || thinking) return
    onSend(q)
    setText('')
  }
  const sendReport = async () => {
    setReportState('sending')
    try {
      await onReport({ categories, expected, happened })
      setReportState('sent')
    } catch {
      setReportState('failed')
    }
  }
  const backToTalk = () => {
    setReporting(false)
    if (reportState === 'sent') {
      setCategories([])
      setExpected('')
      setHappened('')
      setReportState('idle')
    }
  }

  const round = 'flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink'
  const dark = 'flex h-[48px] items-center justify-center rounded-full border-0 bg-wall-ink px-[20px] text-phone-body font-semibold text-wall-on-pigment disabled:opacity-40'
  const pill = 'flex h-[48px] items-center justify-center rounded-full border border-solid border-wall-ink-2 bg-transparent px-[20px] text-phone-body font-semibold text-wall-ink'
  const field = 'min-h-[88px] w-full resize-none rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment p-[12px] text-phone-body text-wall-ink outline-none'

  return (
    <section aria-label="Ask Casa" className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      <div className="flex shrink-0 items-center gap-[12px] border-0 border-b border-solid border-wall-stone bg-phone-ground px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <button type="button" aria-label="Back" onClick={reporting ? backToTalk : saying ? () => setSaying(false) : onClose} className={round}><ChevronLeft size={20} /></button>
        <h1 className="m-0 flex-1 font-display text-phone-title font-bold text-wall-ink">{reporting ? 'What went wrong?' : saying ? 'What can I say?' : 'Casa'}</h1>
        {!reporting && !saying && onForm && (
          <button type="button" onClick={onForm} className="flex h-[44px] shrink-0 items-center border-0 bg-transparent px-[4px] text-phone-detail font-semibold text-wall-ink-2 underline underline-offset-[3px]">Use the form</button>
        )}
        {!reporting && !saying && (
          <button type="button" aria-label="What can I say?" onClick={() => setSaying(true)} className={`${round} text-wall-brass-ink`}><CircleHelp size={20} /></button>
        )}
        {!reporting && (
          <button type="button" aria-label="Report a problem" onClick={() => setReporting(true)} className={`${round} text-wall-ink-2`}><Bug size={18} /></button>
        )}
      </div>

      {saying && !reporting ? (
        <div className="flex flex-1 flex-col gap-[4px] overflow-y-auto overscroll-contain px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[14px]">
          <div className="text-phone-detail text-wall-ink-2">Say it however you like — these are just the ideas. Ask “Casa, what can you do?” to hear a few.</div>
          {tipsByTopic().map((g) => (
            <section key={g.topic} aria-label={g.topic} className="flex flex-col">
              <h2 className="m-0 mt-[12px] pb-[6px] font-body text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">{g.topic.toUpperCase()}</h2>
              {g.tips.map((t) => <div key={t.id} className="border-0 border-t border-solid border-wall-stone py-[8px] text-phone-body text-wall-ink">{t.text}</div>)}
            </section>
          ))}
        </div>
      ) : reporting ? (
        <div className="flex flex-1 flex-col gap-[14px] overflow-y-auto overscroll-contain px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[16px]">
          <div className="text-phone-detail text-wall-ink-2">The whole conversation goes with it, with the time.</div>
          <div className="flex flex-wrap gap-[8px]">
            {REPORT_CATEGORIES.map((c) => {
              const on = categories.includes(c)
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => setCategories((list) => (on ? list.filter((x) => x !== c) : [...list, c]))} className={`flex h-[44px] items-center rounded-full px-[14px] text-phone-detail font-semibold ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-stone bg-transparent text-wall-ink'}`}>
                  {c}
                </button>
              )
            })}
          </div>
          <label className="flex flex-col gap-[6px]">
            <span className="text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">WHAT DID YOU EXPECT?</span>
            <textarea value={expected} onChange={(e) => setExpected(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-[6px]">
            <span className="text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">WHAT HAPPENED INSTEAD?</span>
            <textarea value={happened} onChange={(e) => setHappened(e.target.value)} className={field} />
          </label>
          <div className="flex gap-[10px]">
            <button type="button" disabled={reportState === 'sending' || reportState === 'sent'} onClick={() => void sendReport()} className={`${dark} flex-1`}>
              {reportState === 'sending' ? 'Sending…' : reportState === 'sent' ? 'Sent' : 'Send report'}
            </button>
            <button type="button" onClick={backToTalk} className={pill}>Back</button>
          </div>
          {reportState === 'sent' && <div className="text-phone-body text-wall-ink">Thank you — sent with the whole conversation.</div>}
          {reportState === 'failed' && <div role="alert" className="text-phone-body text-wall-rust">That didn’t send. Try again in a moment.</div>}
        </div>
      ) : (
        <>
          <div ref={scrollRef} data-ask-scroll onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48 }} className="flex flex-1 flex-col gap-[14px] overflow-y-auto overscroll-contain px-[20px] pb-[16px] pt-[16px]">
            {lines.length === 0 && !thinking && (
              <div className="flex flex-col gap-[10px]">
                <div className="font-display text-phone-heading italic text-wall-ink-2">Ask about the family’s day, or ask to add something. Nothing changes without your yes.</div>
                {EXAMPLES.map((q) => (
                  <button key={q} type="button" onClick={() => submit(q)} className="flex min-h-[44px] items-center self-start rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[14px] text-left text-phone-detail text-wall-ink">
                    “{q}”
                  </button>
                ))}
              </div>
            )}
            {lines.map((l) =>
              l.role === 'user' ? (
                <div key={l.id} className="max-w-[85%] self-end rounded-[18px] rounded-br-[6px] bg-wall-ink px-[14px] py-[10px] text-phone-body text-wall-on-pigment">{l.text}</div>
              ) : (
                <div key={l.id} className="max-w-[92%] whitespace-pre-line text-phone-body text-wall-ink">{l.text}</div>
              ),
            )}
            {thinking && (
              <div className="flex flex-col gap-[6px]">
                <div className="flex items-center gap-[8px] text-phone-detail text-wall-ink-2"><Loader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" /> {status ?? 'Thinking…'}</div>
                {tip && !status && <div className="text-phone-label text-wall-ink-2/80">Tip: {tip}</div>}
              </div>
            )}
            {planSlot ? planSlot : card ? (
              <PhoneCard card={card} members={members} pigmentOf={pigmentOf} working={working} onYes={onConfirm} onNo={onCancel} onPickDriver={card.kind === 'change' ? onPickDriver : undefined} />
            ) : pending && (
              <div className="flex flex-col gap-[12px] rounded-[18px] bg-wall-on-pigment p-[16px]">
                <div className="text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink">DRAFT · NOT SAVED YET</div>
                <div className="whitespace-pre-line font-display text-phone-heading font-bold">{pending}</div>
                <div className="flex gap-[10px]">
                  <button type="button" disabled={working} onClick={onConfirm} className={`${dark} flex-1`}>{working ? 'Saving…' : 'Yes, do it'}</button>
                  <button type="button" disabled={working} onClick={onCancel} className={pill}>No</button>
                </div>
              </div>
            )}
            {which && !thinking && <PhoneWhich which={which} members={members} pigmentOf={pigmentOf} onPick={submit} onNeither={() => submit('Never mind')} />}
            {note && <div className="text-phone-body font-semibold text-wall-ink">{note}</div>}
            {directions && !thinking && (
              <section aria-label={`Directions to ${directions.name}`} className="flex flex-col gap-[10px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment p-[14px]">
                <div className="flex items-baseline justify-between gap-[10px]"><span className="font-display text-phone-heading font-bold leading-tight">{directions.name}</span><span className="text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink">FROM PEOPLE</span></div>
                <div className="text-phone-detail text-wall-ink-2">{directions.address}</div>
                <a href={directions.maps} target="_blank" rel="noreferrer" className="flex h-[48px] items-center justify-center rounded-full bg-wall-ink text-phone-body font-bold text-wall-on-pigment no-underline">Directions — opens Google Maps</a>
                {telOf(directions.phone) && (
                  <div className="flex gap-[8px]">
                    <a href={telOf(directions.phone)!} className="flex h-[44px] flex-1 items-center justify-center rounded-full border border-solid border-wall-ink-2 text-phone-body font-semibold text-wall-ink no-underline">Call</a>
                    <a href={telOf(directions.phone)!.replace('tel:', 'sms:')} className="flex h-[44px] flex-1 items-center justify-center rounded-full border border-solid border-wall-ink-2 text-phone-body font-semibold text-wall-ink no-underline">Text</a>
                  </div>
                )}
              </section>
            )}
            {(offer || onOpenEvent || openDay) && !pending && !thinking && (
              <div className="flex flex-wrap gap-[8px]">
                {offer && <button type="button" onClick={() => submit(offer.say)} className={dark}>{offer.label}</button>}
                {onOpenEvent && <button type="button" onClick={onOpenEvent} className={pill}>Open it</button>}
                {openDay && <button type="button" onClick={openDay.go} className={pill}>{openDay.label}</button>}
              </div>
            )}
          </div>

          <form
            className="flex shrink-0 items-end gap-[8px] border-0 border-t border-solid border-wall-stone bg-phone-ground px-[16px] pb-[max(14px,calc(env(safe-area-inset-bottom)+6px))] pt-[10px]"
            onSubmit={(e) => { e.preventDefault(); submit(text) }}
          >
            {onScan && (
              <button type="button" aria-label="Scan it" onClick={onScan} className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><Camera size={20} /></button>
            )}
            <textarea
              ref={boxRef}
              rows={1}
              aria-label="Ask Casa"
              value={shown}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(text) } }}
              placeholder={mic?.listening ? 'Listening…' : 'Ask or add…'}
              enterKeyHint="send"
              className="h-[48px] max-h-[140px] min-h-[48px] min-w-0 flex-1 resize-none overflow-y-auto rounded-[24px] border border-solid border-wall-stone bg-wall-on-pigment px-[16px] py-[12px] text-phone-body leading-snug text-wall-ink outline-none"
            />
            {mic && (
              // Listening looks like the wall's: a solid brass mic with a ring pulsing out.
              <span className="relative flex h-[48px] w-[48px] shrink-0">
                {mic.listening && <span aria-hidden="true" className="absolute inset-0 animate-[wall-listen-ring_2.4s_ease-out_infinite] rounded-full border-2 border-solid border-wall-brass" />}
                <button type="button" aria-label={mic.listening ? 'Stop listening' : 'Talk'} onClick={mic.toggle} className={`relative flex h-[48px] w-[48px] items-center justify-center rounded-full border-2 border-solid p-0 ${mic.listening ? 'border-wall-brass bg-wall-brass text-wall-on-pigment' : 'border-wall-ink bg-transparent text-wall-ink'}`}>
                  <Mic size={20} />
                </button>
              </span>
            )}
            <button type="submit" aria-label="Send" disabled={!text.trim() || thinking} className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-wall-ink p-0 text-wall-on-pigment disabled:opacity-40">
              <ArrowUp size={20} />
            </button>
          </form>
        </>
      )}
    </section>
  )
}
