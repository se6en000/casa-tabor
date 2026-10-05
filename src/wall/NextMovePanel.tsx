import type { NextMoveView } from './header'
import { pigmentStyleFor } from './lanes'

// The ring and title come down a size when THEN sits beside them (canvas 29e), so the title stays whole.
const RING = { full: { size: 176, radius: 80 }, compact: { size: 140, radius: 63 } } as const

export interface NextMoveActions {
  onLeaving: () => void
  onUndoLeaving: () => void
  onHandOff: () => void
}

/** The header's one instruction: who leaves for where, and a countdown ring to the leave time. */
export default function NextMovePanel({ view, pigmentIndex, actions, onDetails, compact = false }: {
  view: NextMoveView | null
  pigmentIndex: number | null
  actions?: NextMoveActions
  /** Something at home leads (canvas 29e): no Leaving now or Hand off, just its details. */
  onDetails?: () => void
  /** THEN is beside it: a smaller ring and title. */
  compact?: boolean
}) {
  if (!view) {
    return (
      <section aria-label="Next move" className="flex min-w-0 flex-1 flex-col justify-center gap-[10px]">
        <div className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">NEXT MOVE</div>
        <p className="m-0 font-display text-wall-date italic text-wall-ink-2">Nothing left to leave for today.</p>
      </section>
    )
  }

  const accent = view.urgent ? 'text-wall-rust' : 'text-wall-ink-2'
  const ring = RING[compact ? 'compact' : 'full']
  const circumference = 2 * Math.PI * ring.radius
  return (
    <section aria-label="Next move" className={`flex min-w-0 flex-1 items-center ${compact ? 'gap-[28px]' : 'gap-[36px]'}`}>
      {view.ring && (
        <div className={`relative shrink-0 ${compact ? 'h-[140px] w-[140px]' : 'h-[176px] w-[176px]'}`}>
          <svg width={ring.size} height={ring.size} viewBox={`0 0 ${ring.size} ${ring.size}`} aria-hidden="true">
            <circle cx={ring.size / 2} cy={ring.size / 2} r={ring.radius} fill="none" strokeWidth={6} className="stroke-wall-stone" />
            <circle
              cx={ring.size / 2}
              cy={ring.size / 2}
              r={ring.radius}
              fill="none"
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - view.ring.fraction)}
              transform={`rotate(-90 ${ring.size / 2} ${ring.size / 2})`}
              className={view.urgent ? 'stroke-wall-rust' : 'stroke-wall-brass'}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-display font-semibold leading-[0.85] lining-nums ${compact || view.ring.value.includes(':') ? 'text-wall-countdown-long' : 'text-wall-countdown'}`}>{view.ring.value}</span>
            <span className="mt-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">{view.ring.unit}</span>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
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
          {/* The what big, the how under it (Jake, Oct 2: "Milo grooming" first, then "Jake → Pet Supermarket · starts 9:00"). */}
          <span className={`truncate font-display font-semibold leading-none ${compact ? 'text-wall-quote' : 'text-wall-move'}`}>{view.what ?? view.title}</span>
        </div>
        <div className="truncate text-wall-body text-wall-ink">{view.how ?? view.detail}</div>
        {view.drive && <div className="-mt-[4px] truncate text-wall-body text-wall-ink-2">{view.drive}</div>}
        {view.also && !actions && !onDetails && <div className="truncate text-wall-detail text-wall-ink-2">{view.also}</div>}
        {!actions && onDetails && (
          <div className="mt-[2px] flex items-center gap-[12px]">
            <button type="button" className="h-[48px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-ink" onClick={(e) => { e.stopPropagation(); onDetails() }}>
              Details
            </button>
          </div>
        )}
        {/* No Leaving now or Hand off here (Jake, Oct 2: "that's micro management, not realistic in real life, it's just
            taking up space" — a hand-off is a tap on the trip or a word to Casa). A trip with nobody on it still asks. */}
        {actions && (
          <div className="mt-[2px] flex min-h-[48px] items-center gap-[12px]">
            {view.status === 'en_route' && view.departed && (
              <button type="button" className="h-[48px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-ink" onClick={(e) => { e.stopPropagation(); actions.onUndoLeaving() }}>
                Not yet (undo)
              </button>
            )}
            {view.status === 'upcoming' && !view.driverId && (
              <button type="button" className="h-[48px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-ink" onClick={(e) => { e.stopPropagation(); actions.onHandOff() }}>
                Choose a driver
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
