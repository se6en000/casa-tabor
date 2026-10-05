import { Car, House } from 'lucide-react'
import { formatWallClock } from './clock'
import type { WallMember } from './engine/types'
import type { ThenItem } from './headerLead'
import { pigmentStyleFor } from './lanes'

// THEN (canvas 29e/29f): the next three after what leads the header, runs and things at home together, in time order —
// "an easier way to see the overall race to end the day". A routine run the sitter covers says "routine"; one that comes
// before the lead (passed over for it) has its time in brass.

export default function WallThen({ items, members, pigmentOf, onOpen }: {
  items: ThenItem[]
  members: WallMember[]
  pigmentOf: (memberId: string) => number | null
  onOpen?: (sourceId: string) => void
}) {
  if (items.length === 0) return null
  return (
    <>
      <div className="my-[6px] w-px shrink-0 bg-wall-rule" />
      <section aria-label="Then" className="flex w-[470px] shrink-0 flex-col justify-center gap-[2px]">
        <div className="pb-[4px] text-wall-label font-bold tracking-[0.25em] text-wall-ink-2">THEN</div>
        {items.map((item) => {
          const member = item.whoId ? members.find((m) => m.id === item.whoId) ?? null : null
          const Icon = item.kind === 'move' ? Car : House
          return (
            <button
              key={item.key}
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpen?.(item.sourceId) }}
              className="flex h-[44px] min-w-0 items-center gap-[12px] border-0 bg-transparent p-0 text-left font-body text-wall-ink"
            >
              <Icon aria-hidden="true" size={22} strokeWidth={1.8} className="shrink-0 text-wall-ink-2" />
              <span className={`w-[54px] shrink-0 text-right text-wall-body font-semibold tabular-nums lining-nums ${item.before ? 'text-wall-brass-ink' : 'text-wall-ink'}`}>{formatWallClock(item.at).time}</span>
              {member
                ? <span aria-hidden="true" className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full font-display text-wall-label font-bold leading-none text-wall-on-pigment ${pigmentStyleFor(pigmentOf(member.id) ?? 0).solid}`}>{member.name.charAt(0)}</span>
                : <span aria-hidden="true" className="h-[28px] w-[28px] shrink-0 rounded-full border-2 border-dashed border-wall-ink-2" />}
              <span className="min-w-0 truncate text-wall-body">{item.title}</span>
              {item.routine && <span className={`shrink-0 text-wall-detail ${item.before ? 'font-semibold text-wall-brass-ink' : 'text-wall-ink-2'}`}>routine</span>}
            </button>
          )
        })}
      </section>
    </>
  )
}
