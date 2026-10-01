import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { fitPackingColumns, type FittedPackingGroup, type PackingGroup, type WallChecklistItem } from './packing'
import { PackingItem } from './WallPackingSheet'

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
  columns?: 2 | 3 | 4
  /** The section's name for screen readers ("Pack tonight", "Get & pack today"). */
  label: string
  onToggleItem?: (item: WallChecklistItem) => void
  onOpenEvent?: (eventId: string) => void
  onSeeAll?: () => void
}

const GRID = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' } as const

const ROW_PX = 44

export function GetAndPack({ packing, lines: least, label, columns: across = 2, fill = false, onToggleItem, onOpenEvent, onSeeAll }: GetAndPackProps) {
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
    <section aria-label={label} className={`flex min-w-0 flex-1 flex-col ${fill ? 'min-h-0' : ''}`}>
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
            className="flex h-[44px] shrink-0 items-center gap-[4px] border-0 bg-transparent px-[4px] text-wall-detail text-wall-ink-2"
          >
            {hidden > 0 ? `See all · ${hidden} more` : 'See all'}
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}
      >
        GET &amp; PACK · {packing.packed} OF {packing.total} DONE
      </SectionHeading>
      <div ref={list} className={`grid min-h-0 ${GRID[across]} gap-x-[32px] ${fill ? 'flex-1 content-start overflow-hidden' : ''}`}>
        {columns.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-col">
            {col.map((group) => <PackingGroupView key={group.eventId} group={group} onToggleItem={onToggleItem} onOpenEvent={onOpenEvent} onSeeAll={onSeeAll} />)}
          </div>
        ))}
      </div>
    </section>
  )
}
