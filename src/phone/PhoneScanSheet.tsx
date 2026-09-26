import { useRef, useState } from 'react'
import { Bell, CalendarDays, Camera, Check, ChevronLeft, Images, Loader2 } from 'lucide-react'
import type { WallMember } from '../wall/engine/types'
import { pigmentStyleFor } from '../wall/lanes'
import type { ScannedItem } from '../utils/documentScanner'
import { scanArgs, scanWhen } from './scan'

// Scan it (board 05e): a photo of a flyer, an invite, a schedule — read by the scanner,
// then every date comes back as a ticked draft to check. Only what's ticked is added,
// through the calendar's own create call (people, place, drive time, Google).

export interface PhoneScanSheetProps {
  members: WallMember[]
  pigments: Map<string, number>
  /** Reads the photos (the scanner in the app; a canned answer in the fixture). */
  scan: (files: File[]) => Promise<{ summary: string; items: ScannedItem[] }>
  createEvent: (args: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

type Stage = 'intake' | 'reading' | 'review'

/** About how many characters of a title fit on one line of the review list. */
const TITLE_LINE_CHARS = 26

export default function PhoneScanSheet({ members, pigments, scan, createEvent, onClose }: PhoneScanSheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('intake')
  const [summary, setSummary] = useState('')
  const [items, setItems] = useState<ScannedItem[]>([])
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(0)

  const read = async (files: File[]) => {
    if (files.length === 0) return
    setStage('reading')
    setError('')
    try {
      const result = await scan(files)
      setSummary(result.summary)
      setItems(result.items)
      setFailed({})
      setAdded(0)
      setStage('review')
    } catch (e) {
      setError((e as Error).message || 'That photo couldn’t be read. Try a closer, flatter shot.')
      setStage('intake')
    }
  }
  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    void read(files)
  }
  const patch = (id: string, change: (i: ScannedItem) => Partial<ScannedItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change(i) } : i)))
  const people = members.filter((m) => m.show_on_home_sidebar !== false)
  const ticked = items.filter((i) => i.selected && i.title.trim())

  const addTicked = async () => {
    setBusy(true)
    const misses: Record<string, string> = {}
    let count = 0
    // One at a time, so a miss says which one and the rest still go in.
    for (const item of ticked) {
      try {
        await createEvent(scanArgs(item, members))
        count += 1
      } catch (e) {
        misses[item.id] = (e as Error).message || 'Adding didn’t work.'
      }
    }
    setBusy(false)
    setAdded((n) => n + count)
    if (Object.keys(misses).length === 0) return onClose()
    // What went in leaves the list; what didn't stays, with why.
    setItems((list) => list.filter((i) => misses[i.id] || !i.selected))
    setFailed(misses)
  }

  const pill = 'flex h-[44px] items-center justify-center gap-[8px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-phone-body font-semibold text-wall-ink'
  const dark = 'flex h-[52px] items-center justify-center gap-[8px] rounded-full border-0 bg-wall-ink px-[20px] text-phone-body font-semibold text-wall-on-pigment disabled:opacity-40'

  return (
    <section aria-label="Scan it" className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      <div className="flex shrink-0 items-center gap-[12px] border-0 border-b border-solid border-wall-stone bg-phone-ground px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <button type="button" aria-label="Back" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><ChevronLeft size={20} /></button>
        <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">Scan it</h1>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} />
      <input ref={libraryRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={picked} />

      <div className="flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[16px] pt-[16px]">
        {stage === 'intake' && (
          <div className="flex flex-col gap-[12px]">
            <p className="m-0 font-display text-phone-heading text-wall-ink">A flyer, an invite, a team schedule, a card. Every date on it comes back for you to check.</p>
            <button type="button" className={dark} onClick={() => cameraRef.current?.click()}><Camera size={20} aria-hidden="true" /> Take a photo</button>
            <button type="button" className={pill} onClick={() => libraryRef.current?.click()}><Images size={20} aria-hidden="true" /> Choose photos</button>
            {error && <div role="alert" className="text-phone-body text-wall-rust">{error}</div>}
          </div>
        )}
        {stage === 'reading' && (
          <div className="flex items-center gap-[12px] py-[24px] font-display text-phone-heading italic text-wall-ink-2">
            <Loader2 size={22} className="animate-spin" aria-hidden="true" /> Reading it…
          </div>
        )}
        {stage === 'review' && (
          <div className="flex flex-col">
            <div className="pb-[8px] text-phone-detail text-wall-ink-2">{summary}</div>
            {items.map((item) => (
              <div key={item.id} className="flex gap-[12px] border-0 border-t border-solid border-wall-stone py-[12px]">
                <button
                  type="button"
                  aria-label={`${item.selected ? 'Skip' : 'Add'} ${item.title}`}
                  aria-pressed={item.selected}
                  onClick={() => patch(item.id, (i) => ({ selected: !i.selected }))}
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center border-0 bg-transparent p-0"
                >
                  <span aria-hidden="true" className={`flex h-[24px] w-[24px] items-center justify-center rounded-[6px] border-2 border-solid ${item.selected ? 'border-wall-ink bg-wall-ink text-wall-on-pigment' : 'border-wall-ink-2'}`}>
                    {item.selected && <Check size={16} strokeWidth={3} />}
                  </span>
                </button>
                <div className={`flex min-w-0 flex-1 flex-col gap-[6px] ${item.selected ? '' : 'opacity-50'}`}>
                  {/* Wraps: a flyer's titles run long ("Roosevelt Elementary PTO Fall Festival"). */}
                  <textarea
                    aria-label="Title"
                    value={item.title}
                    rows={Math.max(1, Math.ceil(item.title.length / TITLE_LINE_CHARS))}
                    onChange={(e) => patch(item.id, () => ({ title: e.target.value.replace(/\n/g, ' ') }))}
                    className="field-sizing-content min-w-0 resize-none border-0 border-b border-solid border-transparent bg-transparent p-0 font-display text-phone-heading font-bold text-wall-ink outline-none focus:border-wall-stone"
                  />
                  <div className="text-phone-body text-wall-ink">{scanWhen(item)}</div>
                  {(item.location_name || item.address) && (
                    <div className="text-phone-detail text-wall-ink-2">
                      {[item.location_name, item.address].filter((v, i, all) => v && all.indexOf(v) === i).join(' · ')}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-[6px]">
                    <button
                      type="button"
                      aria-label={item.type === 'event' ? 'An event — make it a reminder' : 'A reminder — make it an event'}
                      onClick={() => patch(item.id, (i) => ({ type: i.type === 'event' ? 'reminder' : 'event' }))}
                      className="flex h-[44px] items-center gap-[6px] rounded-[10px] border-0 bg-phone-card px-[12px] text-phone-detail font-semibold text-wall-ink"
                    >
                      {item.type === 'event' ? <CalendarDays size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
                      {item.type === 'event' ? 'Event' : 'Reminder'}
                    </button>
                    {people.map((m) => {
                      const on = item.selectedMemberIds.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => patch(item.id, (i) => ({ selectedMemberIds: on ? i.selectedMemberIds.filter((id) => id !== m.id) : [...i.selectedMemberIds, m.id] }))}
                          className={`flex h-[44px] items-center rounded-full px-[12px] text-phone-detail font-semibold ${on ? `border-0 text-wall-on-pigment ${pigmentStyleFor(pigments.get(m.id) ?? 0).solid}` : 'border border-solid border-wall-stone bg-transparent text-wall-ink-2'}`}
                        >
                          {m.name}
                        </button>
                      )
                    })}
                  </div>
                  {failed[item.id] && <div role="alert" className="text-phone-detail text-wall-rust">{failed[item.id]}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {stage === 'review' && (
        <div className="flex shrink-0 flex-col gap-[8px] border-0 border-t border-solid border-wall-stone bg-phone-ground px-[20px] pb-[max(18px,calc(env(safe-area-inset-bottom)+8px))] pt-[12px]">
          {added > 0 && <div className="text-phone-detail text-wall-ink-2">Added {added}. The rest are below.</div>}
          <div className="flex gap-[10px]">
            <button type="button" disabled={busy || ticked.length === 0} className={`${dark} flex-1`} onClick={() => void addTicked()}>
              {busy ? 'Adding…' : ticked.length === 0 ? 'Nothing ticked' : `Add ${ticked.length}`}
            </button>
            <button type="button" className={pill} onClick={() => { setItems([]); setStage('intake') }}>Start over</button>
          </div>
          <span className="text-phone-detail text-wall-ink-2">Events go on Google Calendar too.</span>
        </div>
      )}
    </section>
  )
}
