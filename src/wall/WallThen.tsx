import { Car, House } from 'lucide-react'
import { formatWallClock } from './clock'
import type { WallMember } from './engine/types'
import type { ThenItem } from './headerLead'
import { pigmentStyleFor } from './lanes'

// THEN (canvas 29e/29f): the next three after what leads the header, runs and things at home together, in time order —
// "an easier way to see the overall race to end the day". A routine run the sitter covers says "routine"; one that comes
// before the lead (passed over for it) has its time in brass.

export default function WallThen({ items, more = 0, members, pigmentOf, onOpen, rail = false }: {
  items: ThenItem[]
  /** Past the room: "+N later" beside the heading (canvas 79R). */
  more?: number
  members: WallMember[]
  pigmentOf: (memberId: string) => number | null
  onOpen?: (sourceId: string) => void
  /** In the left panel (canvas 56A): full width, the times in the serif like the clock above them. */
  rail?: boolean
}) {
  if (items.length === 0) return null
  return (
    <>
      {!rail && <div className="my-[6px] w-px shrink-0 bg-wall-rule" />}
      <section aria-label="Then" className={`flex shrink-0 flex-col ${rail ? '' : 'w-[470px] justify-center gap-[2px]'}`}>
        <div className={`flex items-baseline justify-between text-wall-label text-wall-ink-2 ${rail ? 'pb-[6px]' : 'pb-[4px]'}`}>
          <span className="font-bold tracking-[0.25em]">THEN</span>
          {more > 0 && <span>+{more} later</span>}
        </div>
        {items.map((item) => {
          const member = item.whoId ? members.find((m) => m.id === item.whoId) ?? null : null
          const Icon = item.kind === 'move' ? Car : House
          return (
            <button
              key={item.key}
              type="button"
              onClick={(e) => { e.stopPropagation(); if (item.sourceId) onOpen?.(item.sourceId) }}
              className={`flex min-w-0 items-center gap-[12px] border-0 bg-transparent p-0 text-left font-body text-wall-ink ${rail ? 'h-[46px] border-b border-solid border-wall-rule' : 'h-[44px]'}`}
            >
              {!rail && <Icon aria-hidden="true" size={22} strokeWidth={1.8} className="shrink-0 text-wall-ink-2" />}
              <span className={`shrink-0 text-right font-semibold tabular-nums lining-nums ${rail ? 'w-[64px] font-display text-wall-date' : 'w-[54px] text-wall-body'} ${item.before ? 'text-wall-brass-ink' : 'text-wall-ink'}`}>{formatWallClock(item.at).time}</span>
              {member
                ? <span aria-hidden="true" className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full font-display text-wall-label font-bold leading-none text-wall-on-pigment ${pigmentStyleFor(pigmentOf(member.id) ?? 0).solid}`}>{member.name.charAt(0)}</span>
                : <span aria-hidden="true" className="h-[28px] w-[28px] shrink-0 rounded-full border-2 border-dashed border-wall-ink-2" />}
              <span className="min-w-0 truncate text-wall-body">{item.title}</span>
              {item.routine && !rail && <span className={`shrink-0 text-wall-detail ${item.before ? 'font-semibold text-wall-brass-ink' : 'text-wall-ink-2'}`}>routine</span>}
            </button>
          )
        })}
      </section>
    </>
  )
}
