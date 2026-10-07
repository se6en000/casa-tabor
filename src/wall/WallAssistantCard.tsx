import { History } from 'lucide-react'
import type { WallMember } from './engine/types'
import { laneView, type AssistantCard } from './assistantCard'
import { pigmentStyleFor } from './lanes'

// The assistant's card on the wall (boards 06a/06b): exactly what will be saved, told from
// the wall's own engine — where it lands in the person's day, when to leave, who can drive,
// what it touches — revised in place as the conversation goes, with what just changed marked.

export interface WallAssistantCardProps {
  card: AssistantCard
  members: WallMember[]
  pigmentOf: (memberId: string) => number | null
  working: boolean
  onYes: () => void
  onChange: () => void
  onNo: () => void
  /** A change can take a driver right on the card; an add can't be saved with one yet. */
  onPickDriver?: (name: string) => void
}

const label = 'text-wall-label font-bold tracking-[0.18em] text-wall-ink-2'
const hour = (h: number) => (h === 12 ? '12 PM' : h === 0 ? '12 AM' : h > 12 ? `${h - 12}` : `${h}`)

function LanePreview({ card, members, pigmentOf }: Pick<WallAssistantCardProps, 'card' | 'members' | 'pigmentOf'>) {
  const view = laneView(card)
  if (!view || !card.lane) return null
  const person = members.find((m) => m.id === card.lane?.memberId)
  const pigment = pigmentStyleFor(pigmentOf(card.lane.memberId) ?? 0)
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="relative ml-[64px] h-[20px] text-wall-label text-wall-ink-2">
        {view.ticks.map((h) => (
          <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h - view.from) / (view.to - view.from)) * 100}%` }}>{hour(h)}</span>
        ))}
      </div>
      <div className="flex items-center gap-[16px]">
        <span className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full font-display text-wall-body font-bold text-wall-on-pigment ${pigment.solid}`}>{person?.name.charAt(0) ?? '?'}</span>
        <div className="relative h-[52px] flex-1">
          <div className="absolute left-0 top-[25px] h-px w-full bg-wall-rule" />
          {view.blocks.map((b, i) =>
            b.draft && b.kind !== 'drive' ? (
              <div key={i} className="absolute top-[6px] h-[40px] rounded-[8px] border-2 border-dashed border-wall-brass-ink bg-wall-brass/20" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
            ) : (
              <div
                key={i}
                className={`absolute top-[12px] flex h-[28px] items-center overflow-hidden whitespace-nowrap rounded-[6px] pl-[10px] text-wall-label ${b.kind === 'drive' ? pigment.hatch : b.kind === 'at_place' ? pigment.tint : pigment.strong}`}
                style={{ left: `${b.left}%`, width: `${b.width}%` }}
              >
                {b.label}
              </div>
            ),
          )}
          {/* The draft's name beside it (after the drive home), or before it near the end of the day. */}
          <div
            className="absolute top-[12px] whitespace-nowrap px-[10px] text-wall-label font-semibold"
            style={view.labelBefore ? { right: `${100 - view.labelLeft}%` } : { left: `${view.labelLeft}%` }}
          >
            {view.label}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WallAssistantCard({ card, members, pigmentOf, working, onYes, onChange, onNo, onPickDriver }: WallAssistantCardProps) {
  const people = card.peopleIds.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean)
  const title = people.length > 0 && !card.title.toLowerCase().includes(String(people[0]).toLowerCase()) ? `${card.title} · ${people.join(' & ')}` : card.title
  const [day, time] = card.when.split(' · ')
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[20px] rounded-[24px] bg-wall-on-pigment px-[32px] py-[28px] text-wall-ink">
      <div className="flex items-baseline justify-between gap-[24px]">
        <div className="min-w-0 truncate font-display text-wall-quote font-semibold">{title}</div>
        <div className="shrink-0 text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{card.kind === 'add' ? 'DRAFT' : 'CHANGE'} · NOT SAVED YET</div>
      </div>
      {card.justChanged.length > 0 && (
        <div className="flex items-center gap-[10px] self-start rounded-full bg-wall-brass/15 px-[16px] py-[8px] text-wall-detail font-semibold text-wall-brass-ink">
          <History size={18} />
          Just changed: {card.justChanged.join(' · ')}
        </div>
      )}
      {card.before && (
        <div className="flex items-center gap-[22px]">
          <div className="text-wall-date text-wall-ink-2 line-through decoration-2">{card.before}</div>
          <span className="text-wall-date text-wall-brass-ink">→</span>
          <div className="text-wall-date font-bold">{time}</div>
          <div className="text-wall-detail text-wall-ink-2">{day}</div>
        </div>
      )}

      <LanePreview card={card} members={members} pigmentOf={pigmentOf} />

      <div className="grid grid-cols-[1.1fr_1.3fr_1fr_1.3fr] gap-[22px]">
        <div>
          <div className={label}>WHEN</div>
          <div className="mt-[6px] text-wall-body font-semibold">{day}</div>
          <div className="text-wall-detail">{time}</div>
        </div>
        <div className="min-w-0">
          <div className={label}>WHERE</div>
          <div className="mt-[6px] line-clamp-2 text-wall-body font-semibold">{card.place ?? 'No place yet'}</div>
        </div>
        <div>
          <div className={label}>LEAVE BY</div>
          <div className="mt-[6px] text-wall-body font-semibold">
            {card.leaveBy ? `${card.leaveBy}${card.leavesFrom ? ` · from ${card.leavesFrom.split(' ').slice(0, 2).join(' ')}` : ''}` : card.place ? 'Drive not known yet' : 'No drive'}
          </div>
        </div>
        <div className="min-w-0">
          <div className={label}>WHO DRIVES</div>
          {card.drivers ? (
            <div className="mt-[8px] flex flex-wrap gap-[8px]">
              {[...card.drivers].sort((a, b) => Number(b.chosen) - Number(a.chosen) || Number(b.note === 'free') - Number(a.note === 'free')).slice(0, 2).map((d) => {
                const content = `${d.name} · ${d.note.replace(/ · .*$/, '').replace('busy until', 'busy till')}`
                const on = d.chosen
                const cls = `h-[44px] whitespace-nowrap rounded-full px-[16px] text-wall-detail font-semibold ${on ? 'border-2 border-solid border-wall-pigment-2 bg-wall-pigment-2 text-wall-on-pigment' : 'border border-solid border-wall-rule bg-transparent text-wall-ink-2'}`
                return onPickDriver ? (
                  <button key={d.memberId} type="button" aria-pressed={on} disabled={working} onClick={() => onPickDriver(d.name)} className={cls}>{content}</button>
                ) : (
                  <span key={d.memberId} className={`inline-flex items-center ${cls}`}>{content}</span>
                )
              })}
            </div>
          ) : (
            <div className="mt-[6px] text-wall-detail text-wall-ink-2">—</div>
          )}
        </div>
      </div>

      {card.touches.length > 0 && (
        <div className="flex flex-col gap-[8px] text-wall-detail">
          {card.touches.slice(0, 2).map((t) => (
            <div key={t} className="flex items-center gap-[12px]">
              <span className={`h-[10px] w-[10px] shrink-0 rounded-full ${t.startsWith('Clashes') ? 'bg-wall-rust' : 'bg-wall-pigment-6'}`} />
              {t}
            </div>
          ))}
        </div>
      )}

      {card.notes.length > 0 && (
        <div className="min-w-0">
          <div className={label}>{card.notesAdded ? 'ADDS TO ITS NOTES' : 'NOTES'}</div>
          <div className="mt-[6px] line-clamp-2 text-wall-detail">{card.notesAdded ? card.notes.map((n) => `+ ${n}`).join('  ') : card.notes.join(' · ')}</div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-[14px]">
        <button type="button" disabled={working} onClick={onYes} className="h-[60px] rounded-full border-0 bg-wall-ink px-[32px] text-wall-detail font-bold text-wall-on-pigment">
          {working ? 'Saving…' : card.kind === 'add' ? 'Yes, add it' : card.before ? 'Yes, move it' : 'Yes, change it'}
        </button>
        <button type="button" disabled={working} onClick={onChange} className="h-[60px] rounded-full border border-solid border-wall-ink-2 bg-wall-paper px-[28px] text-wall-detail font-semibold text-wall-ink">
          Change something
        </button>
        <button type="button" disabled={working} onClick={onNo} className="h-[60px] rounded-full border border-solid border-wall-rule bg-wall-paper px-[28px] text-wall-detail font-semibold text-wall-ink">
          {card.kind === 'add' ? 'Cancel' : 'No'}
        </button>
      </div>
    </div>
  )
}
