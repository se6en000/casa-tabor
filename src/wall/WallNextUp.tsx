import { Check, ChevronRight, MapPin } from 'lucide-react'
import { formatWallClock } from './clock'
import type { WallMember } from './engine/types'
import { pigmentStyleFor } from './lanes'
import { SectionHeading } from './WallPrep'
import type { NextUpItem } from './nextUp'

// The day's small timed jobs (canvas 27a, 27c): NEXT UP, the first slot of the full day's rail, and STILL TONIGHT,
// the evening header's card while the wall looks at tomorrow. One row for both: a tick, the time, whose it is, what.
// Late is rust, due within half an hour is brass, later is plain; a tick crosses it out for a moment, and a second
// tap in that moment takes it back.

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

const WASH = { late: 'bg-wall-rust/14', soon: 'bg-wall-brass/14', later: '' } as const
const TIME = { late: 'text-wall-rust', soon: 'text-wall-brass-ink', later: 'text-wall-ink' } as const
const BOX = { late: 'border-wall-rust', soon: 'border-wall-brass', later: 'border-wall-ink-2' } as const
const TAG = { late: 'text-wall-rust', soon: 'text-wall-brass-ink', later: 'text-wall-ink-2' } as const

function Row({ item, members, pigmentOf, ticked, onTick, onOpen, tall }: Omit<NextUpRowsProps, 'items' | 'ticked'> & { item: NextUpItem; ticked: boolean; tall: boolean }) {
  const member = item.whoId ? members.find((m) => m.id === item.whoId) ?? null : null
  const out = item.kind === 'out'
  const state = ticked ? 'later' : item.state
  const body = (
    <>
      {out
        ? <MapPin aria-hidden="true" size={26} strokeWidth={1.8} className="shrink-0 text-wall-ink-2" />
        : (
          <span aria-hidden="true" className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] border-2 border-solid ${ticked ? 'border-wall-ink bg-wall-ink text-wall-ground' : BOX[state]}`}>
            {ticked && <Check size={20} strokeWidth={3} />}
          </span>
        )}
      <span className={`w-[58px] shrink-0 text-right text-wall-heading font-bold tabular-nums lining-nums ${out || ticked ? 'text-wall-ink-2' : TIME[state]}`}>{formatWallClock(item.at).time}</span>
      {member
        ? <span aria-hidden="true" className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full font-display text-wall-label font-bold leading-none ${pigmentStyleFor(pigmentOf(member.id) ?? 0).solid}`}>{member.name.slice(0, 1)}</span>
        : <span aria-hidden="true" className="w-[30px] shrink-0" />}
      <span className={`min-w-0 flex-1 truncate text-left ${tall ? 'text-wall-heading' : 'text-wall-body'} ${ticked ? 'text-wall-ink-2 line-through' : 'text-wall-ink'}`}>{item.title}</span>
      {item.tag && !ticked && <span className={`shrink-0 whitespace-nowrap text-wall-detail font-bold ${out ? 'font-normal' : ''} ${TAG[state]}`}>{item.tag}</span>}
    </>
  )
  const shape = `flex ${tall ? 'h-[54px]' : 'h-[48px]'} min-w-0 items-center gap-[14px] rounded-[14px] border-0 pl-[14px] pr-[18px] font-body transition-opacity duration-300 ${ticked ? 'bg-transparent opacity-60' : WASH[state] || 'bg-transparent'}`
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
      aria-label={`${formatWallClock(item.at).time}${member ? ` ${member.name}` : ''}: ${item.title}${item.tag ? `, ${item.tag}` : ''}`}
      onClick={(e) => { e.stopPropagation(); onTick(item) }}
      className={shape}
    >
      {body}
    </button>
  )
}

/** Two rows a column, read down then across. */
function Rows({ items, columns, tall, ...rest }: NextUpRowsProps & { columns: number; tall: boolean }) {
  return (
    <div className={`grid grid-flow-col ${items.length > 1 ? 'grid-rows-2' : 'grid-rows-1'} ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'} ${tall ? 'gap-x-[12px] gap-y-[6px]' : 'gap-x-[28px] gap-y-[4px]'}`}>
      {items.map((item) => <Row key={item.key} item={item} tall={tall} {...rest} ticked={rest.ticked.has(item.key)} />)}
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
        <div className={`-mx-[14px] ${items.length > 2 ? '' : 'max-w-[600px]'}`}>
          <Rows items={items} columns={items.length > 2 ? columns : 1} tall={false} {...rest} />
        </div>
      </div>
    </section>
  )
}

/** STILL TONIGHT (canvas 27c): the evening header's card, what's left of today while the wall looks at tomorrow. */
export function StillTonight({ items, more, day, ...rest }: NextUpRowsProps & { more: number; day: string }) {
  const toDo = items.filter((i) => i.kind !== 'out' && !rest.ticked.has(i.key)).length + more
  const out = items.filter((i) => i.kind === 'out').length
  const summary = [toDo ? `${toDo} to do` : null, out ? `${out} out` : null, more ? `+${more} later` : null].filter(Boolean).join(' · ')
  return (
    <section aria-label="Still tonight" className="flex min-w-0 flex-1 flex-col justify-center gap-[8px] rounded-[24px] border border-solid border-wall-brass/50 bg-wall-brass/10 px-[18px] py-[14px]">
      <div className="flex items-baseline justify-between gap-[16px] px-[14px]">
        <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">STILL TONIGHT · {day.toUpperCase()}</span>
        <span className="truncate text-wall-detail text-wall-ink-2">{summary}</span>
      </div>
      <Rows items={items} columns={items.length > 2 ? 2 : 1} tall {...rest} />
    </section>
  )
}
