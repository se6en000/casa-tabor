import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { fitPackingColumns, type FittedPackingGroup, type PackingGroup, type WallChecklistItem } from './packing'
import { PackingItem } from './WallPackingSheet'

// Get & pack (boards 04b and, for today, row 18): each event's things still to do, and one "N packed" line for what's
// done — a tap on it (or See all) opens the whole list with every tick, to check what someone else marked done
// (Jake, 2026-10-01: "able to see what was checked off … in case someone checked something that wasn't done").
// Shared by the evening face and today's.

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
          className="flex h-[44px] items-center gap-[10px] border-0 bg-transparent p-0 pl-[4px] text-left text-wall-detail text-wall-ink-2"
        >
          <Check size={18} strokeWidth={2.5} aria-hidden="true" />
          {group.packed} packed
        </button>
      )}
    </div>
  )
}

export interface GetAndPackProps {
  packing: { groups: PackingGroup[]; packed: number; total: number }
  /** Rows per column that fit where it sits. */
  lines: number
  /** The section's name for screen readers ("Pack tonight", "Get & pack today"). */
  label: string
  onToggleItem?: (item: WallChecklistItem) => void
  onOpenEvent?: (eventId: string) => void
  onSeeAll?: () => void
}

export function GetAndPack({ packing, lines, label, onToggleItem, onOpenEvent, onSeeAll }: GetAndPackProps) {
  const { columns, hidden } = useMemo(() => fitPackingColumns(packing.groups, lines, 2), [packing.groups, lines])
  return (
    <section aria-label={label} className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-[44px] shrink-0 items-center justify-between gap-[16px]">
        <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">GET &amp; PACK · {packing.packed} OF {packing.total} DONE</span>
        {onSeeAll && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSeeAll()
            }}
            className="h-[44px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-wall-detail font-semibold text-wall-ink"
          >
            {hidden > 0 ? `See all · ${hidden} more` : 'See all'}
          </button>
        )}
      </div>
      <div className="grid min-h-0 grid-cols-2 gap-x-[32px]">
        {columns.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-col">
            {col.map((group) => <PackingGroupView key={group.eventId} group={group} onToggleItem={onToggleItem} onOpenEvent={onOpenEvent} onSeeAll={onSeeAll} />)}
          </div>
        ))}
      </div>
    </section>
  )
}
