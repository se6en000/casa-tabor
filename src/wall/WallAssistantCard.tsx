import { History } from 'lucide-react'
import type { WallMember } from './engine/types'
import type { AssistantCard } from './assistantCard'
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
/** "Softball" from "Softball: Huskies @ RPB Cascade". */
const shortName = (title: string) => {
  const head = title.split(/[:·(—]/)[0].trim()
  return head.split(' ').length <= 3 ? head : head.split(' ').slice(0, 3).join(' ')
}
const clockLabel = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`
const hour = (h: number) => (h === 12 ? '12 PM' : h === 0 ? '12 AM' : h > 12 ? `${h - 12}` : `${h}`)

function LanePreview({ card, members, pigmentOf }: Pick<WallAssistantCardProps, 'card' | 'members' | 'pigmentOf'>) {
  const lane = card.lane
  if (!lane || card.allDay) return null
  const person = members.find((m) => m.id === lane.memberId)
  const pigment = pigmentStyleFor(pigmentOf(lane.memberId) ?? 0)
  const segments = lane.segments.filter((s) => s.end > s.start)
  // The window: 8 AM – 6 PM, widened to take in everything on the lane.
  const hours = [...segments.flatMap((s) => [s.start, s.end]), card.start, card.end].map((d) => d.getHours() + d.getMinutes() / 60)
  const from = Math.max(0, Math.min(8, Math.floor(Math.min(...hours))))
  // Room after the draft for its name.
  const to = Math.min(24, Math.max(18, Math.ceil(Math.max(...hours)), Math.ceil(card.end.getHours() + card.end.getMinutes() / 60) + 3))
  const x = (d: Date) => `${(((d.getHours() + d.getMinutes() / 60) - from) / (to - from)) * 100}%`
  const w = (a: Date, b: Date) => `${((b.getTime() - a.getTime()) / 3_600_000 / (to - from)) * 100}%`
  const labelAt = new Date(Math.max(card.end.getTime(), ...segments.filter((s) => s.sourceId === card.eventId).map((s) => s.end.getTime())))
  const ticks = Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) => from + i * 2)
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="relative ml-[64px] h-[20px] text-wall-label text-wall-ink-2">
        {ticks.map((h) => (
          <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h - from) / (to - from)) * 100}%` }}>{hour(h)}</span>
        ))}
      </div>
      <div className="flex items-center gap-[16px]">
        <span className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full font-display text-wall-body font-bold text-wall-on-pigment ${pigment.solid}`}>{person?.name.charAt(0) ?? '?'}</span>
        <div className="relative h-[52px] flex-1">
          <div className="absolute left-0 top-[25px] h-px w-full bg-wall-rule" />
          {segments.filter((s) => s.sourceId !== card.eventId).map((s, i) => (
            <div
              key={`${s.sourceId}-${s.kind}-${i}`}
              className={`absolute top-[12px] flex h-[28px] items-center overflow-hidden whitespace-nowrap rounded-[6px] pl-[10px] text-wall-label ${s.kind === 'drive' ? pigment.hatch : s.kind === 'at_place' ? pigment.tint : pigment.strong}`}
              style={{ left: x(s.start), width: w(s.start, s.end) }}
            >
              {s.kind !== 'drive' ? s.label : ''}
            </div>
          ))}
          {segments.filter((s) => s.sourceId === card.eventId && s.kind === 'drive').map((s, i) => (
            <div key={`draft-drive-${i}`} className={`absolute top-[12px] h-[28px] rounded-[6px] ${pigment.hatch}`} style={{ left: x(s.start), width: w(s.start, s.end) }} />
          ))}
          <div className="absolute top-[6px] h-[40px] rounded-[8px] border-2 border-dashed border-wall-brass-ink bg-wall-brass/20" style={{ left: x(card.start), width: w(card.start, card.end) }} />
          {/* The draft's name beside it (after the drive home), or before it near the end of the day. */}
          <div
            className="absolute top-[12px] whitespace-nowrap px-[10px] text-wall-label font-semibold"
            style={labelAt.getHours() + labelAt.getMinutes() / 60 <= to - 2.5 ? { left: x(labelAt) } : { right: `calc(100% - ${x(card.start)})` }}
          >
            {clockLabel(card.start)} {shortName(card.title)}
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

      <div className="mt-auto flex items-center gap-[14px]">
        <button type="button" disabled={working} onClick={onYes} className="h-[60px] rounded-full border-0 bg-wall-ink px-[32px] text-wall-detail font-bold text-wall-on-pigment">
          {working ? 'Saving…' : card.kind === 'add' ? 'Yes, add it' : card.before ? 'Yes, move it' : 'Yes, change it'}
        </button>
        <button type="button" disabled={working} onClick={onChange} className="h-[60px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[28px] text-wall-detail font-semibold text-wall-ink">
          Change something
        </button>
        <button type="button" disabled={working} onClick={onNo} className="h-[60px] rounded-full border border-solid border-wall-rule bg-transparent px-[28px] text-wall-detail font-semibold text-wall-ink">
          {card.kind === 'add' ? 'Cancel' : 'No'}
        </button>
      </div>
    </div>
  )
}
