import { Check, X } from 'lucide-react'
import type { PackingGroup, WallChecklistItem } from './packing'

// Everything to get and pack for the day ahead, when it's more than fits under the
// evening Score ("See all"): every event, two columns, each line tappable.

export function PackingItem({ item, onToggle }: { item: WallChecklistItem; onToggle?: (item: WallChecklistItem) => void }) {
  return (
    <button
      type="button"
      aria-pressed={item.checked}
      disabled={!onToggle}
      onClick={(event) => {
        event.stopPropagation()
        onToggle?.(item)
      }}
      className="flex h-[44px] w-full min-w-0 items-center gap-[14px] border-0 bg-transparent p-0 pl-[4px] text-left text-wall-ink"
    >
      <span
        aria-hidden="true"
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] border-2 ${item.checked ? 'border-wall-brass bg-wall-brass text-wall-ground' : 'border-wall-ink-2'}`}
      >
        {item.checked && <Check size={16} strokeWidth={3} />}
      </span>
      <span className={`truncate text-wall-body ${item.checked ? 'text-wall-ink-2 line-through' : ''}`}>{item.label}</span>
    </button>
  )
}

export default function WallPackingSheet({ groups, packed, total, onToggle, onClose }: {
  groups: PackingGroup[]
  packed: number
  total: number
  onToggle: (item: WallChecklistItem) => void
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="pointer-events-none absolute inset-0 bg-wall-ink/20" />
      <section
        aria-label="Everything to pack"
        className="absolute right-0 top-0 flex h-[1080px] w-[1100px] flex-col gap-[20px] rounded-l-[28px] bg-wall-on-pigment px-[56px] py-[40px] font-body text-wall-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">GET &amp; PACK · {packed} OF {total} DONE</div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-[56px] w-[56px] items-center justify-center rounded-full border border-wall-rule bg-transparent p-0 text-wall-ink">
            <X size={22} />
          </button>
        </div>
        <div className="grid min-h-0 grid-cols-2 content-start gap-x-[48px] gap-y-[18px]">
          {groups.map((group) => (
            <div key={group.eventId} className="flex min-w-0 flex-col">
              <div className="truncate border-b border-wall-rule pb-[6px] font-display text-wall-heading font-bold">{group.heading}</div>
              {group.items.map((item) => <PackingItem key={item.id} item={item} onToggle={onToggle} />)}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
