import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bell, CalendarDays, Check, Mic, X } from 'lucide-react'
import WallKeyboard from './WallKeyboard'
import { formatWallDate } from './clock'
import { horizonDate, horizonGroups, horizonPages, horizonTone, ideasByPerson, projectWhen, reminderMark, type AheadProject, type ComingUpAction, type ComingUpItem, type GiftIdea, type HandledItem } from './comingUp'
import type { ActExtra } from './useComingUp'
import { RailClock, RailNav, RailRule, RailShell } from './WallRail'

// Ahead — drawn as On the Horizon (canvas 63–64; Jake, Oct 7: "this is more of a Future view, vs a planner, that done on the to do side"
// → "lets go with On the Horizon" → "ahead maybe the better page name" → "please dont make this 3 buttons for each row" → the list with a timeline). What's
// coming, nearest boldest. A tap on a line talks it through with Alexa (she marks it handled when that makes something);
// ✕ not for us — fewer like it; the small ✓ for something done outside the app. A cleared line says so for a moment,
// fades, and the list closes up; the strip below is the weeks ahead as dots, handled ones as ✓.

export interface WallComingUpProps {
  now: Date
  items: ComingUpItem[]
  /** Projects, one card each above the timeline (canvas 69B). */
  projects?: AheadProject[]
  ideas: GiftIdea[]
  /** What was handled, with what was done: the timeline's ✓s. */
  handled?: HandledItem[]
  /** YYYY-MM-DD in the family's timezone (from the service). */
  today: string
  /** ✓ or ✕ (with what it keeps, or "fewer like this"); the words a ✕ taught. */
  onAct: (key: string, action: ComingUpAction, extra?: ActExtra) => Promise<string | null | void>
  onBack: () => void
  /** No longer shown (the strip below is the timeline); kept so callers needn't change. */
  week?: ReactNode
  /** The way around, at the left panel's foot (canvas 59): ‹ Today and the counts, this page filled in. */
  tabs?: ReactNode
  /** A tap on a line: talk it through with Alexa. */
  onTalk?: (item: ComingUpItem) => void
  /** A project's step or target opens its project (P3.23, canvas 10e). */
  onOpenProject?: (id: string) => void
  /** A trip away (coverage.ts): opens its sheet, where its runs are covered. */
  onOpenTrip?: (key: string) => void
  /** What a handled one made (its reminder or event), opened from the timeline. */
  onOpenEvent?: (id: string) => void
  /** Kept for callers; seasons start from the To do shelf now. */
  onStart?: (key: string) => void
  /** A gift idea corrected by hand, or removed (null). */
  onEditIdea?: (id: string, idea: string | null) => Promise<void>
}

function Answer({ label, primary = false, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`h-[48px] shrink-0 whitespace-nowrap rounded-full px-[20px] text-wall-detail font-semibold ${primary ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-wall-paper text-wall-ink'}`}
    >
      {label}
    </button>
  )
}

/** How long a cleared line says so before it fades (Jake: "its satisfying to chek soemthing off and know … for a moment"). */
export const CLEAR_HOLD_MS = 1600
const FADE_MS = 400

type Leaving = { kind: 'handled' | 'dismissed'; phase: 'hold' | 'fade' }

const without = <T,>(o: Record<string, T>, key: string): Record<string, T> => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))

const DOT = { rust: 'bg-wall-rust', brass: 'bg-wall-brass', stone: 'bg-wall-stone' } as const

function HorizonRow({ item, now, leaving, dim, onTalk, onHandle, onDismiss, onUndo }: { item: ComingUpItem; now: Date; leaving: Leaving | null; dim: boolean; onTalk: () => void; onHandle: () => void; onDismiss: () => void; onUndo: () => void }) {
  const tone = horizonTone(item)
  const gone = leaving?.phase === 'fade'
  return (
    // The row folds away (grid rows 1fr → 0fr) as it fades, so the lines below slide up into its place.
    <div className={`grid transition-[grid-template-rows,opacity] duration-[400ms] ease-out ${gone ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
      <div className="overflow-hidden">
        <div className={`flex items-center gap-[16px] border-0 border-b border-solid border-wall-stone py-[10px] transition-opacity duration-300 ${dim ? 'opacity-35' : ''} ${leaving ? 'opacity-60' : ''}`}>
          <button type="button" aria-label={item.tripKey ? `Open trip: ${item.title}` : item.projectId ? `Open project: ${item.title}` : `Talk about ${item.title} with Alexa`} disabled={Boolean(leaving)} onClick={(e) => { e.stopPropagation(); onTalk() }}
            className="flex min-h-[64px] min-w-0 flex-1 items-center gap-[16px] border-0 bg-transparent p-0 text-left text-wall-ink">
            <span aria-hidden="true" className={`h-[12px] w-[12px] shrink-0 rounded-full ${DOT[tone]}`} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`truncate font-display text-wall-date font-semibold ${leaving?.kind === 'dismissed' ? 'line-through' : ''}`}>{item.title}</span>
              {leaving ? (
                <span className="text-wall-detail text-wall-brass-ink">{leaving.kind === 'handled' ? '✓ Handled' : 'Not for us — fewer like this'}</span>
              ) : (
                <>
                  <span className="truncate text-wall-detail text-wall-ink-2">{item.nextStep}</span>
                  {/* What's already set (canvas 66): so a glance — or Alexa — knows it's in hand. */}
                  {(item.onCalendar || item.reminder) && (
                    <span className="mt-[2px] flex items-center gap-[18px] whitespace-nowrap text-wall-label font-semibold text-wall-brass-ink">
                      {item.onCalendar && <span className="flex items-center gap-[6px]"><CalendarDays size={17} aria-hidden="true" />On the calendar</span>}
                      {item.reminder && <span className="flex items-center gap-[6px]"><Bell size={17} aria-hidden="true" />{reminderMark(item.reminder, now)}</span>}
                    </span>
                  )}
                </>
              )}
            </span>
            <span className="shrink-0 whitespace-nowrap text-wall-label font-semibold text-wall-ink-2">{horizonDate(item.date)}</span>
            {!leaving && !item.tripKey && !item.projectId && <Mic aria-hidden="true" size={22} className="shrink-0 text-wall-brass-ink" />}
          </button>
          {leaving ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); onUndo() }} className="h-[48px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-wall-paper px-[18px] text-wall-detail font-semibold text-wall-ink">Undo</button>
          ) : (
            <>
              <button type="button" aria-label={`Not for us: ${item.title}`} onClick={(e) => { e.stopPropagation(); onDismiss() }}
                className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-solid border-wall-stone bg-transparent p-0 text-wall-ink-2"><X size={20} /></button>
              <button type="button" aria-label={`Handled: ${item.title}`} onClick={(e) => { e.stopPropagation(); onHandle() }}
                className="flex h-[48px] w-[44px] shrink-0 items-center justify-center border-0 bg-transparent p-0 text-wall-ink-2 opacity-70"><Check size={18} /></button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const STRIP_DAYS = 84

/**
 * The weeks ahead as dots (Jake's note on 63A: "a small timeline on the bottom with dots for the days things are
 * happening, so can see the clusters … on touch or mouse over … highlight the week"): a dot a thing on its day, a ✓
 * for one handled; a tap (or the mouse) on a week lights it and its lines; a tap on a ✓ says what was done.
 */
function HorizonStrip({ items, projects = [], handled, today, focus, onFocus, onOpenEvent }: { items: ComingUpItem[]; projects?: AheadProject[]; handled: HandledItem[]; today: string; focus: number | null; onFocus: (week: number | null) => void; onOpenEvent?: (id: string) => void }) {
  const [shown, setShown] = useState<HandledItem | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => { onFocus(pinned ?? hover) }, [pinned, hover]) // eslint-disable-line react-hooks/exhaustive-deps -- onFocus is the page's setter
  const dayOf = (date: string) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  const pct = (d: number) => `${(Math.max(0, Math.min(STRIP_DAYS, d)) / STRIP_DAYS) * 100}%`
  const stacks = new Map<number, number>()
  const stackAt = (d: number) => { const n = stacks.get(d) ?? 0; stacks.set(d, n + 1); return n }
  const weeks = Array.from({ length: Math.ceil(STRIP_DAYS / 7) }, (_, w) => w)
  const label = (d: number) => new Date(Date.parse(`${today}T12:00:00Z`) + d * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const inWeek = (w: number) => items.filter((i) => Math.floor(dayOf(i.date) / 7) === w).length
  return (
    <section aria-label="The weeks ahead" className="relative h-[150px] shrink-0 rounded-[22px] bg-wall-paper shadow-[0_1px_0_rgba(38,34,29,0.06),0_8px_22px_rgba(38,34,29,0.12)]" onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null) }}>
      <div className="absolute inset-x-[30px] bottom-[42px] top-[34px]">
        {/* The weeks: a tap (or the mouse) lights one. */}
        {weeks.map((w) => (
          <button key={w} type="button" aria-label={`Week of ${label(w * 7)} · ${inWeek(w)} ${inWeek(w) === 1 ? 'thing' : 'things'}`} aria-pressed={pinned === w}
            // A tap (or click) pins a week until it's tapped again; a mouse passing over shows one meanwhile.
            onClick={() => setPinned((p) => (p === w ? null : w))} onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(w) }}
            style={{ left: pct(w * 7), width: pct(7) }}
            className={`absolute inset-y-0 rounded-[12px] border-0 p-0 ${focus === w ? 'bg-wall-brass/15 outline outline-2 outline-wall-brass-ink' : 'bg-transparent'}`} />
        ))}
        <span aria-hidden="true" className="absolute inset-x-0 top-[56px] h-[2px] bg-wall-ink-2/40" />
        {items.map((i) => {
          const d = dayOf(i.date)
          if (d < 0 || d > STRIP_DAYS) return null
          const tone = horizonTone(i)
          const n = stackAt(d)
          const dim = focus != null && Math.floor(d / 7) !== focus
          return <span key={i.key} aria-hidden="true" style={{ left: pct(d), top: 60 - n * 16 }} className={`pointer-events-none absolute h-[14px] w-[14px] -translate-x-1/2 rounded-full ${DOT[tone]} ${dim ? 'opacity-35' : ''}`} />
        })}
        {/* A project: one bigger dot at its target (or its last step), the steps left in it (canvas 68). */}
        {projects.map((p) => {
          if (!p.date || p.left === 0) return null
          const d = dayOf(p.date)
          if (d < 0 || d > STRIP_DAYS) return null
          const dim = focus != null && Math.floor(d / 7) !== focus
          const size = p.left >= 5 ? 'h-[34px] w-[34px]' : 'h-[30px] w-[30px]'
          return <span key={p.key} aria-hidden="true" style={{ left: pct(d), top: 66 }} className={`pointer-events-none absolute flex ${size} -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-wall-brass-ink text-wall-label font-bold text-wall-on-pigment ring-[3px] ring-wall-paper ${dim ? 'opacity-35' : ''}`}>{p.left}</span>
        })}
        {handled.map((h) => {
          const d = dayOf(h.date)
          if (d < -7 || d > STRIP_DAYS) return null
          const n = stackAt(Math.max(0, d))
          return (
            <button key={h.key} type="button" aria-label={`Handled: ${h.title} — ${h.text}`} onClick={() => setShown(shown?.key === h.key ? null : h)}
              style={{ left: pct(d), top: 56 - n * 16 }}
              className="absolute flex h-[22px] w-[22px] -translate-x-1/2 items-center justify-center rounded-full border-2 border-solid border-wall-brass-ink bg-wall-on-pigment p-0 text-wall-brass-ink">
              <Check size={12} strokeWidth={3.5} />
            </button>
          )
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-[30px] bottom-[14px] h-[20px] text-wall-label font-semibold text-wall-ink-2">
        {[0, 7, 14, 28, 56].map((d) => <span key={d} style={{ left: pct(d) }} className="absolute whitespace-nowrap">{d === 0 ? 'Today' : label(d)}</span>)}
      </div>
      <span className="pointer-events-none absolute right-[24px] top-[12px] flex items-center gap-[14px] text-wall-label text-wall-ink-2">
        <span className="flex items-center gap-[6px]"><span className="h-[11px] w-[11px] rounded-full bg-wall-brass" />coming</span>
        <span className="flex items-center gap-[6px]"><span className="h-[13px] w-[13px] rounded-full border-2 border-solid border-wall-brass-ink" />done</span>
        {projects.some((p) => p.left > 0) && <span className="flex items-center gap-[6px]"><span className="h-[18px] w-[18px] rounded-full bg-wall-brass-ink" />project · its steps left inside</span>}
      </span>
      {focus != null && <span className="pointer-events-none absolute left-[30px] top-[8px] text-wall-label font-bold tracking-[0.16em] text-wall-brass-ink">{`${label(focus * 7)} – ${label(focus * 7 + 6)}`.toUpperCase()} · {inWeek(focus)} {inWeek(focus) === 1 ? 'THING' : 'THINGS'}</span>}
      {shown && (
        <div role="status" className="absolute bottom-[160px] left-1/2 flex max-w-[90%] -translate-x-1/2 items-center gap-[14px] rounded-[14px] bg-wall-ink px-[18px] py-[12px] text-wall-detail font-semibold text-wall-on-pigment shadow-[0_6px_16px_rgba(38,34,29,0.25)]">
          <span className="truncate">✓ {shown.title} · {shown.text}{shown.by === 'alexa' ? ' · by Alexa' : ''}</span>
          {shown.eventId && onOpenEvent && <button type="button" onClick={() => onOpenEvent(shown.eventId!)} className="shrink-0 rounded-full border-0 bg-wall-on-pigment px-[14px] py-[6px] text-wall-detail font-semibold text-wall-ink">Open ›</button>}
        </div>
      )}
    </section>
  )
}

// Gift ideas, each one correctable by hand (Jake, 2026-09-29: "some brands don't get translated well and
// I need to correct it, otherwise I will forget what I was talking about"): tap to fix it on the
// keyboard (with Say it), or take it off.
function IdeasSheet({ ideas, onClose, onEdit }: { ideas: GiftIdea[]; onClose: () => void; onEdit?: (id: string, idea: string | null) => Promise<void> }) {
  const people = ideasByPerson(ideas)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const save = () => {
    if (editing && editing.text.trim()) void onEdit?.(editing.id, editing.text.trim())
    setEditing(null)
  }
  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-wall-ink/30" onClick={(event) => { event.stopPropagation(); if (editing) save(); else onClose() }}>
      <section aria-label="Gift ideas" className="flex h-full w-[760px] flex-col gap-[20px] bg-wall-ground p-[44px]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-display text-wall-move font-semibold">Gift ideas</div>
          <Answer label="Close" onClick={onClose} />
        </div>
        <div className="text-wall-body text-wall-ink-2">Say “gift idea for Kelly: …” any time to add one.{onEdit ? ' Tap one to fix its words.' : ''}</div>
        {people.length === 0 && <div className="font-display text-wall-date italic text-wall-ink-2">None saved yet.</div>}
        {people.map((p) => (
          <div key={p.name} className="flex flex-col gap-[6px] border-0 border-t border-solid border-wall-rule py-[12px]">
            <span className="font-display text-wall-date font-semibold">{p.name}</span>
            {p.items.map((g) => (editing && editing.id === g.id ? (
              <div key={g.id} className="flex min-h-[56px] items-center rounded-[12px] border-[3px] border-solid border-wall-brass-ink bg-wall-on-pigment px-[16px] text-wall-body">
                <span className="min-w-0 break-words">{editing.text}</span>
                <span aria-hidden="true" className="ml-[3px] inline-block h-[28px] w-[3px] shrink-0 bg-wall-ink" />
              </div>
            ) : (
              <div key={g.id ?? g.idea} className="flex items-center gap-[10px]">
                <button type="button" aria-label={`Change “${g.idea}”`} disabled={!onEdit || !g.id} onClick={() => { setRemoving(null); setEditing({ id: g.id!, text: g.idea }) }}
                  className="min-h-[56px] min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-wall-body text-wall-ink">{g.idea}</button>
                {onEdit && g.id && (removing === g.id
                  ? <Answer label="Yes, remove it" onClick={() => { setRemoving(null); void onEdit(g.id!, null) }} />
                  : <button type="button" aria-label={`Remove “${g.idea}”`} onClick={() => setRemoving(g.id!)} className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-rule bg-wall-paper p-0 text-wall-ink-2"><X size={20} /></button>)}
              </div>
            )))}
          </div>
        ))}
      </section>
      {editing && <WallKeyboard showsValue value={editing.text} onChange={(text) => setEditing((e) => e && { ...e, text })} onDone={save} />}
    </div>
  )
}

const PIP = 'inline-block h-[13px] w-[13px] shrink-0 rounded-full'

/**
 * Projects, apart from the dated things (canvas 69B; Jake, Oct 7: "does the viewer get losts having to dicerpher between
 * whats coming up from items vs the projects?"): a card each above the timeline — its steps as pips (filled done), its
 * target or when its steps fall, the next step; a tap opens it. Up to three; the rest are on To do.
 */
function ProjectStrip({ projects, onOpen }: { projects: AheadProject[]; onOpen?: (id: string) => void }) {
  const shown = projects.slice(0, 3)
  return (
    <section aria-label="Projects" className="flex h-[130px] shrink-0 items-stretch gap-[16px]">
      <div className="flex w-[150px] shrink-0 flex-col gap-[8px] pt-[14px]">
        <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">PROJECTS</span>
        <span className="text-wall-label text-wall-ink-2">{projects.length} going{projects.length > shown.length ? ` · ${projects.length - shown.length} more on To do` : ' · steps on To do'}</span>
      </div>
      {shown.map((p) => (
        <button key={p.key} type="button" aria-label={`Open project: ${p.title}`} disabled={!onOpen} onClick={(e) => { e.stopPropagation(); onOpen?.(p.projectId) }}
          className="flex min-w-0 flex-1 flex-col justify-between rounded-[20px] border-[1.5px] border-solid border-wall-brass/40 bg-wall-on-pigment/60 px-[22px] py-[14px] text-left text-wall-ink">
          <span className="flex items-baseline justify-between gap-[10px]">
            <span className="truncate font-display text-wall-date font-semibold">{p.title}</span>
            <span className="shrink-0 whitespace-nowrap text-wall-label font-semibold text-wall-ink-2">{projectWhen(p)}</span>
          </span>
          <span className="flex items-center gap-[6px]" aria-label={`${p.done} of ${p.total} steps done`}>
            {Array.from({ length: Math.min(p.total, 12) }, (_, i) => <span key={i} aria-hidden="true" className={`${PIP} ${i < p.done ? 'bg-wall-brass-ink' : 'border-2 border-solid border-wall-brass-ink'}`} />)}
            <span className="ml-[6px] text-wall-label font-semibold text-wall-brass-ink">{p.done} of {p.total} steps</span>
          </span>
          <span className="flex items-baseline justify-between gap-[12px]">
            <span className="truncate text-wall-label text-wall-ink-2">{p.next ? `Next: ${p.next.title}${p.next.date ? ` · ${horizonDate(p.next.date)}` : ''}` : 'Every step done'}</span>
            <span className="shrink-0 text-wall-label font-semibold text-wall-brass-ink">Open ›</span>
          </span>
        </button>
      ))}
    </section>
  )
}

export default function WallComingUp({ now, items, projects = [], ideas, handled = [], today, onAct, tabs, onTalk, onOpenProject, onOpenTrip, onOpenEvent, onEditIdea }: WallComingUpProps) {
  const [ideasOpen, setIdeasOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [focus, setFocus] = useState<number | null>(null)
  const [leaving, setLeaving] = useState<Record<string, Leaving>>({})
  // Each clearing line's two timers (hold, then fade), so Undo can stop them.
  const [timers] = useState(() => new Map<string, number[]>())
  useEffect(() => () => { for (const list of timers.values()) list.forEach((t) => window.clearTimeout(t)) }, [timers])
  const groups = useMemo(() => horizonGroups(items, today), [items, today])
  // The projects' strip takes two lines' room from the list (canvas 69B).
  const pages = useMemo(() => horizonPages(groups, projects.length ? 7 : 9), [groups, projects.length])
  const page = Math.min(pageIndex, Math.max(0, pages.length - 1))
  const columns = pages[page] ?? [[], []]
  const shownBefore = pages.slice(0, page + 1).flat(2).length
  const more = items.length - shownBefore
  const pageOf = (heading: string) => Math.max(0, pages.findIndex((p) => p.flat().some((e) => e.heading === heading)))
  const dayOf = (date: string) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)

  // ✓ or ✕: it says so for a moment (with Undo), fades and folds away; only then is it sent, so Undo costs nothing.
  const clear = useCallback((item: ComingUpItem, kind: Leaving['kind']) => {
    setLeaving((l) => ({ ...l, [item.key]: { kind, phase: 'hold' } }))
    timers.set(item.key, [
      window.setTimeout(() => setLeaving((l) => (l[item.key] ? { ...l, [item.key]: { kind, phase: 'fade' } } : l)), CLEAR_HOLD_MS),
      window.setTimeout(() => {
        timers.delete(item.key)
        setLeaving((l) => without(l, item.key))
        void onAct(item.key, kind === 'handled' ? 'done' : 'dismiss', kind === 'handled'
          ? { outcome: { text: 'Marked handled', title: item.title, date: item.date, by: 'you' } }
          : { fewer: true, item: { title: item.title, kind: item.kind } })
      }, CLEAR_HOLD_MS + FADE_MS),
    ])
  }, [onAct, timers])
  const undo = useCallback((key: string) => {
    for (const t of timers.get(key) ?? []) window.clearTimeout(t)
    timers.delete(key)
    setLeaving((l) => without(l, key))
  }, [timers])
  const open = (item: ComingUpItem) => {
    if (item.tripKey && onOpenTrip) return onOpenTrip(item.tripKey)
    if (item.projectId && onOpenProject) return onOpenProject(item.projectId)
    onTalk?.(item)
  }

  return (
    <section aria-label="Ahead" className="relative h-full w-full bg-wall-ground font-body text-wall-ink">
      <RailShell foot={tabs}>
        <RailClock now={now}>
          <div className="font-display text-wall-date font-semibold">{formatWallDate(now)}</div>
        </RailClock>
        <RailRule />
        <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass">AHEAD</span>
        <h1 className="m-0 mt-[12px] font-display text-wall-move font-semibold text-wall-ink">{items.length === 0 ? 'Nothing ahead' : `${items.length} ${items.length === 1 ? 'thing' : 'things'}`}</h1>
        <span className="mt-[8px] text-wall-detail text-wall-ink-2">Birthdays, school days, breaks and seasons</span>
        <div className="mt-[28px]">
          <RailNav items={[
            ...groups.map((g) => ({ key: g.key, label: g.heading, aside: String(g.items.length), onOpen: pages.length > 1 ? () => setPageIndex(pageOf(g.heading)) : undefined })),
            ...(projects.length ? [{ key: 'projects', label: 'Projects', aside: String(projects.length) }] : []),
            { key: 'ideas', label: 'Gift ideas', aside: String(ideas.length), onOpen: () => setIdeasOpen(true), ariaLabel: `Gift ideas · ${ideas.length}` },
            ...(more > 0 ? [{ key: 'more', label: 'Next page', aside: `${more} more`, onOpen: () => setPageIndex(page + 1), ariaLabel: `${more} more` }] : more === 0 && page > 0 ? [{ key: 'first', label: 'First page', aside: '', onOpen: () => setPageIndex(0), ariaLabel: 'First page' }] : []),
          ]} />
        </div>
        <p className="m-0 mt-[20px] text-wall-detail text-wall-ink-2">Tap anything to talk it through with Alexa.</p>
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 flex animate-[wall-stage-in_180ms_ease-out] flex-col gap-[24px] px-[64px] pb-[34px] pt-[40px]">
        <div className="flex min-h-0 flex-1 gap-[52px] overflow-hidden">
          {items.length === 0 && (
            <div className="font-display text-wall-date italic text-wall-ink-2">Nothing ahead. Say “any spirit day, give me 5 days” to teach it what to watch for.</div>
          )}
          {items.length > 0 && [0, 1].map((c) => (
            <div key={c} className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {(columns[c] ?? []).map(({ item, heading, tone }) => (
                <div key={item.key}>
                  {heading && (
                    <div className={`pb-[4px] pt-[12px] text-wall-label font-bold tracking-[0.22em] ${tone === 'near' ? 'text-wall-rust' : tone === 'soon' ? 'text-wall-brass-ink' : 'text-wall-ink-2'}`}>{heading.toUpperCase()}</div>
                  )}
                  <HorizonRow now={now} item={item} leaving={leaving[item.key] ?? null} dim={focus != null && Math.floor(dayOf(item.date) / 7) !== focus}
                    onTalk={() => open(item)} onHandle={() => clear(item, 'handled')} onDismiss={() => clear(item, 'dismissed')} onUndo={() => undo(item.key)} />
                </div>
              ))}
            </div>
          ))}
        </div>
        {projects.length > 0 && <ProjectStrip projects={projects} onOpen={onOpenProject} />}
        <HorizonStrip items={items} projects={projects} handled={handled} today={today} focus={focus} onFocus={setFocus} onOpenEvent={onOpenEvent} />
      </div>
      {ideasOpen && <IdeasSheet ideas={ideas} onEdit={onEditIdea} onClose={() => setIdeasOpen(false)} />}
    </section>
  )
}
