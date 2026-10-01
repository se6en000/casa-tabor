import type { ReactNode } from 'react'
import { Car, Minus, Plane, Plus, X } from 'lucide-react'
import { formatWallClock } from './clock'
import type { WallMember } from './engine/types'
import type { TravelSettings, TravelTrip, TravelWay } from './engine/travel'
import { pigmentStyleFor } from './lanes'

// The trip sheet (canvas 19d): one sheet for the whole trip — who's going, then Going and Coming home side by side.
// Jake, 2026-10-01: "personally id like to configure the whole trip in one sheet if possible." The way home follows the
// way there unless it's changed; every change moves the lanes and the Next Move at once.

const clock = (d: Date) => formatWallClock(d).time
const weekdayDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
const words = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60} hr` : minutes > 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60}` : `${minutes} min`)

const OUT_WAYS: Array<[TravelWay, string]> = [['uber', 'Uber'], ['someone', 'Someone drives'], ['drive_park', 'Drive & park']]
const HOME_WAYS: Array<[TravelWay, string]> = [['uber', 'Uber'], ['someone', 'Someone picks up'], ['drive_park', 'The car']]

function Choice({ label, on, onPick }: { label: string; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => { e.stopPropagation(); onPick() }}
      className={`h-[52px] rounded-full px-[22px] text-wall-detail font-semibold ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-ink'}`}
    >
      {label}
    </button>
  )
}

function Stepper({ value, label, onLess, onMore }: { value: string; label: string; onLess: () => void; onMore: () => void }) {
  const round = 'flex h-[52px] w-[52px] items-center justify-center rounded-full border border-solid border-wall-ink-2 bg-transparent p-0 text-wall-ink'
  return (
    <div className="flex items-center gap-[18px]">
      <button type="button" aria-label={`Less ${label}`} className={round} onClick={(e) => { e.stopPropagation(); onLess() }}><Minus size={22} /></button>
      <span className="min-w-[120px] text-center font-display text-wall-heading font-semibold">{value}</span>
      <button type="button" aria-label={`More ${label}`} className={round} onClick={(e) => { e.stopPropagation(); onMore() }}><Plus size={22} /></button>
    </div>
  )
}

function Field({ label, children, note }: { label: string; children: ReactNode; note?: string | null }) {
  return (
    <div className="flex flex-col gap-[12px] border-0 border-t border-solid border-wall-rule py-[18px]">
      <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">{label}</span>
      {children}
      {note && <span className="text-wall-detail text-wall-ink-2">{note}</span>}
    </div>
  )
}

export interface WallTripSheetProps {
  trip: TravelTrip
  members: WallMember[]
  pigmentOf: (memberId: string) => number
  onChange: (change: TravelSettings) => void
  onClose: () => void
}

export default function WallTripSheet({ trip, members, pigmentOf, onChange, onClose }: WallTripSheetProps) {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone'
  const who = trip.memberIds.map(nameOf).join(' & ')
  // Who could drive them: anyone who drives and isn't on the trip.
  const drivers = members.filter((m) => m.can_drive && !trip.memberIds.includes(m.id))
  const first = trip.leaveHomeAt ?? trip.inbound?.departAt ?? null
  const last = trip.homeAt ?? trip.outbound?.landAt ?? null
  const days = first && last ? Math.round((new Date(last).setHours(0, 0, 0, 0) - new Date(first).setHours(0, 0, 0, 0)) / 86_400_000) + 1 : 1
  const eyebrow = ['TRIP ·', first ? weekdayDate(first) : null, last && days > 1 ? `– ${weekdayDate(last)}` : null, days > 1 ? `· ${days} DAYS` : null].filter(Boolean).join(' ')
  const pickDriver = (key: 'driverOutId' | 'driverHomeId', current: string | null) => (
    <div className="flex flex-wrap gap-[10px]">
      {drivers.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={current === m.id}
          onClick={(e) => { e.stopPropagation(); onChange({ [key]: m.id }) }}
          className={`flex h-[52px] items-center gap-[10px] rounded-full pl-[6px] pr-[18px] text-wall-detail font-semibold ${current === m.id ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-ink'}`}
        >
          <span aria-hidden="true" className={`flex h-[40px] w-[40px] items-center justify-center rounded-full font-display text-wall-detail font-bold text-wall-on-pigment ${pigmentStyleFor(pigmentOf(m.id)).solid}`}>{m.name.charAt(0)}</span>
          {m.name}
        </button>
      ))}
    </div>
  )

  return (
    <div className="absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="pointer-events-none absolute inset-0 bg-wall-ink/20" />
      <section
        aria-label={`${who} in ${trip.city}`}
        className="absolute right-0 top-0 flex h-[1080px] w-[1100px] flex-col rounded-l-[28px] bg-wall-on-pigment px-[56px] py-[40px] font-body text-wall-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-[8px]">
            <span className="flex items-center gap-[10px] text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{trip.mode === 'fly' ? <Plane size={18} aria-hidden="true" /> : <Car size={18} aria-hidden="true" />}{eyebrow}</span>
            <span className="font-display text-wall-move font-semibold">{who} in {trip.city}</span>
            {trip.hotel && <span className="text-wall-detail text-wall-ink-2">Staying at {trip.hotel}</span>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-rule bg-transparent p-0 text-wall-ink">
            <X size={22} />
          </button>
        </div>

        {trip.mode === 'drive' ? (
          // A trip by car: when the drive out starts and the drive home ends is all there is to set.
          <div className="mt-[24px] grid min-h-0 flex-1 grid-cols-2 content-start gap-x-[48px]">
            {([['GOING', trip.outbound, trip.outbound ? `Leave home ${clock(trip.outbound.departAt)}` : null, trip.outbound ? `In ${trip.city} by ${clock(trip.outbound.landAt)}` : 'No drive out in the calendar.'],
              ['COMING HOME', trip.inbound, trip.inbound ? `Leave ${trip.city} ${clock(trip.inbound.departAt)}` : null, trip.inbound ? `Home about ${clock(trip.inbound.landAt)}` : 'No drive home in the calendar yet.']] as const).map(([label, leg, line, result]) => (
              <div key={label} className="flex min-w-0 flex-col gap-[12px]">
                <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{label}{leg ? ` · ${weekdayDate(leg.departAt)}` : ''}</span>
                {line && <span className="text-wall-body">{line}</span>}
                <div className="border-0 border-t border-solid border-wall-rule pt-[18px] font-display text-wall-date font-semibold">{result}</div>
              </div>
            ))}
          </div>
        ) : (
        <div className="mt-[24px] grid min-h-0 flex-1 grid-cols-2 content-start gap-x-[48px]">
          <div className="flex min-w-0 flex-col">
            <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">GOING{trip.outbound ? ` · ${weekdayDate(trip.outbound.departAt)}` : ''}</span>
            {trip.outbound ? (
              <>
                <span className="mb-[14px] mt-[8px] flex items-center gap-[10px] font-display text-wall-heading font-semibold"><Plane size={20} aria-hidden="true" />{trip.outbound.number ? `${trip.outbound.number} · ` : ''}{trip.outbound.from} → {trip.outbound.to} · {clock(trip.outbound.departAt)}</span>
                <Field label="GETTING THERE">
                  <div className="flex flex-wrap gap-[10px]">{OUT_WAYS.map(([way, label]) => <Choice key={way} label={label} on={trip.wayOut === way} onPick={() => onChange({ wayOut: way })} />)}</div>
                  {trip.wayOut === 'someone' && pickDriver('driverOutId', trip.driverOutId)}
                </Field>
                <Field label="AT THE AIRPORT BEFORE">
                  <Stepper value={words(trip.airportMinutes)} label="time at the airport" onLess={() => onChange({ airportMinutes: Math.max(30, trip.airportMinutes - 15) })} onMore={() => onChange({ airportMinutes: Math.min(240, trip.airportMinutes + 15) })} />
                </Field>
                {trip.leaveHomeAt && <div className="border-0 border-t border-solid border-wall-rule pt-[18px] font-display text-wall-date font-semibold">Leave home {clock(trip.leaveHomeAt)}</div>}
              </>
            ) : <span className="mt-[8px] text-wall-body text-wall-ink-2">No flight out in the calendar.</span>}
          </div>

          <div className="flex min-w-0 flex-col">
            <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">COMING HOME{trip.inbound ? ` · ${weekdayDate(trip.inbound.departAt)}` : ''}</span>
            {trip.inbound ? (
              <>
                <span className="mb-[14px] mt-[8px] flex items-center gap-[10px] font-display text-wall-heading font-semibold"><Plane size={20} aria-hidden="true" />{trip.inbound.number ? `${trip.inbound.number} · ` : ''}{trip.inbound.from} → {trip.inbound.to} · lands {clock(trip.inbound.landAt)}</span>
                <Field label="GETTING HOME" note={trip.carWarning}>
                  <div className="flex flex-wrap gap-[10px]">{HOME_WAYS.map(([way, label]) => <Choice key={way} label={label} on={trip.wayHome === way} onPick={() => onChange({ wayHome: way })} />)}</div>
                  {trip.wayHome === 'someone' && pickDriver('driverHomeId', trip.driverHomeId)}
                </Field>
                <Field label="OFF THE PLANE">
                  <Stepper value={words(trip.deplaneMinutes)} label="time off the plane" onLess={() => onChange({ deplaneMinutes: Math.max(15, trip.deplaneMinutes - 15) })} onMore={() => onChange({ deplaneMinutes: Math.min(120, trip.deplaneMinutes + 15) })} />
                </Field>
                {trip.homeAt && <div className="border-0 border-t border-solid border-wall-rule pt-[18px] font-display text-wall-date font-semibold">Home about {clock(trip.homeAt)}</div>}
              </>
            ) : <span className="mt-[8px] text-wall-body text-wall-ink-2">No flight home in the calendar yet.</span>}
          </div>
        </div>
        )}

        <div className="flex items-center justify-between border-0 border-t border-solid border-wall-rule pt-[18px]">
          <span className="text-wall-detail text-wall-ink-2">
            {trip.leaveHomeAt ? `Away ${trip.leaveHomeAt.toLocaleDateString('en-US', { weekday: 'short' })} ${clock(trip.leaveHomeAt)}` : 'Away'}
            {trip.homeAt ? ` → home ${trip.homeAt.toLocaleDateString('en-US', { weekday: 'short' })} about ${clock(trip.homeAt)}` : ''}
          </span>
          <button type="button" onClick={onClose} className="h-[52px] rounded-full border-0 bg-wall-ink px-[28px] text-wall-detail font-semibold text-wall-on-pigment">Done</button>
        </div>
      </section>
    </div>
  )
}
