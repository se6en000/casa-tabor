import { useState } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { useEmailSettings } from '../wall/useEmailOffers'

// Settings › Email on the phone (canvas 15e, approved by Jake 2026-09-30): Keep me posted (a sender or a topic —
// every such email a line of what it says, never skipped), what's quiet from a Not needed (Bring back), the
// "Email text on the wall" switch, and what Casa reads. Each change is saved at once.

const KIND_WORDS: Record<string, string> = { event: 'events', reminder: 'reminders', todo: 'to-dos', prep: 'things to get ready', shopping: 'shopping', person: 'replies', details: 'updates' }
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')
const label = 'text-phone-label font-bold tracking-[0.16em] text-wall-ink-2'
const row = 'flex min-h-[52px] items-center gap-[10px] border-0 border-t border-solid border-wall-stone py-[6px]'
const small = 'h-[44px] shrink-0 whitespace-nowrap rounded-full border border-solid border-wall-ink-2 bg-transparent px-[14px] text-phone-detail font-semibold text-wall-ink'

export default function PhoneEmailSettings({ onClose, useSettings = useEmailSettings }: { onClose: () => void; useSettings?: typeof useEmailSettings }) {
  const { data, change } = useSettings()
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const save = async (body: Record<string, unknown>, done?: string) => {
    const result = await change(body)
    setNote(result.ok ? done ?? null : result.message ?? 'That didn’t save.')
    return result.ok
  }
  const add = async () => {
    if (!text.trim()) return
    if (await save({ action: 'add_rule', text }, `I’ll keep you posted on ${text.trim()}.`)) setText('')
  }
  const wallOn = data?.text_on_wall !== false
  return (
    <section aria-label="Email settings" className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      <div className="flex shrink-0 items-center gap-[12px] border-0 border-b border-solid border-wall-stone px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <button type="button" aria-label="Back" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><ChevronLeft size={20} /></button>
        <span className="flex flex-col"><span className="text-phone-detail text-wall-ink-2">Settings</span><h1 className="m-0 font-display text-phone-title font-bold leading-none text-wall-ink">Email</h1></span>
      </div>
      <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto overscroll-contain px-[18px] py-[14px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] text-phone-body">
        {note && <div role="status" className="text-phone-detail font-semibold text-wall-brass-ink">{note}</div>}
        <div>
          <div className={label}>KEEP ME POSTED · A LINE FOR EACH EMAIL</div>
          {(data?.keep ?? []).map((k) => (
            <div key={k.id} className={row}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{k.label}</span>
                <span className="text-phone-detail text-wall-ink-2">{k.kind === 'sender' ? 'Every email, never skipped' : 'From anyone'} · {k.source === 'voice' ? 'you said so' : `since ${day(k.created_at)}`}</span>
              </span>
              <button type="button" aria-label={`Stop keeping me posted on ${k.label}`} onClick={() => void save({ action: 'remove_rule', id: k.id }, `No longer keeping you posted on ${k.label}.`)} className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink-2"><X size={16} /></button>
            </div>
          ))}
          {data && data.keep.length === 0 && <div className={`${row} text-phone-detail text-wall-ink-2`}>No one yet. “That one mattered” on a skipped email offers it too.</div>}
          <form onSubmit={(e) => { e.preventDefault(); void add() }} className="flex items-center gap-[8px] border-0 border-t border-solid border-wall-stone pt-[10px]">
            <input aria-label="Keep me posted on" value={text} onChange={(e) => setText(e.target.value)} placeholder="A sender, or what it’s about…" className="h-[44px] min-w-0 flex-1 rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[14px] text-phone-body text-wall-ink outline-none" />
            <button type="submit" className={small}>Add</button>
          </form>
          <div className="mt-[6px] text-phone-detail text-wall-ink-2">Or say it: “Keep me posted on emails from Liv’s coach.”</div>
        </div>
        <div>
          <div className={label}>QUIET · YOU SAID NOT NEEDED</div>
          {(data?.quiet ?? []).map((q) => (
            <div key={q.id} className={row}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{q.from} · {KIND_WORDS[q.kind] ?? q.kind}</span>
                <span className="text-phone-detail text-wall-ink-2">since {day(q.since)} · {q.skipped} skipped since</span>
              </span>
              <button type="button" onClick={() => void save({ action: 'bring_back', id: q.id }, `${q.from}’s ${KIND_WORDS[q.kind] ?? q.kind} will come to you again.`)} className={small}>Bring back</button>
            </div>
          ))}
          {data && data.quiet.length === 0 && <div className={`${row} text-phone-detail text-wall-ink-2`}>Nothing is quiet.</div>}
        </div>
        <div>
          <div className={label}>ON THE WALL</div>
          <div className={`${row} items-start pt-[8px]`}>
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="font-semibold">Email text on the wall</span>
              <span className="text-phone-detail text-wall-ink-2">On: the email’s own words show under each offer. Off for family or guest mode: just the count and the short card.</span>
            </span>
            <button type="button" aria-label="Email text on the wall" aria-pressed={wallOn} onClick={() => void save({ action: 'text_on_wall', on: !wallOn })} className={`relative mt-[4px] h-[34px] w-[56px] shrink-0 rounded-full border-0 p-0 ${wallOn ? 'bg-wall-ink' : 'bg-wall-stone'}`}>
              <span className={`absolute top-[4px] h-[26px] w-[26px] rounded-full bg-wall-on-pigment ${wallOn ? 'left-[26px]' : 'left-[4px]'}`} />
            </button>
          </div>
        </div>
        <div>
          <div className={label}>WHAT CASA READS</div>
          <div className={row}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">Jake’s mail · Tabor Family</span>
              <span className="text-phone-detail text-wall-ink-2">Every 15 minutes, attachments too. It never replies, sends or deletes.</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
