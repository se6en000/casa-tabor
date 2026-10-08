import { Check, House } from 'lucide-react'
import { formatWallClock } from './clock'
import type { WallMember } from './engine/types'
import type { NextMoveView } from './header'
import type { ThenItem } from './headerLead'
import { pigmentStyleFor } from './lanes'
import NextMovePanel, { type NextMoveActions } from './NextMovePanel'
import type { PackingGroup, WallChecklistItem } from './packing'
import type { TodoRow } from './todayPanel'
import { RailLabel, TakeWithYou } from './WallRail'
import WallThen from './WallThen'

// The left panel under the clock, the same on every face (canvas 79R/79S; Jake, Oct 8: "lets unify this experience"):
// NEXT — today's next car out (the ring in its last hour; further off, just the line); TAKE WITH YOU on the full day;
// THEN — what's coming, to know; TO DO — what to do, a tap on the row ticks it. On the paper it's one quiet line ("as
// calm as possible … when do i need to leave and with whom"). Looking at another day dims it: it stays today's.

export type TodayPanelMode = 'full' | 'calm' | 'quiet' | 'evening'

export interface TodayPanelProps {
  mode: TodayPanelMode
  members: WallMember[]
  pigmentOf: (memberId: string) => number | null
  next: NextMoveView | null
  moveActions?: NextMoveActions
  onDetails?: () => void
  take?: { groups: PackingGroup[]; onToggleItem?: (item: WallChecklistItem) => void; onSeeAll?: () => void } | null
  then: { shown: ThenItem[]; more: number }
  onOpenItem?: (id: string) => void
  todo: { heading: string; rows: TodoRow[] }
  ticked: ReadonlySet<string>
  onTick?: (row: TodoRow) => void
  /** Another day is on the stage. */
  dim?: boolean
}

export default function WallTodayPanel({ mode, members, pigmentOf, next, moveActions, onDetails, take = null, then, onOpenItem, todo, ticked, onTick, dim = false }: TodayPanelProps) {
  const pigment = next?.driverId ? pigmentOf(next.driverId) : null
  // Getting out the door comes first: with a list to take, THEN keeps two lines and TO DO only what's late.
  const taking = mode === 'full' && Boolean(take && take.groups.length > 0)
  const thenShown = taking ? then.shown.slice(0, 2) : then.shown
  const thenMore = then.more + (then.shown.length - thenShown.length)
  const rows = taking ? todo.rows.filter((r) => r.late) : todo.rows
  if (mode === 'quiet') {
    if (!next || next.status !== 'upcoming' || !next.leaveTime) return null
    return (
      <section aria-label="Next out" className="flex shrink-0 flex-col">
        <span className="text-wall-label font-bold tracking-[0.22em] text-wall-ink-2">LEAVE AT {next.leaveTime}</span>
        <div className="mt-[12px] flex min-w-0 items-center gap-[12px]">
          <Dot initial={next.initial} pigment={pigment} />
          <span className="line-clamp-2 font-display text-wall-date text-wall-ink-2">{next.what ?? next.title}</span>
        </div>
      </section>
    )
  }
  return (
    <div className={`flex min-h-0 flex-col transition-opacity duration-300 ${dim ? 'opacity-45' : ''}`}>
      {next && <NextMovePanel rail view={next} pigmentIndex={pigment} actions={moveActions} onDetails={onDetails} />}
      {mode === 'full' && take && take.groups.length > 0 && (
        <div className="mt-[26px]">
          <TakeWithYou groups={take.groups} onToggleItem={take.onToggleItem} onSeeAll={take.onSeeAll} room={thenShown.length > 0 ? 3 : 5} />
        </div>
      )}
      {thenShown.length > 0 && (
        <div className={next ? 'mt-[28px]' : ''}>
          <WallThen rail items={thenShown} more={thenMore} members={members} pigmentOf={pigmentOf} onOpen={onOpenItem} />
        </div>
      )}
      {rows.length > 0 && (
        <section aria-label="To do today" className={`flex shrink-0 flex-col ${next || thenShown.length ? 'mt-[26px]' : ''}`}>
          <RailLabel tone={rows.some((r) => r.late) ? 'rust' : 'brass'}>{todo.heading}</RailLabel>
          <div className="mt-[10px] flex flex-col rounded-[14px] bg-wall-paper">
            {rows.map((row, i) => {
              const done = ticked.has(row.key)
              const who = row.whoId ? members.find((m) => m.id === row.whoId) ?? null : null
              return (
                <button
                  key={row.key}
                  type="button"
                  aria-label={`${row.title}${done ? ', done' : ''}`}
                  aria-pressed={done}
                  onClick={(event) => {
                    event.stopPropagation()
                    onTick?.(row)
                  }}
                  className={`flex h-[64px] min-w-0 items-center gap-[14px] border-0 bg-transparent px-[16px] text-left text-wall-ink ${i ? 'border-t border-solid border-wall-rule' : ''}`}
                >
                  {row.at
                    ? <span className={`w-[64px] shrink-0 font-display text-wall-date lining-nums ${row.late ? 'text-wall-rust' : ''}`}>{formatWallClock(row.at).time}</span>
                    : <span className="w-[64px] shrink-0 text-wall-detail text-wall-ink-2">{row.minutes ? `${row.minutes} min` : ''}</span>}
                  {who
                    ? <Dot initial={who.name.charAt(0)} pigment={pigmentOf(who.id)} small />
                    : row.at && (
                      <span aria-hidden="true" className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-ink-2 text-wall-ink-2">
                        <House size={14} strokeWidth={2.2} />
                      </span>
                    )}
                  <span className={`min-w-0 flex-1 truncate font-display text-wall-heading ${done ? 'text-wall-ink-2 line-through' : ''}`}>
                    {row.title}
                    {row.late && !done && <span className="font-body text-wall-detail text-wall-rust"> &nbsp;late</span>}
                  </span>
                  <span aria-hidden="true" className={`flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[9px] border-2 border-solid ${done ? 'border-wall-brass bg-wall-brass text-wall-band' : row.late ? 'border-wall-rust' : 'border-wall-ink-2'}`}>
                    {done && <Check size={22} strokeWidth={3} />}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function Dot({ initial, pigment, small = false }: { initial: string; pigment: number | null; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-display text-wall-label font-bold ${small ? 'h-[28px] w-[28px]' : 'h-[32px] w-[32px]'} ${pigment == null ? 'border-2 border-dashed border-wall-ink-2 text-wall-ink-2' : `text-wall-on-pigment ${pigmentStyleFor(pigment).solid}`}`}
    >
      {initial}
    </span>
  )
}
