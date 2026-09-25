import { useState } from 'react'
import { X } from 'lucide-react'
import type { DayPlan, Trip, WallMember } from './engine/types'
import { clockTime, placeName } from './header'
import { pigmentStyleFor } from './lanes'
import { driverChoices } from './people'

/** "Hand off" from the Next Move (board 02a): pick who takes this trip instead, with who's free. */
export default function WallHandOffSheet({ trip, plan, members, pigmentOf, onPick, onClose }: {
  trip: Trip
  plan: DayPlan
  members: WallMember[]
  pigmentOf: (id: string) => number | null
  onPick: (driverId: string) => Promise<void>
  onClose: () => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null
  const choices = driverChoices(plan, members, trip, trip.sourceId)

  return (
    <div className="absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="pointer-events-none absolute inset-0 bg-wall-ink/20" />
      <section
        aria-label="Hand off"
        className="absolute right-0 top-0 flex h-[1080px] w-[780px] flex-col gap-[24px] rounded-l-[28px] bg-wall-on-pigment px-[56px] py-[40px] font-body text-wall-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-[24px]">
          <div className="flex flex-col gap-[8px]">
            <div className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">
              HAND OFF{trip.leaveAt ? ` · LEAVE BY ${clockTime(trip.leaveAt)}` : ''}
            </div>
            <div className="font-display text-wall-move font-semibold leading-[1.02]">{trip.title}</div>
            <div className="text-wall-body text-wall-ink-2">
              {placeName(trip)} · {nameOf(trip.driverId) ? `now ${nameOf(trip.driverId)}` : 'nobody driving yet'}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border border-wall-rule bg-transparent p-0 text-wall-ink">
            <X size={22} />
          </button>
        </div>

        <div className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">WHO TAKES IT</div>
        <div className="grid grid-cols-2 gap-[12px]">
          {choices.map((choice) => {
            const current = choice.memberId === trip.driverId
            const pigment = pigmentOf(choice.memberId)
            return (
              <button
                key={choice.memberId}
                type="button"
                disabled={current || saving !== null}
                onClick={async () => {
                  setSaving(choice.memberId)
                  setError(null)
                  try {
                    await onPick(choice.memberId)
                    onClose()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'That didn’t save. Nothing changed.')
                    setSaving(null)
                  }
                }}
                className={`flex h-[88px] items-center gap-[14px] rounded-[16px] px-[18px] text-left ${current ? 'border border-dashed border-wall-rule bg-transparent text-wall-ink-2' : 'border border-solid border-wall-rule bg-transparent text-wall-ink'}`}
              >
                <span aria-hidden="true" className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full font-display text-wall-heading font-bold text-wall-on-pigment ${pigment != null ? pigmentStyleFor(pigment).solid : 'bg-wall-ink-2'}`}>
                  {choice.name.charAt(0)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-wall-body font-semibold">{saving === choice.memberId ? 'Saving…' : choice.name}</span>
                  <span className="truncate text-wall-label text-wall-ink-2">{current ? 'driving now' : choice.note}</span>
                </span>
              </button>
            )
          })}
        </div>
        {error && <div className="text-wall-body font-semibold text-wall-rust">{error}</div>}
      </section>
    </div>
  )
}
