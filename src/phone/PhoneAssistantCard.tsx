import { History } from 'lucide-react'
import type { WallMember } from '../wall/engine/types'
import type { WhichOne } from '../wall/assistant'
import { laneView, type AssistantCard } from '../wall/assistantCard'
import { pigmentStyleFor } from '../wall/lanes'

// The assistant's card inside Ask Casa (board 06e): the same card as the wall's band —
// where it lands in the person's day, when, leave by, where, who drives, what just
// changed — revised in place as the conversation goes. And "which one?" as tiles (06f).

const label = 'text-phone-label font-bold tracking-[0.12em] text-wall-ink-2'

export function PhoneCard({ card, members, pigmentOf, working, onYes, onNo, onPickDriver, onPickPlace }: {
  card: AssistantCard
  members: WallMember[]
  pigmentOf: (memberId: string) => number | null
  working: boolean
  onYes: () => void
  onNo: () => void
  onPickDriver?: (name: string) => void
  /** "Which one?" (Jake, Oct 2): the place picked here is saved with its address. */
  onPickPlace?: (place: { name: string; address: string }) => void
}) {
  const choices = onPickPlace ? card.placeChoices : []
  const people = card.peopleIds.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean)
  const title = people.length > 0 && !card.title.toLowerCase().includes(String(people[0]).toLowerCase()) ? `${card.title} · ${people.join(' & ')}` : card.title
  const view = laneView(card)
  const pigment = pigmentStyleFor((card.lane && pigmentOf(card.lane.memberId)) ?? 0)
  const drivers = card.drivers ? [...card.drivers].sort((a, b) => Number(b.chosen) - Number(a.chosen) || Number(b.note === 'free') - Number(a.note === 'free')).slice(0, 2) : null
  return (
    <div aria-label="Draft" className="flex flex-col gap-[10px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment p-[14px]">
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="min-w-0 font-display text-phone-heading font-bold">{title}</span>
        <span className={`${label} shrink-0 text-wall-brass-ink`}>{card.kind === 'add' ? 'DRAFT' : 'CHANGE'}</span>
      </div>
      {card.justChanged.length > 0 && (
        <span className="flex items-center gap-[6px] self-start rounded-full bg-wall-brass/15 px-[10px] py-[4px] text-phone-detail font-semibold text-wall-brass-ink">
          <History size={14} aria-hidden="true" />
          Just changed: {card.justChanged.join(' · ')}
        </span>
      )}
      {card.before && (
        <div className="flex flex-wrap items-baseline gap-x-[8px] text-phone-body">
          <span className="text-wall-ink-2 line-through">{card.before}</span>
          <span className="text-wall-brass-ink">→</span>
          <span className="font-bold">{card.when.split(' · ')[1]}</span>
        </div>
      )}
      {view && (
        <div className="relative h-[30px]">
          <div className="absolute left-0 top-[14px] h-px w-full bg-wall-rule" />
          {view.blocks.map((b, i) =>
            b.draft && b.kind !== 'drive' ? (
              <div key={i} className="absolute top-[2px] h-[26px] rounded-[6px] border-2 border-dashed border-wall-brass-ink bg-wall-brass/20" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
            ) : (
              <div key={i} className={`absolute top-[6px] h-[18px] rounded-[4px] ${b.kind === 'drive' ? pigment.hatch : b.kind === 'at_place' ? pigment.tint : pigment.strong}`} style={{ left: `${b.left}%`, width: `${b.width}%` }} />
            ),
          )}
          <div className="absolute top-[6px] whitespace-nowrap px-[6px] text-phone-label font-semibold" style={view.labelBefore ? { right: `${100 - view.labelLeft}%` } : { left: `${view.labelLeft}%` }}>
            {view.label.split(' ')[0]}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-[12px] gap-y-[8px] text-phone-detail">
        <div><div className={label}>WHEN</div>{card.when}</div>
        <div><div className={label}>LEAVE BY</div>{card.leaveBy ? `${card.leaveBy}${card.leavesFrom ? ' · from pickup' : ''}` : card.place ? 'Drive not known yet' : 'No drive'}</div>
        <div className="col-span-2">
          <div className={label}>WHERE</div>
          <div>{card.place ?? 'No place yet'}</div>
          {card.address && card.address !== card.place && <div className="text-wall-ink-2">{card.address}</div>}
          {!card.address && choices.length > 0 && onPickPlace && (
            <div role="group" aria-label="Which one?" className="mt-[6px] flex flex-col gap-[6px]">
              <div className="text-wall-ink-2">Not sure which one — tap it:</div>
              {choices.map((c) => (
                <button key={`${c.name}|${c.address}`} type="button" disabled={working} aria-label={`${c.name}, ${c.address}`} onClick={() => onPickPlace(c)}
                  className="flex min-h-[52px] flex-col items-start justify-center rounded-[12px] border border-solid border-wall-stone bg-transparent px-[12px] py-[8px] text-left text-wall-ink">
                  <span className="text-phone-detail font-semibold">{c.name}</span>
                  <span className="text-phone-detail text-wall-ink-2">{c.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {drivers && (
          <div className="col-span-2">
            <div className={label}>WHO DRIVES</div>
            <div className="mt-[4px] flex flex-wrap gap-[6px]">
              {drivers.map((d) => {
                const text = `${d.name} · ${d.note === 'free' ? 'free' : 'busy'}`
                const cls = `flex h-[44px] items-center rounded-full px-[12px] text-phone-detail font-semibold ${d.chosen ? 'border-0 bg-wall-pigment-2 text-wall-on-pigment' : 'border border-solid border-wall-rule bg-transparent text-wall-ink-2'}`
                return onPickDriver
                  ? <button key={d.memberId} type="button" aria-pressed={d.chosen} disabled={working} onClick={() => onPickDriver(d.name)} className={cls}>{text}</button>
                  : <span key={d.memberId} className={cls}>{text}</span>
              })}
            </div>
          </div>
        )}
      </div>
      {card.touches.some((t) => t.startsWith('Clashes')) && (
        <div className="text-phone-detail font-semibold text-wall-rust">{card.touches.filter((t) => t.startsWith('Clashes')).join(' · ')}</div>
      )}
      <div className="flex gap-[8px]">
        <button type="button" disabled={working} onClick={onYes} className="flex h-[48px] flex-1 items-center justify-center rounded-full border-0 bg-wall-ink px-[16px] text-phone-body font-bold text-wall-on-pigment">
          {working ? 'Saving…' : card.kind === 'add' ? 'Yes, add it' : card.before ? 'Yes, move it' : 'Yes, change it'}
        </button>
        <button type="button" disabled={working} onClick={onNo} className="flex h-[48px] items-center justify-center rounded-full border border-solid border-wall-ink-2 bg-transparent px-[16px] text-phone-body font-semibold text-wall-ink">
          {card.kind === 'add' ? 'Cancel' : 'No'}
        </button>
      </div>
    </div>
  )
}

export function PhoneWhich({ which, members, pigmentOf, onPick, onNeither }: {
  which: WhichOne
  members: WallMember[]
  pigmentOf: (memberId: string) => number | null
  onPick: (say: string) => void
  onNeither: () => void
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      {which.choices.map((c) => (
        <button key={c.id} type="button" onClick={() => onPick(c.say)} className="flex flex-col gap-[6px] rounded-[16px] border border-solid border-wall-stone bg-wall-on-pigment p-[14px] text-left text-wall-ink">
          <span className={label}>{c.when}</span>
          <span className="font-display text-phone-heading font-bold">{c.title}</span>
          {c.peopleIds.length > 0 && (
            <span className="flex gap-[6px]">
              {c.peopleIds.map((id) => (
                <span key={id} className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-phone-label font-bold text-wall-on-pigment ${pigmentStyleFor(pigmentOf(id) ?? 0).solid}`}>
                  {members.find((m) => m.id === id)?.name.charAt(0) ?? '?'}
                </span>
              ))}
            </span>
          )}
        </button>
      ))}
      {which.kept && <span className="self-start rounded-full bg-wall-brass/15 px-[12px] py-[6px] text-phone-detail font-semibold text-wall-brass-ink">Your change is kept: {which.kept}</span>}
      <button type="button" onClick={onNeither} className="flex h-[44px] items-center self-start rounded-full border border-solid border-wall-ink-2 bg-transparent px-[16px] text-phone-body font-semibold text-wall-ink">
        Neither — never mind
      </button>
    </div>
  )
}
