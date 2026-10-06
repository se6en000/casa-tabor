import { BACK_SPOT } from './backSpot'
import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import WallKeyboard from './WallKeyboard'
import { formatWallClock, formatWallDate } from './clock'
import { comingUpPages, ideasByPerson, planByLine, type ComingUpAction, type ComingUpItem, type GiftIdea } from './comingUp'

// Coming up (board 07a, approved by Jake 2026-09-27): only what needs planning — each item's next
// step, its plan-by date, the gift ideas for it, and three answers. The wall and the desktop show the
// same screen. Opened from the week strip's eighth tile; Back to today, or 2 idle minutes, return.

export interface WallComingUpProps {
  now: Date
  items: ComingUpItem[]
  ideas: GiftIdea[]
  /** YYYY-MM-DD in the family's timezone (from the service). */
  today: string
  onAct: (key: string, action: ComingUpAction) => Promise<void>
  onBack: () => void
  week: ReactNode
  /** A project's step or target opens its project (P3.23, canvas 10e). */
  onOpenProject?: (id: string) => void
  /** A trip away (coverage.ts): opens its sheet, where its runs are covered. */
  onOpenTrip?: (key: string) => void
  /** A season starts as this year's project, then opens (canvas 11c). */
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
      className={`h-[52px] shrink-0 whitespace-nowrap rounded-full px-[20px] text-wall-detail font-semibold ${primary ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-wall-paper text-wall-ink'}`}
    >
      {label}
    </button>
  )
}

function Row({ item, today, onAct, onOpenProject, onStart, onOpenTrip }: { item: ComingUpItem; today: string; onAct: WallComingUpProps['onAct']; onOpenProject?: (id: string) => void; onStart?: (key: string) => void; onOpenTrip?: (key: string) => void }) {
  const day = new Date(`${item.date}T12:00:00Z`)
  const part = (options: Intl.DateTimeFormatOptions) => day.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' }).toUpperCase()
  return (
    <div className="flex items-center gap-[20px] border-0 border-t border-solid border-wall-rule py-[14px]">
      <div className="flex w-[64px] shrink-0 flex-col items-center">
        <span className="text-wall-label font-bold tracking-[0.15em] text-wall-ink-2">{part({ weekday: 'short' })}</span>
        <span className="font-display text-wall-heading font-bold lining-nums">{day.getUTCDate()}</span>
        <span className="text-wall-label font-bold tracking-[0.15em] text-wall-ink-2">{part({ month: 'short' })}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
        {/* One line each, so every row is the height the columns are planned with (comingUpPages). */}
        <span className="truncate font-display text-wall-date font-semibold leading-tight">{item.title}</span>
        <span className="truncate text-wall-body font-bold text-wall-brass-ink">{item.nextStep}</span>
        <span className={`text-wall-detail ${item.late ? 'font-semibold text-wall-rust' : 'text-wall-ink-2'}`}>{planByLine(item, today)}</span>
        {item.ideas && item.ideas.length > 0 && <span className="truncate text-wall-detail text-wall-ink-2">Gift ideas: {item.ideas.join('; ')}</span>}
      </div>
      {item.tripKey ? (
        // A trip away: its coverage is set in the trip sheet (Done / Snooze have nothing to mean here).
        <div className="flex shrink-0 gap-[8px]">
          {onOpenTrip && <Answer label="Open trip" primary onClick={() => onOpenTrip(item.tripKey!)} />}
        </div>
      ) : (
      <div className="flex shrink-0 gap-[8px]">
        <Answer label="Done" primary onClick={() => void onAct(item.key, 'done')} />
        {item.projectId && onOpenProject
          ? <Answer label="Open project" onClick={() => onOpenProject(item.projectId!)} />
          : item.startable && onStart
            ? <Answer label="Start it" onClick={() => onStart(item.key)} />
            : <Answer label="Snooze" onClick={() => void onAct(item.key, 'snooze')} />}
        <Answer label="Not needed" onClick={() => void onAct(item.key, 'dismiss')} />
      </div>
      )}
    </div>
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

export default function WallComingUp({ now, items, ideas, today, onAct, onBack, week, onOpenProject, onStart, onEditIdea, onOpenTrip }: WallComingUpProps) {
  const [ideasOpen, setIdeasOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const startNow = items.filter((i) => i.late || i.pokeOn <= today).length
  // Two columns filled by height; what doesn't fit goes to the next page, behind "N more".
  const pages = comingUpPages(items, today)
  const page = Math.min(pageIndex, Math.max(0, pages.length - 1))
  const columns = pages[page] ?? []
  const shownBefore = pages.slice(0, page + 1).flat(2).length
  const more = items.length - shownBefore
  const clock = formatWallClock(now)

  return (
    <div className="relative flex h-full w-full flex-col gap-[18px] bg-wall-ground p-[44px] font-body text-wall-ink">
      <header className="flex h-[150px] shrink-0 items-stretch gap-[48px]">
        <div className="flex w-[420px] shrink-0 flex-col justify-center gap-[6px]">
          <div className="flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="font-display text-wall-date italic text-wall-ink-2">{formatWallDate(now)}</div>
        </div>
        <div className="w-px shrink-0 bg-wall-rule" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-[32px]">
          <div className="flex min-w-0 flex-col gap-[8px]">
            <div className="text-wall-label font-bold tracking-[0.25em] text-wall-brass-ink">COMING UP · WHAT NEEDS PLANNING</div>
            <div className="font-display text-wall-move font-semibold">{items.length === 0 ? 'Nothing to plan' : `${items.length} thing${items.length === 1 ? '' : 's'} to plan`}</div>
            <div className="truncate text-wall-body text-wall-ink-2">
              {startNow > 0 ? `${startNow === 1 ? 'One' : startNow === 2 ? 'Two' : startNow} to start now. ` : ''}Games, school runs and chores are left off — they’re on the days.
            </div>
          </div>
        </div>
      </header>
      {/* Where a far day has its Back to today: under the +, mic and MT buttons (Jake, Oct 6: it rode up into them). */}
      <div className={`${BACK_SPOT} flex gap-[12px]`}>
        {more > 0 && <Answer label={`${more} more`} onClick={() => setPageIndex(page + 1)} />}
        {more === 0 && page > 0 && <Answer label="First page" onClick={() => setPageIndex(0)} />}
        <Answer label={`Gift ideas · ${ideas.length}`} onClick={() => setIdeasOpen(true)} />
        <Answer label="Back to today" onClick={onBack} />
      </div>

      <div className="flex min-h-0 flex-1 gap-[44px] overflow-hidden">
        {items.length === 0 && (
          <div className="font-display text-wall-date italic text-wall-ink-2">Nothing needs getting ready for now. Say “any spirit day, give me 5 days” to teach it what to watch for.</div>
        )}
        {items.length > 0 && [0, 1].map((c) => (
          <div key={c} className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {(columns[c] ?? []).map(({ item, heading }) => (
              <div key={item.key}>
                {heading && (
                  <div className="pb-[8px] pt-[10px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">{heading}</div>
                )}
                <Row item={item} today={today} onAct={onAct} onOpenProject={onOpenProject} onStart={onStart} onOpenTrip={onOpenTrip} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {week}
      {ideasOpen && <IdeasSheet ideas={ideas} onEdit={onEditIdea} onClose={() => setIdeasOpen(false)} />}
    </div>
  )
}
