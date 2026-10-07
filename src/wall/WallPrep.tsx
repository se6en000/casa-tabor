import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { fitPackingColumns, type FittedPackingGroup, type PackingGroup, type WallChecklistItem } from './packing'
import { PackingItem } from './WallPackingSheet'
import { DecisionRow, type DatedDecision } from './WallDecisions'
import type { DecisionAction } from './decisions'

// Get & pack (boards 04b and, for today, row 18): each event's things still to do, and one "N packed" line for what's
// done — a tap on it (or See all) opens the whole list with every tick, to check what someone else marked done
// (Jake, 2026-10-01: "able to see what was checked off … in case someone checked something that wasn't done").
// Shared by the evening face and today's.

/**
 * A section's heading under the lanes: one 44 px row, the label centred in it and an optional link on the right, so
 * every section's rule and first line sit at the same height (Jake, 2026-10-01: "align the thin bars for Needs a
 * decision and Get & Pack").
 */
export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-[44px] shrink-0 items-center justify-between gap-[16px]">
      <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">{children}</span>
      {action}
    </div>
  )
}

function PackingGroupView({ group, onToggleItem, onOpenEvent, onSeeAll }: {
  group: FittedPackingGroup
  onToggleItem?: (item: WallChecklistItem) => void
  onOpenEvent?: (eventId: string) => void
  onSeeAll?: () => void
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        disabled={!onOpenEvent}
        onClick={(event) => {
          event.stopPropagation()
          onOpenEvent?.(group.eventId)
        }}
        className="h-[44px] w-full truncate whitespace-nowrap border-0 border-t border-solid border-wall-rule bg-transparent p-0 pt-[6px] text-left font-display text-wall-heading font-bold text-wall-ink"
      >
        {group.heading}
      </button>
      {group.items.map((item) => <PackingItem key={item.id} item={item} onToggle={onToggleItem} />)}
      {group.showPacked && (
        <button
          type="button"
          disabled={!onSeeAll}
          aria-label={`${group.packed} packed — see what was checked`}
          onClick={(event) => {
            event.stopPropagation()
            onSeeAll?.()
          }}
          className="flex h-[44px] items-center gap-[14px] border-0 bg-transparent p-0 text-left text-wall-detail text-wall-ink-2"
        >
          {/* As wide as a checkbox, so "packed" lines up with the things to pack. */}
          <span aria-hidden="true" className="flex w-[22px] shrink-0 justify-center"><Check size={18} strokeWidth={2.5} /></span>
          {group.packed} packed
        </button>
      )}
    </div>
  )
}

export interface GetAndPackProps {
  packing: { groups: PackingGroup[]; packed: number; total: number }
  /** Rows per column that fit where it sits (with `fill`, only until it has measured). */
  lines: number
  /** Take the height it's given and fill it: as many rows as fit before anything goes under See all. */
  fill?: boolean
  /** Columns that fit across (2 on the evening face; 3–4 on today's, Jake: "can't you fit 3 or 4 columns?"). */
  columns?: 1 | 2 | 3 | 4
  /** In the Prep rail: spans that many of its boxes, its columns exactly on them. */
  inRail?: boolean
  /** The section's name for screen readers ("Pack tonight", "Get & pack today"). */
  label: string
  onToggleItem?: (item: WallChecklistItem) => void
  onOpenEvent?: (eventId: string) => void
  onSeeAll?: () => void
  /** It runs to the wall's right edge, where "Hide routines" floats on its heading row: See all steps left of it. */
  clearEnd?: boolean
}

const GRID = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' } as const
const SPAN = { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4' } as const

const ROW_PX = 44

export function GetAndPack({ packing, lines: least, label, columns: across = 2, fill = false, inRail = false, onToggleItem, onOpenEvent, onSeeAll, clearEnd = false }: GetAndPackProps) {
  // Jake, 2026-10-01: "use that area to show as much as possible on the screen … only use 'see all' when the things
  // truly won't fit." Every line is a 44 px row, so the rows are the list's height over 44.
  const list = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState(0)
  useEffect(() => {
    const el = list.current
    if (!fill || !el) return
    const measure = () => setMeasured(Math.floor(el.clientHeight / ROW_PX))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [fill])
  // Measured, the room decides, up or down (a guess too high cut the last line in half on the evening face).
  const lines = fill && measured > 0 ? measured : least
  const { columns, hidden } = useMemo(() => fitPackingColumns(packing.groups, lines, across), [packing.groups, lines, across])
  // A packed line that didn't fit is the only way to the ticks gone too: See all stands in for it.
  const cut = hidden > 0 || columns.some((col) => col.some((g) => g.packed > 0 && !g.showPacked))
  return (
    <section aria-label={label} className={`flex min-w-0 flex-col ${inRail ? SPAN[across] : 'flex-1'} ${fill ? 'min-h-0' : ''}`}>
      <SectionHeading
        // Only when something truly doesn't fit (Jake, 2026-10-01); "N packed" still opens every tick.
        action={onSeeAll && cut && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSeeAll()
            }}
            // A quiet link like the TOMORROW note's "Open tomorrow ›": it opens the list, it isn't an action.
            className={`flex h-[44px] shrink-0 items-center gap-[4px] border-0 bg-transparent px-[4px] text-wall-detail text-wall-ink-2 ${clearEnd ? 'mr-[220px]' : ''}`}
          >
            {hidden > 0 ? `See all · ${hidden} more` : 'See all'}
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}
      >
        GET &amp; PACK · {packing.packed} OF {packing.total} DONE
      </SectionHeading>
      <div ref={list} className={`grid min-h-0 ${GRID[across]} ${inRail ? 'gap-x-[40px]' : 'gap-x-[32px]'} ${fill ? 'flex-1 content-start overflow-hidden' : ''}`}>
        {columns.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-col">
            {col.map((group) => <PackingGroupView key={group.eventId} group={group} onToggleItem={onToggleItem} onOpenEvent={onOpenEvent} onSeeAll={onSeeAll} />)}
          </div>
        ))}
      </div>
    </section>
  )
}

export interface PrepRailProps {
  decisions: DatedDecision[]
  /** "Needs a decision" / "Needs a decision today". */
  decisionLabel: string
  now: Date
  onAnswer?: (decision: DatedDecision, action: DecisionAction) => Promise<void>
  packing: { groups: PackingGroup[]; packed: number; total: number }
  packLabel: string
  /** The last box's First departure; null on today's face (the Next Move up top says it). */
  departure: ReactNode | null
  onToggleItem?: (item: WallChecklistItem) => void
  onOpenEvent?: (eventId: string) => void
  onSeeAll?: () => void
  /** NEXT UP (canvas 27a), the first box on today's face: the day's chores and timed to-dos, and how many boxes it takes. */
  nextUp?: { node: ReactNode; columns: 1 | 2 } | null
  /** Beside the left panel (canvas 56A): a set height under lanes that take the rest, rather than sharing it. */
  fixed?: boolean
}

/**
 * The Prep rail (Jake named it, 2026-10-01): the row under the lanes. Four boxes of one width, always in the same
 * place, so a swipe between days changes what's in them, not where they are ("when I swipe … there isn't a lot of
 * shifting"). What fills them flows left to right in a fixed order — a decision, then get & pack (one event a box) —
 * and an empty part takes no box. On the days ahead the last box is always First departure, the one thing looked for
 * by place; on today's face the Next Move says it, so get & pack may take that box too. On today's face NEXT UP comes first
 * (Jake, 2026-10-01: "make it the first slot where drivers sometimes goes … we usually figure that out fast").
 */
export function PrepRail({ decisions, decisionLabel, now, onAnswer, packing, packLabel, departure, onToggleItem, onOpenEvent, onSeeAll, nextUp = null, fixed = false }: PrepRailProps) {
  const deciding = decisions.length > 0
  const packBoxes = Math.max(1, 4 - (nextUp?.columns ?? 0) - (deciding ? 1 : 0) - (departure !== null ? 1 : 0)) as 1 | 2 | 3 | 4
  return (
    <div aria-label="Prep rail" role="group" className={`grid grid-cols-4 gap-x-[40px] ${fixed ? 'h-[300px] shrink-0' : 'min-h-0 flex-1'}`}>
      {nextUp?.node}
      {deciding && (
        <section aria-label={decisionLabel} className="flex min-w-0 flex-col">
          <SectionHeading>NEEDS A DECISION · {decisions.length}</SectionHeading>
          {decisions.slice(0, 1).map((d) => (onAnswer
            // The face says which day it is, so the decision doesn't.
            ? <DecisionRow key={d.key} decision={d} now={now} onAnswer={onAnswer} compact showDay={false} />
            : <div key={d.key} className="border-t border-wall-rule pt-[6px] font-display text-wall-heading font-semibold">{d.text}</div>))}
          {decisions.length > 1 && <div className="text-wall-detail text-wall-ink-2">and {decisions.length - 1} more under “to decide”</div>}
        </section>
      )}
      {packing.total > 0 && (
        <GetAndPack packing={packing} lines={3} fill inRail columns={packBoxes} label={packLabel} onToggleItem={onToggleItem} onOpenEvent={onOpenEvent} onSeeAll={onSeeAll} clearEnd={departure === null} />
      )}
      {departure !== null && <div className="col-start-4 flex min-w-0 flex-col">{departure}</div>}
    </div>
  )
}

/**
 * GET READY (canvas 56A, the evening): tomorrow's lists as cards across the stage, one event each — the evening's main
 * job (Jake, Oct 6: "show me tomorrows prep screen … OK I love this!"). What's left to do shows; a tick folds a line
 * into the card's "N packed", which opens the whole list with every tick (row 18: "able to see what was checked off").
 * More than fits waits under See all (its "N more" says how many — no line in the card for it).
 */
export function GetReady({ packing, onToggleItem, onOpenEvent, onSeeAll, cards = 3, lines = 3 }: {
  packing: { groups: PackingGroup[]; packed: number; total: number }
  onToggleItem?: (item: WallChecklistItem) => void
  onOpenEvent?: (eventId: string) => void
  onSeeAll?: () => void
  cards?: number
  lines?: number
}) {
  const shown = packing.groups.slice(0, cards).map((group) => {
    const open = group.items.filter((i) => !i.checked)
    const packed = group.items.length - open.length
    // The "N packed" line takes a line of the card's room.
    const room = packed > 0 ? lines - 1 : lines
    return { group, items: open.slice(0, room), hidden: Math.max(0, open.length - room), packed }
  })
  const hidden = shown.reduce((n, c) => n + c.hidden, 0) + packing.groups.slice(cards).reduce((n, g) => n + g.items.filter((i) => !i.checked).length, 0)
  return (
    <section aria-label="Get ready" className="flex shrink-0 flex-col">
      <SectionHeading
        action={onSeeAll && hidden > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSeeAll()
            }}
            className="flex h-[44px] shrink-0 items-center gap-[4px] border-0 bg-transparent px-[4px] text-wall-detail text-wall-ink-2"
          >
            See all · {hidden} more
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}
      >
        GET READY · {packing.packed} OF {packing.total} DONE
      </SectionHeading>
      <div className="grid grid-cols-3 gap-x-[24px]">
        {shown.map(({ group, items, packed }) => (
          <div key={group.eventId} className="flex min-w-0 flex-col rounded-[18px] bg-wall-paper px-[24px] pb-[8px] pt-[8px] shadow-[0_1px_0_rgba(38,34,29,0.06),0_8px_22px_rgba(38,34,29,0.12)]">
            <button
              type="button"
              disabled={!onOpenEvent}
              onClick={(event) => {
                event.stopPropagation()
                onOpenEvent?.(group.eventId)
              }}
              className="h-[48px] w-full truncate whitespace-nowrap border-0 bg-transparent p-0 text-left font-display text-wall-heading font-bold text-wall-ink"
            >
              {group.heading}
            </button>
            {items.map((item) => (
              <div key={item.id} className="border-0 border-t border-solid border-wall-rule">
                <PackingItem item={item} onToggle={onToggleItem} />
              </div>
            ))}
            {packed > 0 && (
              <button
                type="button"
                disabled={!onSeeAll}
                aria-label={`${packed} packed — see what was checked`}
                onClick={(event) => {
                  event.stopPropagation()
                  onSeeAll?.()
                }}
                className="flex h-[44px] items-center gap-[14px] border-0 border-t border-solid border-wall-rule bg-transparent p-0 text-left text-wall-detail text-wall-ink-2"
              >
                <span aria-hidden="true" className="flex w-[22px] shrink-0 justify-center"><Check size={18} strokeWidth={2.5} /></span>
                {packed} packed
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
