import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, CalendarDays, Camera, Check, ChevronLeft, Images, Loader2, X } from 'lucide-react'
import type { WallMember } from '../wall/engine/types'
import { pigmentStyleFor } from '../wall/lanes'
import type { ScannedItem } from '../utils/documentScanner'
import { addedLine, scanArgs, scanGroups, scanPlanItems, scanWhen, type ScanPlanItem } from './scan'

// Scan it (board 05e): a photo of a flyer, an invite, a schedule — read by the scanner,
// then every date comes back as a ticked draft to check. Only what's ticked is added,
// through the calendar's own create call (people, place, drive time, Google).
// P3.24 (Jake, 2026-09-30: "Improve the scanner"): what to bring or wear is packing for its event, shown
// under it; something already on the calendar gets what's new added to it (never a second copy) — both
// saved through the plan engine (event_details, pack) after the new events are made.

export interface PhoneScanSheetProps {
  members: WallMember[]
  pigments: Map<string, number>
  /** Reads the photos (the scanner in the app; a canned answer in the fixture). */
  scan: (files: File[]) => Promise<{ summary: string; items: ScannedItem[] }>
  /** Creates one event; its id, for the packing that goes onto it. */
  createEvent: (args: Record<string, unknown>) => Promise<string | null | void>
  /** Saves what's new for events already there, and the packing, in one plan (P3.24). */
  applyPlan?: (title: string, items: ScanPlanItem[]) => Promise<void>
  /** Looks up the calendar on the scanned days for things already there (item id → the match). */
  findSimilar?: (items: ScannedItem[]) => Promise<Record<string, SimilarEvent>>
  /** What clashes for whoever it's for (step 5), said as Casa's card says it; a warning, never a block. */
  clashesFor?: (start: Date, end: Date, memberIds: string[]) => string[]
  onClose: () => void
}

type Stage = 'intake' | 'reading' | 'review' | 'added'

/** Something already on the calendar that a scanned item probably is (a second scan of the same flyer). */
export type SimilarEvent = { id: string; title: string; start_time: string }

/** About how many characters of a title fit on one line of the review list. */
const TITLE_LINE_CHARS = 26

/** The phone's UTC offset, "-04:00". */
function localOffset(): string {
  const m = -new Date().getTimezoneOffset()
  return `${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`
}

export default function PhoneScanSheet({ members, pigments, scan, createEvent, applyPlan, findSimilar, clashesFor, onClose }: PhoneScanSheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('intake')
  const [summary, setSummary] = useState('')
  const [items, setItems] = useState<ScannedItem[]>([])
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(0)
  // What went in, said plainly afterwards (Jake, 2026-09-28: "everything went away, so I can't tell").
  const [addedLines, setAddedLines] = useState<string[]>([])
  const [already, setAlready] = useState<Record<string, SimilarEvent>>({})
  // Several photos, read together (Jake, Oct 2: "snap multiple photo then it can scan. so it takes into account all the
  // information at once"): each photo joins a tray; Read sends them all in one go, as pages of the same thing.
  const [photos, setPhotos] = useState<File[]>([])
  const thumbs = useMemo(() => photos.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [photos])
  useEffect(() => () => thumbs.forEach((u) => u && URL.revokeObjectURL(u)), [thumbs])

  const read = async (files: File[]) => {
    if (files.length === 0) return
    setStage('reading')
    setError('')
    try {
      const result = await scan(files)
      setSummary(result.summary)
      setFailed({})
      setAdded(0)
      setAddedLines([])
      // Something already on the calendar: what's new goes onto it (ticked), never a second copy.
      const matches = findSimilar ? await findSimilar(result.items.filter((i) => i.type !== 'prep')).catch(() => ({} as Record<string, SimilarEvent>)) : {}
      setAlready(matches)
      setItems(result.items)
      setStage('review')
    } catch (e) {
      setError((e as Error).message || 'That photo couldn’t be read. Try a closer, flatter shot.')
      setStage('intake')
    }
  }
  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length) { setError(''); setPhotos((was) => [...was, ...files]) }
  }
  const patch = (id: string, change: (i: ScannedItem) => Partial<ScannedItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change(i) } : i)))
  const people = members.filter((m) => m.show_on_home_sidebar !== false)
  const ticked = items.filter((i) => i.selected && i.title.trim())
  const groups = scanGroups(items)

  const addTicked = async () => {
    setBusy(true)
    const misses: Record<string, string> = {}
    let count = 0
    const lines: string[] = []
    const created: Record<string, string> = {}
    // New ones one at a time, so a miss says which one and the rest still go in.
    for (const item of groups.events.filter((i) => i.selected && i.title.trim() && !already[i.id])) {
      try {
        const id = await createEvent(scanArgs(item, members))
        if (id) created[item.id] = id
        count += 1
        lines.push(addedLine(item))
      } catch (e) {
        misses[item.id] = (e as Error).message || 'Adding didn’t work.'
      }
    }
    // Then what's new for the ones already there, and the packing, as one plan.
    const plan = scanPlanItems({ items, already, created, members, utcOffset: localOffset() })
    if (plan.length && applyPlan) {
      try {
        await applyPlan(summary || 'A scanned flyer', plan)
        for (const p of plan) {
          if (p.kind === 'event_details') { lines.push(`Added what’s new to ${p.title}`); count += 1 }
        }
        const packFor = new Map<string, string[]>()
        for (const p of plan) if (p.kind === 'pack') packFor.set(p.event_id, [...(packFor.get(p.event_id) ?? []), p.label])
        for (const [eventId, labels] of packFor) {
          const owner = groups.events.find((e) => (already[e.id]?.id ?? created[e.id]) === eventId)
          lines.push(`Pack for ${owner ? already[owner.id]?.title ?? owner.title.trim() : 'it'}: ${labels.join(', ')}`)
          count += labels.length
        }
      } catch (e) {
        for (const ev of groups.events) if (ev.selected && (already[ev.id] || (groups.packs[ev.id] ?? []).some((p) => p.selected))) misses[ev.id] = (e as Error).message || 'Adding what’s new didn’t work.'
      }
    }
    setBusy(false)
    setAdded((n) => n + count)
    setAddedLines((all) => [...all, ...lines])
    if (Object.keys(misses).length === 0) return setStage('added')
    // What went in leaves the list; what didn't stays, with why.
    setItems((list) => list.filter((i) => misses[i.id] || !i.selected))
    setFailed(misses)
  }

  const pill = 'flex h-[44px] items-center justify-center gap-[8px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-phone-body font-semibold text-wall-ink'
  const dark = 'flex h-[52px] items-center justify-center gap-[8px] rounded-full border-0 bg-wall-ink px-[20px] text-phone-body font-semibold text-wall-on-pigment disabled:opacity-40'

  return (
    <section aria-label="Scan it" className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      <div className="flex shrink-0 items-center gap-[12px] border-0 border-b border-solid border-wall-stone bg-phone-ground px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <button type="button" aria-label="Back" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-wall-paper p-0 text-wall-ink"><ChevronLeft size={20} /></button>
        <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">Scan it</h1>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} />
      <input ref={libraryRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={picked} />

      <div className={`flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[16px] pt-[16px] ${stage === 'added' ? 'hidden' : ''}`}>
        {stage === 'intake' && (
          <div className="flex flex-col gap-[12px]">
            <p className="m-0 font-display text-phone-heading text-wall-ink">A flyer, an invite, a team schedule, a card. Every date on it comes back for you to check.</p>
            {photos.length > 0 && (
              <div role="list" aria-label="Photos to read" className="-mx-[20px] flex gap-[10px] overflow-x-auto px-[20px] py-[4px]">
                {photos.map((f, i) => (
                  <div key={`${f.name}-${i}`} role="listitem" className="relative h-[96px] w-[76px] shrink-0 overflow-hidden rounded-[12px] border border-solid border-wall-stone bg-phone-card">
                    {thumbs[i] ? <img src={thumbs[i]!} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-phone-detail text-wall-ink-2">PDF</span>}
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((was) => was.filter((_, j) => j !== i))} className="absolute right-[2px] top-[2px] flex h-[44px] w-[44px] items-start justify-end border-0 bg-transparent p-[4px] text-wall-on-pigment">
                      <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-wall-ink/70"><X size={14} strokeWidth={2.5} /></span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length > 0 && (
              <button type="button" className={dark} onClick={() => { const all = photos; setPhotos([]); void read(all) }}>
                <Check size={20} aria-hidden="true" /> Read {photos.length === 1 ? 'it' : `${photos.length} photos together`}
              </button>
            )}
            <button type="button" className={photos.length ? pill : dark} onClick={() => cameraRef.current?.click()}><Camera size={20} aria-hidden="true" /> {photos.length ? 'Take another' : 'Take a photo'}</button>
            <button type="button" className={pill} onClick={() => libraryRef.current?.click()}><Images size={20} aria-hidden="true" /> {photos.length ? 'Add from photos' : 'Choose photos'}</button>
            {photos.length === 1 && <p className="m-0 text-phone-detail text-wall-ink-2">More than one page? Take another; they’re read together.</p>}
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
            {groups.events.map((item) => (
              <div key={item.id} className="flex gap-[12px] border-0 border-t border-solid border-wall-stone py-[12px]">
                <button
                  type="button"
                  aria-label={`${item.selected ? 'Skip' : 'Add'} ${item.title}`}
                  aria-pressed={item.selected}
                  onClick={() => patch(item.id, (i) => ({ selected: !i.selected }))}
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center border-0 bg-transparent p-0"
                >
                  <span aria-hidden="true" className={`flex h-[24px] w-[24px] items-center justify-center rounded-[6px] border-2 border-solid ${item.selected ? 'border-wall-ink bg-wall-ink text-wall-on-pigment' : 'border-wall-ink-2 bg-wall-paper'}`}>
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
                  {clashesFor && !item.all_day && item.selected && (() => {
                    const a = scanArgs(item, members)
                    return clashesFor(new Date(String(a.start)), new Date(String(a.end)), item.selectedMemberIds).map((c) => <div key={c} className="text-phone-detail font-semibold text-wall-rust">{c}</div>)
                  })()}
                  {(item.location_name || item.address) && (
                    <div className="text-phone-detail text-wall-ink-2">
                      {[item.location_name, item.address].filter((v, i, all) => v && all.indexOf(v) === i).join(' · ')}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-[6px]">
                    <button
                      type="button"
                      aria-label={item.type === 'event' ? 'An event — make it a reminder' : 'A reminder — make it an event'}
                      hidden={Boolean(already[item.id])}
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
                  {already[item.id] && (
                    <div className="text-phone-detail font-semibold text-wall-brass-ink">
                      Already on your calendar: {already[item.id].title} · {new Date(already[item.id].start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. {item.selected ? 'I’ll add what’s new to it.' : 'Left as it is.'}
                    </div>
                  )}
                  {(groups.packs[item.id] ?? []).length > 0 && (
                    <div className="flex flex-col">
                      <span className="pt-[4px] text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">PACK THE NIGHT BEFORE</span>
                      {(groups.packs[item.id] ?? []).map((p) => (
                        <button key={p.id} type="button" aria-pressed={p.selected} aria-label={`${p.selected ? 'Skip' : 'Pack'} ${p.title}`} onClick={() => patch(p.id, (i) => ({ selected: !i.selected }))} className="flex min-h-[44px] items-center gap-[10px] border-0 bg-transparent p-0 text-left text-phone-body text-wall-ink">
                          <span aria-hidden="true" className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border-2 border-solid ${p.selected ? 'border-wall-ink bg-wall-ink text-wall-on-pigment' : 'border-wall-ink-2 bg-wall-paper'}`}>{p.selected && <Check size={14} strokeWidth={3} />}</span>
                          <span className={p.selected ? '' : 'opacity-50'}>{p.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {failed[item.id] && <div role="alert" className="text-phone-detail text-wall-rust">{failed[item.id]}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {stage === 'added' && (
        <div className="flex flex-1 flex-col gap-[12px] overflow-y-auto px-[20px] pt-[16px]">
          <div className="flex items-center gap-[10px] font-display text-phone-heading font-bold text-wall-ink"><Check size={22} strokeWidth={3} aria-hidden="true" /> Added {addedLines.length === 1 ? 'it' : `all ${addedLines.length}`}</div>
          <ul aria-label="Added" className="m-0 flex list-none flex-col p-0">
            {addedLines.map((line) => <li key={line} className="border-0 border-t border-solid border-wall-stone py-[12px] text-phone-body text-wall-ink">{line}</li>)}
          </ul>
          <span className="text-phone-detail text-wall-ink-2">Events are on Google Calendar too. Ask about any of them.</span>
          <div className="flex gap-[10px] pb-[max(18px,calc(env(safe-area-inset-bottom)+8px))]">
            <button type="button" className={`${dark} flex-1`} onClick={onClose}>Done</button>
            <button type="button" className={pill} onClick={() => { setItems([]); setAddedLines([]); setStage('intake') }}>Scan another</button>
          </div>
        </div>
      )}

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
