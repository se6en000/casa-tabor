import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import WallKeyboard from './WallKeyboard'
import { formatWallDate } from './clock'
import { comingUpPages, comingUpSections, ideasByPerson, planByLine, type ComingUpAction, type ComingUpItem, type GiftIdea } from './comingUp'
import { RailClock, RailNav, RailRule, RailShell } from './WallRail'

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
  /** The way around, at the left panel's foot (canvas 59): ‹ Today and the counts, this page filled in. */
  tabs?: ReactNode
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
      className={`h-[48px] shrink-0 whitespace-nowrap rounded-full px-[20px] text-wall-detail font-semibold ${primary ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-wall-paper text-wall-ink'}`}
    >
      {label}
    </button>
  )
}

function Row({ item, today, onAct, onOpenProject, onStart, onOpenTrip }: { item: ComingUpItem; today: string; onAct: WallComingUpProps['onAct']; onOpenProject?: (id: string) => void; onStart?: (key: string) => void; onOpenTrip?: (key: string) => void }) {
  const day = new Date(`${item.date}T12:00:00Z`)
  const part = (options: Intl.DateTimeFormatOptions) => day.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' }).toUpperCase()
  return (
    // Beside the left panel (canvas 59) the columns are narrower: the answers sit under the words, so the title stays whole.
    <div className="flex items-start gap-[20px] border-0 border-t border-solid border-wall-rule py-[14px]">
      <div className="flex w-[64px] shrink-0 flex-col items-center pt-[4px]">
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
      {item.tripKey ? (
        // A trip away: its coverage is set in the trip sheet (Done / Snooze have nothing to mean here).
        <div className="mt-[8px] flex shrink-0 gap-[8px]">
          {onOpenTrip && <Answer label="Open trip" primary onClick={() => onOpenTrip(item.tripKey!)} />}
        </div>
      ) : (
      <div className="mt-[8px] flex shrink-0 gap-[8px]">
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

export default function WallComingUp({ now, items, ideas, today, onAct, week, tabs, onOpenProject, onStart, onEditIdea, onOpenTrip }: WallComingUpProps) {
  const [ideasOpen, setIdeasOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const startNow = items.filter((i) => i.late || i.pokeOn <= today).length
  // Two columns filled by height; what doesn't fit goes to the next page, behind "N more".
  const pages = comingUpPages(items, today)
  const page = Math.min(pageIndex, Math.max(0, pages.length - 1))
  const columns = pages[page] ?? []
  const shownBefore = pages.slice(0, page + 1).flat(2).length
  const more = items.length - shownBefore
  const sections = comingUpSections(items, today)
  // Which page each section starts on, so a tap on it in the panel goes there.
  const pageOf = (heading: string) => Math.max(0, pages.findIndex((p) => p.flat().some((e) => sections.find((x) => x.heading === heading)?.items.includes(e.item))))

  return (
    // Canvas 59: the left panel stays — the clock, the buttons, what this page is and its sections, Gift ideas, the
    // way back at its foot — and the list is the stage, with the week strip where it is on Today.
    <section aria-label="Coming up" className="relative h-full w-full bg-wall-ground font-body text-wall-ink">
      <RailShell foot={tabs}>
        <RailClock now={now}>
          <div className="font-display text-wall-date font-semibold">{formatWallDate(now)}</div>
        </RailClock>
        <RailRule />
        <span className="text-wall-label font-bold tracking-[0.22em] text-wall-brass">COMING UP</span>
        <h1 className="m-0 mt-[12px] font-display text-wall-move font-semibold text-wall-ink">{items.length === 0 ? 'Nothing to plan' : `${items.length} to plan`}</h1>
        <span className="mt-[8px] text-wall-detail text-wall-ink-2">{startNow > 0 ? `${startNow === 1 ? 'One' : startNow === 2 ? 'Two' : startNow} to start now` : 'Nothing to start yet'}</span>
        <div className="mt-[28px]">
          <RailNav items={[
            ...sections.map((x) => ({ key: x.heading, label: x.heading.charAt(0) + x.heading.slice(1).toLowerCase(), aside: String(x.items.length), onOpen: pages.length > 1 ? () => setPageIndex(pageOf(x.heading)) : undefined })),
            { key: 'ideas', label: 'Gift ideas', aside: String(ideas.length), onOpen: () => setIdeasOpen(true), ariaLabel: `Gift ideas · ${ideas.length}` },
            ...(more > 0 ? [{ key: 'more', label: 'Next page', aside: `${more} more`, onOpen: () => setPageIndex(page + 1), ariaLabel: `${more} more` }] : more === 0 && page > 0 ? [{ key: 'first', label: 'First page', aside: '', onOpen: () => setPageIndex(0), ariaLabel: 'First page' }] : []),
          ]} />
        </div>
        <p className="m-0 mt-[20px] text-wall-detail text-wall-ink-2">Games, school runs and chores are left off — they’re on the days.</p>
      </RailShell>

      <div className="absolute inset-y-0 left-[560px] right-0 flex animate-[wall-stage-in_180ms_ease-out] flex-col gap-[18px] px-[56px] py-[44px]">
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
      </div>
      {ideasOpen && <IdeasSheet ideas={ideas} onEdit={onEditIdea} onClose={() => setIdeasOpen(false)} />}
    </section>
  )
}
