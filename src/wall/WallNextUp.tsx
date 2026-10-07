import { Check, ChevronRight, MapPin } from 'lucide-react'
import { formatWallClock } from './clock'
import type { WallMember } from './engine/types'
import { pigmentStyleFor } from './lanes'
import { SectionHeading } from './WallPrep'
import type { NextUpItem } from './nextUp'

// The day's small timed jobs (canvas 27a, 28c): NEXT UP, the first slot of the full day's rail, and STILL TONIGHT,
// a small column beside tomorrow's date in the evening header. One quiet line for both (Jake, Oct 1: the brass card
// was loud "compared to the rest of the page"): a tick, the time, whose it is, what — no fills; late shows only in
// the rust time and words, due within half an hour in a brass "in 20 min". A tick crosses it out for a moment, and a
// second tap in that moment takes it back.

export interface NextUpRowsProps {
  items: NextUpItem[]
  members: WallMember[]
  pigmentOf: (memberId: string) => number | null
  /** Keys ticked a moment ago (crossed out until they leave). */
  ticked: ReadonlySet<string>
  onTick: (item: NextUpItem) => void
  /** Someone out: opens what they're at. */
  onOpen?: (id: string) => void
}

const TIME = { late: 'text-wall-rust', soon: 'text-wall-ink', later: 'text-wall-ink' } as const
const BOX = { late: 'border-wall-rust bg-wall-paper', soon: 'border-wall-ink-2 bg-wall-paper', later: 'border-wall-ink-2 bg-wall-paper' } as const
const TAG = { late: 'text-wall-rust', soon: 'text-wall-brass-ink', later: 'text-wall-ink-2' } as const

function Row({ item, members, pigmentOf, ticked, onTick, onOpen, small }: Omit<NextUpRowsProps, 'items' | 'ticked'> & { item: NextUpItem; ticked: boolean; small: boolean }) {
  const member = item.whoId ? members.find((m) => m.id === item.whoId) ?? null : null
  const out = item.kind === 'out'
  const state = ticked ? 'later' : item.state
  const body = (
    <>
      {out
        ? <MapPin aria-hidden="true" size={22} strokeWidth={1.6} className="w-[24px] shrink-0 text-wall-ink-2" />
        : (
          <span aria-hidden="true" className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px] border-solid ${ticked ? 'border-wall-ink bg-wall-ink text-wall-ground' : BOX[state]}`}>
            {ticked && <Check size={18} strokeWidth={3} />}
          </span>
        )}
      <span className={`min-w-[54px] shrink-0 whitespace-nowrap text-right ${small ? 'text-wall-body' : 'text-wall-heading'} font-semibold tabular-nums lining-nums ${out || ticked ? 'text-wall-ink-2' : TIME[state]}`}>
        {formatWallClock(item.at).time}
        {item.meridiem && <span className="ml-[4px] text-wall-label font-semibold">{item.meridiem}</span>}
      </span>
      {member
        ? <span aria-hidden="true" className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full font-display text-wall-label font-bold leading-none text-wall-on-pigment ${pigmentStyleFor(pigmentOf(member.id) ?? 0).solid}`}>{member.name.slice(0, 1)}</span>
        : <span aria-hidden="true" className="w-[28px] shrink-0" />}
      <span className={`min-w-0 flex-1 truncate text-left text-wall-body ${ticked ? 'text-wall-ink-2 line-through' : 'text-wall-ink'}`}>{item.title}</span>
      {item.tag && !ticked && <span className={`shrink-0 whitespace-nowrap text-wall-detail ${TAG[state]}`}>{item.tag}</span>}
    </>
  )
  const shape = `flex ${small ? 'h-[44px]' : 'h-[48px]'} min-w-0 items-center gap-[14px] border-0 bg-transparent p-0 font-body transition-opacity duration-300 ${ticked ? 'opacity-60' : ''}`
  if (out) {
    return onOpen
      ? <button type="button" aria-label={`${item.title}, ${item.tag}`} onClick={(e) => { e.stopPropagation(); onOpen(item.id) }} className={shape}>{body}</button>
      : <div className={shape}>{body}</div>
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ticked}
      aria-label={`${formatWallClock(item.at).time}${item.meridiem ? ` ${item.meridiem}` : ''}${member ? ` ${member.name}` : ''}: ${item.title}${item.tag ? `, ${item.tag}` : ''}`}
      onClick={(e) => { e.stopPropagation(); onTick(item) }}
      className={shape}
    >
      {body}
    </button>
  )
}

/** Two rows a column, read down then across. */
function Rows({ items, columns, ...rest }: NextUpRowsProps & { columns: number }) {
  return (
    <div className={`grid grid-flow-col ${items.length > 1 ? 'grid-rows-2' : 'grid-rows-1'} ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-x-[48px] gap-y-[2px]`}>
      {items.map((item) => <Row key={item.key} item={item} small={false} {...rest} ticked={rest.ticked.has(item.key)} />)}
    </div>
  )
}

/** NEXT UP in the full day's rail (canvas 27a): one or two columns of two. */
export function NextUpSection({ items, more, columns, onSeeAll, ...rest }: NextUpRowsProps & { more: number; columns: 1 | 2; onSeeAll?: () => void }) {
  const count = items.filter((i) => !rest.ticked.has(i.key)).length + more
  return (
    <section aria-label="Next up" className={`flex min-w-0 flex-col ${columns === 2 ? 'col-span-2' : ''}`}>
      <SectionHeading
        action={(more > 0 || onSeeAll) && (
          <span className="flex items-center gap-[10px] text-wall-detail text-wall-ink-2">
            {more > 0 && <span>+{more} later</span>}
            {onSeeAll && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onSeeAll() }} className="flex h-[44px] items-center gap-[4px] border-0 bg-transparent px-[4px] text-wall-detail text-wall-ink-2">
                To do <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      >
        NEXT UP · {count}
      </SectionHeading>
      <div className="border-0 border-t border-solid border-wall-rule pt-[8px]">
        {/* Two or fewer read as one column, at about one box's width. */}
        <div className={items.length > 2 ? '' : 'max-w-[560px]'}>
          <Rows items={items} columns={items.length > 2 ? columns : 1} {...rest} />
        </div>
      </div>
    </section>
  )
}

/** How many lines STILL TONIGHT has room for beside tomorrow's date. */
export const TONIGHT_ROOM = 3

/** STILL TONIGHT (canvas 28c): a small column beside tomorrow's date — what's left of today, and who's still out. */
export function StillTonight({ items, more, rail = false, ...rest }: NextUpRowsProps & { more: number; rail?: boolean }) {
  // In the left panel (canvas 56A): a late one turns the heading rust, and the lines sit in a soft box.
  const late = items.some((item) => item.state === 'late' && item.kind !== 'out')
  return (
    <section aria-label="Still tonight" className={rail ? 'flex shrink-0 flex-col gap-[10px]' : 'flex w-[440px] min-w-[320px] shrink flex-col justify-center'}>
      <div className="flex items-baseline justify-between gap-[16px]">
        <span className={`text-wall-label font-bold tracking-[0.22em] ${rail && late ? 'text-wall-rust' : 'text-wall-ink-2'}`}>STILL TONIGHT</span>
        {more > 0 && <span className="text-wall-detail text-wall-ink-2">+{more} later</span>}
      </div>
      <div className={rail ? 'flex flex-col rounded-[14px] bg-wall-paper px-[18px] py-[4px]' : 'flex flex-col'}>
        {items.map((item) => <Row key={item.key} item={item} small {...rest} ticked={rest.ticked.has(item.key)} />)}
      </div>
    </section>
  )
}
