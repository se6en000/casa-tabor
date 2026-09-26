import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bug, ChevronLeft, Loader2, Mic } from 'lucide-react'
import { REPORT_CATEGORIES } from '../wall/bugReport'
import type { PhoneLine } from './assistant'

// Say it (board 05e): the family's assistant on the phone — the same one the wall's band
// talks to. Type (or use the keyboard's dictation, or the mic), read the answer, and a
// change waits for a Yes. The bug icon sends the whole conversation, as on the wall.
// Drawn from props only, so the fixture scripts it (PhoneFixturePage).

export interface PhoneAssistantViewProps {
  lines: PhoneLine[]
  thinking: boolean
  /** The change waiting for a yes: "Add “Jaida watching the kids” · Sat 12–3 PM". */
  pending: string | null
  working: boolean
  note: string | null
  /** Press-to-talk, where the phone's browser can listen. */
  mic?: { listening: boolean; interim: string; toggle: () => void }
  /** The calendar item the latest answer is about. */
  onOpenEvent?: () => void
  onSend: (text: string) => void
  onConfirm: () => void
  onCancel: () => void
  onReport: (report: { categories: string[]; expected: string; happened: string }) => Promise<void>
  onClose: () => void
}

const EXAMPLES = ['What’s on Saturday?', 'Who’s driving Liv tomorrow?', 'Add Jaida watching the kids Saturday 12 to 3']

export default function PhoneAssistantView({ lines, thinking, pending, working, note, mic, onOpenEvent, onSend, onConfirm, onCancel, onReport, onClose }: PhoneAssistantViewProps) {
  const [text, setText] = useState('')
  const [reporting, setReporting] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [expected, setExpected] = useState('')
  const [happened, setHappened] = useState('')
  const [reportState, setReportState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const endRef = useRef<HTMLDivElement>(null)

  // The newest line in view as the conversation grows.
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [lines.length, thinking, pending, note])

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
        <button type="button" aria-label="Back" onClick={reporting ? backToTalk : onClose} className={round}><ChevronLeft size={20} /></button>
        <h1 className="m-0 flex-1 font-display text-phone-title font-bold text-wall-ink">{reporting ? 'What went wrong?' : 'Ask Casa'}</h1>
        {!reporting && (
          <button type="button" aria-label="Report a problem" onClick={() => setReporting(true)} className={`${round} text-wall-ink-2`}><Bug size={18} /></button>
        )}
      </div>

      {reporting ? (
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
          <div className="flex flex-1 flex-col gap-[14px] overflow-y-auto overscroll-contain px-[20px] pb-[16px] pt-[16px]">
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
              <div className="flex items-center gap-[8px] text-phone-detail text-wall-ink-2"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Thinking…</div>
            )}
            {pending && (
              <div className="flex flex-col gap-[12px] rounded-[18px] bg-wall-on-pigment p-[16px]">
                <div className="text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink">DRAFT · NOT SAVED YET</div>
                <div className="font-display text-phone-heading font-bold">{pending}</div>
                <div className="flex gap-[10px]">
                  <button type="button" disabled={working} onClick={onConfirm} className={`${dark} flex-1`}>{working ? 'Saving…' : 'Yes, do it'}</button>
                  <button type="button" disabled={working} onClick={onCancel} className={pill}>No</button>
                </div>
              </div>
            )}
            {note && <div className="text-phone-body font-semibold text-wall-ink">{note}</div>}
            {onOpenEvent && !pending && (
              <button type="button" onClick={onOpenEvent} className={`${pill} self-start`}>Open it</button>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex shrink-0 items-end gap-[8px] border-0 border-t border-solid border-wall-stone bg-phone-ground px-[16px] pb-[max(14px,calc(env(safe-area-inset-bottom)+6px))] pt-[10px]"
            onSubmit={(e) => { e.preventDefault(); submit(text) }}
          >
            <input
              aria-label="Ask Casa"
              value={mic?.listening && mic.interim ? mic.interim : text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mic?.listening ? 'Listening…' : 'Ask, or say what to add'}
              enterKeyHint="send"
              className="h-[48px] min-w-0 flex-1 rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[16px] text-phone-body text-wall-ink outline-none"
            />
            {mic && (
              <button type="button" aria-label={mic.listening ? 'Stop listening' : 'Talk'} onClick={mic.toggle} className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border-2 border-solid border-wall-ink bg-transparent p-0 text-wall-ink ${mic.listening ? 'ring-[6px] ring-wall-ink/15' : ''}`}>
                <Mic size={20} />
              </button>
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
