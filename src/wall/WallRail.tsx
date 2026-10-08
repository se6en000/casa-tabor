import { useContext } from 'react'
import { PaperRecall } from './paperRecall'
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      {/* The counts, a quiet ledger under a hairline (canvas 70A). */}
      {foot && <div className="flex shrink-0 flex-wrap items-baseline gap-x-[28px] gap-y-[4px] border-0 border-t border-solid border-wall-rule pt-[10px]">{foot}</div>}
    </aside>
  )
}

/** The clock at the top of the panel, with a line under it ("Friday, September 25 · 84°", "Friday evening"). */

export function RailClock({ now, size = 'rail', gold = false, children }: { now: Date; size?: 'rail' | 'calm'; gold?: boolean; children?: ReactNode }) {
  const clock = formatWallClock(now)
  const openPaper = useContext(PaperRecall)
  const below = size === 'calm' ? 'mt-[30px]' : 'mt-[20px]'
  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex items-baseline gap-[12px]">
        <span className={`font-display font-medium lining-nums ${size === 'calm' ? 'text-wall-numeral' : 'text-wall-clock-rail'} ${gold ? 'text-wall-brass' : ''}`}>{clock.time}</span>
        <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
      </div>
      {children && (openPaper
        // Looks exactly as it did: a tap on it is all that's new.
        ? <button type="button" aria-label="Today’s paper" onClick={(e) => { e.stopPropagation(); openPaper() }} className={`${below} block w-full cursor-default border-0 bg-transparent p-0 text-left [color:inherit] [font:inherit]`}>{children}</button>
        : <div className={below}>{children}</div>)}
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

/**
 * A count at the panel's foot: "1 to decide", "6 ahead", "3 to do". Brass when it asks for something. On To do and
 * Ahead the counts are the way around (canvas 59): "‹ Today" first, and the page you're on marked. Canvas 70A (Jake,
 * Oct 7: "they feel like an after thought can we make them more lux? subtle but like lower case" → "70A please …
 * lower case as you have it"): no pill — the count a serif numeral, the words lowercase, a brass line under the page.
 */
export function RailCount({ label, onOpen, tone = 'quiet', ariaLabel, active = false }: { label: string; onOpen: () => void; tone?: 'quiet' | 'brass'; ariaLabel?: string; active?: boolean }) {
  const back = label.startsWith('‹')
  const counted = /^(\d+)\s+(.*)$/.exec(label)
  const words = (back ? label.replace(/^‹\s*/, '') : counted ? counted[2] : label).toLowerCase()
  const color = tone === 'brass' ? 'text-wall-brass' : 'text-wall-ink'
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className={`flex min-h-[48px] shrink-0 items-baseline gap-[8px] whitespace-nowrap border-0 border-b-2 border-solid bg-transparent px-0 pb-[4px] pt-[6px] ${active ? 'border-wall-brass' : 'border-transparent'} ${color}`}
    >
      {back
        ? <span aria-hidden="true" className="text-wall-body opacity-70">←</span>
        : counted && <span className="font-display text-wall-date font-medium leading-none lining-nums">{counted[1]}</span>}
      <span className={`text-wall-detail font-medium tracking-[0.04em] ${active || tone === 'brass' ? '' : 'opacity-80'}`}>{words}</span>
    </button>
  )
}

/** A part of the page, listed in the panel (To do's folded groups, Coming up's sections): a tap opens or goes to it. */
export function RailNav({ items }: { items: Array<{ key: string; label: string; aside: string; open?: boolean; onOpen?: () => void; ariaLabel?: string }> }) {
  return (
    <nav aria-label="This page" className="flex shrink-0 flex-col">
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          disabled={!item.onOpen}
          aria-label={item.ariaLabel ?? `Show ${item.label}`}
          aria-expanded={item.open}
          onClick={(event) => {
            event.stopPropagation()
            item.onOpen?.()
          }}
          className={`flex h-[52px] items-center justify-between gap-[16px] border-0 bg-transparent p-0 text-left text-wall-body ${i ? 'border-t border-solid border-wall-rule' : ''} ${item.open ? 'font-semibold text-wall-brass' : 'text-wall-ink'}`}
        >
          <span className="truncate">{item.label}</span>
          <span className="shrink-0 text-wall-detail text-wall-ink-2">{item.aside}{item.onOpen ? ' ›' : ''}</span>
        </button>
      ))}
    </nav>
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
