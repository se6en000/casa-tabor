import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { formatWallClock } from './clock'
import type { PackingGroup, WallChecklistItem } from './packing'

// The left panel (canvas 56A; Jake, Oct 6: "OK I love this!" → "yup, its a go"). Every face keeps the same panel down
// the left in the same place: the buttons at its top, then now — the clock, the next move, what to take, what's
// still due tonight — and the counts at its foot. The day itself gets the rest of the wall (the stage).
// It always draws in the evening palette (cream on ink); at night a step darker than the night ground.

/** The panel's frame. Its first 88 px are left for the buttons, which WallView pins in the same spot on every face. */
export function RailShell({ night = false, children, foot }: { night?: boolean; children: ReactNode; foot?: ReactNode }) {
  return (
    <aside
      aria-label="Now"
      className={`wall-evening absolute inset-y-0 left-0 flex w-[560px] flex-col px-[52px] pb-[44px] pt-[128px] font-body text-wall-ink ${night ? 'bg-wall-night-rail' : 'bg-wall-rail'}`}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {foot && <div className="flex shrink-0 flex-wrap gap-[10px] pt-[20px]">{foot}</div>}
    </aside>
  )
}

/** The clock at the top of the panel, with a line under it ("Friday, September 25 · 84°", "Friday evening"). */
export function RailClock({ now, size = 'rail', gold = false, children }: { now: Date; size?: 'rail' | 'calm'; gold?: boolean; children?: ReactNode }) {
  const clock = formatWallClock(now)
  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex items-baseline gap-[12px]">
        <span className={`font-display font-medium lining-nums ${size === 'calm' ? 'text-wall-numeral' : 'text-wall-clock-rail'} ${gold ? 'text-wall-brass' : ''}`}>{clock.time}</span>
        <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
      </div>
      {children && <div className={size === 'calm' ? 'mt-[30px]' : 'mt-[20px]'}>{children}</div>}
    </div>
  )
}

/** A thin rule across the panel between its parts. */
export function RailRule() {
  return <div aria-hidden="true" className="my-[26px] h-px shrink-0 bg-wall-rule" />
}

/** A part's small capitals, with an optional count on the right ("1 of 3 ready"). */
export function RailLabel({ children, tone = 'quiet', aside }: { children: ReactNode; tone?: 'quiet' | 'brass' | 'rust'; aside?: ReactNode }) {
  const colour = tone === 'brass' ? 'text-wall-brass' : tone === 'rust' ? 'text-wall-rust' : 'text-wall-ink-2'
  return (
    <div className="flex shrink-0 items-baseline justify-between gap-[16px]">
      <span className={`text-wall-label font-bold tracking-[0.22em] ${colour}`}>{children}</span>
      {aside && <span className="text-wall-label text-wall-ink-2">{aside}</span>}
    </div>
  )
}

/** A count at the panel's foot: "1 to decide", "6 to plan", "3 to do". Brass when it asks for something. */
export function RailCount({ label, onOpen, tone = 'quiet', ariaLabel }: { label: string; onOpen: () => void; tone?: 'quiet' | 'brass'; ariaLabel?: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className={`flex h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border border-solid bg-transparent px-[18px] text-wall-detail font-semibold ${tone === 'brass' ? 'border-wall-brass text-wall-brass' : 'border-wall-rule text-wall-ink'}`}
    >
      {label}
    </button>
  )
}

/**
 * TAKE WITH YOU (canvas 56A with prep; Jake: "dry Liv's cleats, remember Emme's violin, permission slip, wear a pink
 * shirt"): the lists of the events the next move goes to, under it in the panel, so what goes out the door is beside
 * the countdown. Ticked lines stay a moment, faded; the rest of the day's lists are on the stage.
 */
export function TakeWithYou({ groups, onToggleItem, onSeeAll, room = 4 }: {
  groups: PackingGroup[]
  onToggleItem?: (item: WallChecklistItem) => void
  onSeeAll?: () => void
  /** Lines that fit; the rest are under "N more". */
  room?: number
}) {
  const items = groups.flatMap((g) => g.items.map((item) => ({ item, heading: groups.length > 1 ? g.heading.split(' · ')[0] : null })))
  if (items.length === 0) return null
  const ready = items.filter((i) => i.item.checked).length
  // What's still to take first, then what's ready.
  const ordered = [...items.filter((i) => !i.item.checked), ...items.filter((i) => i.item.checked)]
  const shown = ordered.slice(0, room)
  const more = ordered.length - shown.length
  return (
    <section aria-label="Take with you" className="flex shrink-0 flex-col gap-[10px]">
      <RailLabel tone="brass" aside={`${ready} of ${items.length} ready`}>TAKE WITH YOU</RailLabel>
      <div className="flex flex-col rounded-[14px] bg-wall-paper px-[18px] py-[2px]">
        {shown.map(({ item, heading }, i) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.checked}
            disabled={!onToggleItem}
            onClick={(event) => {
              event.stopPropagation()
              onToggleItem?.(item)
            }}
            className={`flex h-[52px] min-w-0 items-center gap-[14px] border-0 bg-transparent p-0 text-left text-wall-ink ${i > 0 ? 'border-t border-solid border-wall-rule' : ''} ${item.checked ? 'opacity-50' : ''}`}
          >
            <span aria-hidden="true" className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border-2 border-solid ${item.checked ? 'border-wall-brass bg-wall-brass text-wall-band' : 'border-wall-ink'}`}>
              {item.checked && <Check size={16} strokeWidth={3} />}
            </span>
            <span className={`min-w-0 truncate text-wall-body ${item.checked ? 'line-through' : ''}`}>{item.label}</span>
            {heading && <span className="shrink-0 truncate text-wall-label text-wall-ink-2">{heading}</span>}
          </button>
        ))}
        {more > 0 && (
          <button
            type="button"
            disabled={!onSeeAll}
            onClick={(event) => {
              event.stopPropagation()
              onSeeAll?.()
            }}
            className="flex h-[44px] items-center border-0 border-t border-solid border-wall-rule bg-transparent p-0 text-left text-wall-detail text-wall-ink-2"
          >
            {more} more
          </button>
        )}
      </div>
    </section>
  )
}
