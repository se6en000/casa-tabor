import { useState } from 'react'

// Typing a number on the wall (canvas 10c: "cost varies wildly … not preset chips"): a cost, a budget,
// or an effort in minutes, hours or days. Along the bottom like the wall keyboard, finger-sized keys.

const KEY = 'flex h-[76px] w-[150px] items-center justify-center rounded-[12px] border-0 bg-wall-night-rule text-wall-date text-wall-night-ink'

export interface WallNumberPadProps {
  label: string
  /** Shown before the number ("$"). */
  prefix?: string
  initial?: number | null
  /** Units to pick between (effort: minutes / hours / days); the first is the default. */
  units?: string[]
  onDone: (value: number | null, unit?: string) => void
  onCancel: () => void
}

export default function WallNumberPad({ label, prefix = '', initial = null, units, onDone, onCancel }: WallNumberPadProps) {
  const [text, setText] = useState(initial ? String(initial) : '')
  const [unit, setUnit] = useState(units?.[0])
  const press = (k: string) => setText((t) => (t.length >= 7 ? t : t === '0' ? k : t + k))
  return (
    <section
      aria-label={`${label} — number pad`}
      className="absolute bottom-0 left-0 z-40 flex h-[430px] w-[1920px] items-center justify-center gap-[80px] rounded-t-[32px] bg-wall-night-ground font-body text-wall-night-ink"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex w-[520px] flex-col gap-[18px]">
        <span className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{label.toUpperCase()}</span>
        <span className="font-display text-wall-move font-semibold">{text ? `${prefix}${Number(text).toLocaleString('en-US')}` : `${prefix}—`}</span>
        {units && (
          <div className="flex gap-[10px]">
            {units.map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`h-[52px] rounded-full px-[22px] text-wall-detail font-semibold ${unit === u ? 'border-0 bg-wall-night-brass text-wall-ink' : 'border border-solid border-wall-night-ink-2 bg-transparent text-wall-night-ink'}`}>{u}</button>
            ))}
          </div>
        )}
        <div className="flex gap-[10px]">
          <button type="button" onClick={() => onDone(text ? Number(text) : null, unit)} className="h-[60px] rounded-full border-0 bg-wall-night-brass px-[30px] text-wall-heading font-semibold text-wall-ink">Done</button>
          <button type="button" onClick={() => onDone(null, unit)} className="h-[60px] rounded-full border border-solid border-wall-night-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-night-ink">Clear it</button>
          <button type="button" onClick={onCancel} className="h-[60px] rounded-full border border-solid border-wall-night-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-night-ink">Cancel</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-[10px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => <button key={k} type="button" className={KEY} onClick={() => press(k)}>{k}</button>)}
        <span />
        <button type="button" className={KEY} onClick={() => press('0')}>0</button>
        <button type="button" aria-label="Delete a digit" className={KEY} onClick={() => setText((t) => t.slice(0, -1))}>⌫</button>
      </div>
    </section>
  )
}
