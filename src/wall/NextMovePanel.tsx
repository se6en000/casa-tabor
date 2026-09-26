import type { NextMoveView } from './header'
import { pigmentStyleFor } from './lanes'

const RING_SIZE = 176
const RING_RADIUS = 80
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export interface NextMoveActions {
  onLeaving: () => void
  onUndoLeaving: () => void
  onHandOff: () => void
}

/** The header's one instruction: who leaves for where, and a countdown ring to the leave time. */
export default function NextMovePanel({ view, pigmentIndex, actions }: { view: NextMoveView | null; pigmentIndex: number | null; actions?: NextMoveActions }) {
  if (!view) {
    return (
      <section aria-label="Next move" className="flex min-w-0 flex-1 flex-col justify-center gap-[10px]">
        <div className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">NEXT MOVE</div>
        <p className="m-0 font-display text-wall-date italic text-wall-ink-2">Nothing left to leave for today.</p>
      </section>
    )
  }

  const accent = view.urgent ? 'text-wall-rust' : 'text-wall-ink-2'
  return (
    <section aria-label="Next move" className="flex min-w-0 flex-1 items-center gap-[36px]">
      {view.ring && (
        <div className="relative h-[176px] w-[176px] shrink-0">
          <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
            <circle cx={88} cy={88} r={RING_RADIUS} fill="none" strokeWidth={6} className="stroke-wall-stone" />
            <circle
              cx={88}
              cy={88}
              r={RING_RADIUS}
              fill="none"
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - view.ring.fraction)}
              transform="rotate(-90 88 88)"
              className={view.urgent ? 'stroke-wall-rust' : 'stroke-wall-brass'}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-display font-semibold leading-[0.85] lining-nums ${view.ring.value.includes(':') ? 'text-wall-countdown-long' : 'text-wall-countdown'}`}>{view.ring.value}</span>
            <span className="mt-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">{view.ring.unit}</span>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-[10px]">
        <div className={`text-wall-label font-bold tracking-[0.2em] ${accent}`}>{view.eyebrow}</div>
        <div className="flex min-w-0 items-center gap-[16px]">
          <span
            aria-hidden="true"
            className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full font-display text-wall-heading font-bold ${
              pigmentIndex == null
                ? 'border-2 border-dashed border-wall-ink-2 text-wall-ink-2'
                : `text-wall-on-pigment ${pigmentStyleFor(pigmentIndex).solid}`
            }`}
          >
            {view.initial}
          </span>
          <span className="truncate font-display text-wall-move font-semibold leading-none">{view.title}</span>
        </div>
        <div className="truncate text-wall-body text-wall-ink">{view.detail}</div>
        {view.also && !actions && <div className="truncate text-wall-detail text-wall-ink-2">{view.also}</div>}
        {actions && (
          <div className="mt-[2px] flex gap-[12px]">
            {view.status === 'upcoming' && view.driverId && (
              <button type="button" className="h-[48px] rounded-full border-0 bg-wall-ink px-[24px] text-wall-detail font-semibold text-wall-on-pigment" onClick={(e) => { e.stopPropagation(); actions.onLeaving() }}>
                Leaving now
              </button>
            )}
            {view.status === 'en_route' && view.departed && (
              <button type="button" className="h-[48px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-ink" onClick={(e) => { e.stopPropagation(); actions.onUndoLeaving() }}>
                Not yet (undo)
              </button>
            )}
            {view.status === 'upcoming' && (
              <button type="button" className="h-[48px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-ink" onClick={(e) => { e.stopPropagation(); actions.onHandOff() }}>
                {view.driverId ? 'Hand off' : 'Choose a driver'}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
