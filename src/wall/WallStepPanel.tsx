import { useState } from 'react'
import WallDatePicker from './WallDatePicker'
import { EFFORT_CHOICES, FITS, effortText, moneyText, whoOptions, type ProjectDetail, type ProjectStep } from './projectModel'

// A step's details, in the right column of the project page (canvas 10c / 11a, approved by Jake
// 2026-09-29: "I didn't want to have different step editor screens, they are supposed to be reusable
// across many projects"). The SAME controls in the same order for every step of every project — only
// the values change, and Who lists this project's people (from Project settings).

export type StepInput = 'title' | 'notes' | 'unit' | 'shop' | 'person' | 'split' | 'cost' | 'effort'

export interface WallStepPanelProps {
  detail: ProjectDetail
  step: ProjectStep
  number: number
  total: number
  onSet: (args: Record<string, unknown>) => void
  /** Text or a number typed on the wall keyboard / number pad (the page owns those, along the bottom). */
  onAsk: (what: StepInput) => void
  onDone: () => void
  onMove: (dir: 'up' | 'down') => void
  onMoveTo: () => void
  onDelete: () => void
  onClose: () => void
}

const Label = ({ children, note }: { children: string; note?: string }) => (
  <span className="flex items-baseline justify-between gap-[12px]">
    <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">{children}</span>
    {note && <span className="truncate text-wall-label text-wall-ink-2">{note}</span>}
  </span>
)

export function Pill({ label, on = false, onClick, aria }: { label: string; on?: boolean; onClick: () => void; aria?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={aria} onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`h-[44px] shrink-0 whitespace-nowrap rounded-full px-[14px] text-wall-label font-semibold ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-rule bg-wall-paper text-wall-ink'}`}>
      {label}
    </button>
  )
}

export function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`relative h-[44px] w-[64px] shrink-0 rounded-full border-0 p-0 ${on ? 'bg-wall-ink' : 'bg-wall-stone'}`}>
      <span className={`absolute top-[7px] h-[30px] w-[30px] rounded-full bg-wall-on-pigment ${on ? 'left-[27px]' : 'left-[7px]'}`} />
    </button>
  )
}

/** A value you tap to change; empty, it says what to add. */
export function Field({ value, empty, aria, onClick }: { value: string; empty: string; aria: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={aria} onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`flex h-[48px] shrink-0 items-center rounded-[14px] px-[16px] ${value ? 'border border-solid border-wall-ink-2 bg-wall-on-pigment font-display text-wall-date font-bold text-wall-ink' : 'border border-dashed border-wall-ink-2 bg-transparent text-wall-detail font-semibold text-wall-ink-2'}`}>
      {value || empty}
    </button>
  )
}

/** The one time picker: every step, and the quick change on a row. */
export function EffortChoices({ minutes, onPick, onOther }: { minutes: number | null; onPick: (m: number) => void; onOther: () => void }) {
  return (
    <div className="flex flex-wrap gap-[7px]">
      {EFFORT_CHOICES.map((c) => <Pill key={c.minutes} label={c.label} on={minutes === c.minutes} onClick={() => onPick(c.minutes)} />)}
      <Pill label="Other…" on={Boolean(minutes) && !EFFORT_CHOICES.some((c) => c.minutes === minutes)} onClick={onOther} />
    </div>
  )
}

const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const each = (m: number) => (m < 60 ? `${m} min` : effortText(m))

export default function WallStepPanel({ detail, step, number, total, onSet, onAsk, onDone, onMove, onMoveTo, onDelete, onClose }: WallStepPanelProps) {
  const [effortOpen, setEffortOpen] = useState(false)
  const [picking, setPicking] = useState<'start' | 'end' | null>(null)
  const people = whoOptions(detail.project)
  const trade = detail.project.people.find((p) => p.name === step.who)?.role
  const repeat = Boolean(step.repeat_minutes && step.repeat_count)
  const fits = new Set(step.fits)
  const calOn = Boolean(step.cal_start)

  return (
    <section aria-label={`${step.title} — details`} className="flex min-h-0 flex-1 flex-col gap-[11px] rounded-[20px] border-2 border-solid border-wall-brass bg-wall-on-pigment/50 px-[22px] py-[16px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-[4px]">
          <span className="truncate text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">STEP {number} OF {total} · {detail.project.title.toUpperCase()}</span>
          <button type="button" aria-label="Edit the step’s title" onClick={() => onAsk('title')} className="min-w-0 truncate rounded-[12px] border border-dashed border-wall-rule bg-transparent px-[10px] py-[2px] text-left font-display text-wall-date font-semibold text-wall-ink">{step.title}</button>
        </div>
        <button type="button" aria-label="Close the details" onClick={onClose} className="h-[44px] w-[44px] shrink-0 rounded-full border border-solid border-wall-ink-2 bg-wall-paper text-wall-heading text-wall-ink">×</button>
      </div>

      {picking ? (
        <div className="flex flex-col gap-[8px]">
          <Label>{picking === 'start' ? 'ON THE CALENDAR · FROM' : 'ON THE CALENDAR · TO (OPTIONAL)'}</Label>
          <WallDatePicker value={picking === 'start' ? step.cal_start : step.cal_end} now={new Date()} clearLabel={picking === 'start' ? 'Not on the calendar' : 'Just the one day'}
            onPick={(d) => { onSet(picking === 'start' ? { cal_start: d ?? '' } : { cal_end: d ?? '' }); setPicking(null) }} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-[7px]">
            <Label note="this project’s people, from Project settings">WHO</Label>
            <div className="flex flex-wrap gap-[7px]">
              {people.map((p) => <Pill key={p} label={p} on={step.who === p} onClick={() => onSet({ who: step.who === p ? '' : p })} />)}
              <Pill label="+ Someone new" onClick={() => onAsk('person')} />
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label>EFFORT</Label>
            <div className="flex min-h-[48px] items-center gap-[12px]">
              <Field value={effortText(step.minutes)} empty="Add the time" aria="Change the effort" onClick={() => setEffortOpen((o) => !o)} />
              {trade && step.minutes ? <span className="text-wall-label text-wall-ink-2">theirs ({trade.toLowerCase()})</span> : null}
            </div>
            {effortOpen && <EffortChoices minutes={step.minutes} onPick={(m) => { onSet({ minutes: m, repeat_minutes: '', repeat_count: '' }); setEffortOpen(false) }} onOther={() => { setEffortOpen(false); onAsk('effort') }} />}
            <div className="flex min-h-[44px] items-center gap-[12px]">
              <Toggle on={repeat} label="The same job, many times" onClick={() => onSet(repeat ? { repeat_minutes: '', repeat_count: '' } : { repeat_minutes: 20, repeat_count: 2, repeat_unit: step.repeat_unit ?? 'times' })} />
              <span className={`text-wall-detail ${repeat ? 'text-wall-ink' : 'text-wall-ink-2'}`}>Same job, many times</span>
              {repeat && (
                <span className="flex items-center gap-[8px]">
                  <button type="button" aria-label="Less time each" onClick={() => onSet({ repeat_minutes: Math.max(5, step.repeat_minutes! - 5), repeat_count: step.repeat_count })} className="h-[44px] w-[44px] rounded-full border border-solid border-wall-ink-2 bg-wall-paper text-wall-heading text-wall-ink">−</button>
                  <span className="flex w-[70px] flex-col items-center leading-none"><span className="font-display text-wall-heading font-bold">{each(step.repeat_minutes!)}</span><span className="text-wall-label text-wall-ink-2">each</span></span>
                  <button type="button" aria-label="More time each" onClick={() => onSet({ repeat_minutes: step.repeat_minutes! + 5, repeat_count: step.repeat_count })} className="h-[44px] w-[44px] rounded-full border border-solid border-wall-ink-2 bg-wall-paper text-wall-heading text-wall-ink">+</button>
                  <span className="text-wall-heading text-wall-ink-2">×</span>
                  <button type="button" aria-label="Fewer" onClick={() => onSet({ repeat_minutes: step.repeat_minutes, repeat_count: Math.max(1, step.repeat_count! - 1) })} className="h-[44px] w-[44px] rounded-full border border-solid border-wall-ink-2 bg-wall-paper text-wall-heading text-wall-ink">−</button>
                  <button type="button" aria-label="Change what's counted" onClick={() => onAsk('unit')} className="flex w-[80px] flex-col items-center border-0 bg-transparent p-0 leading-none text-wall-ink"><span className="font-display text-wall-heading font-bold">{step.repeat_count}</span><span className="truncate text-wall-label text-wall-ink-2">{step.repeat_unit ?? 'times'}</span></button>
                  <button type="button" aria-label="More" onClick={() => onSet({ repeat_minutes: step.repeat_minutes, repeat_count: step.repeat_count! + 1 })} className="h-[44px] w-[44px] rounded-full border border-solid border-wall-ink-2 bg-wall-paper text-wall-heading text-wall-ink">+</button>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label note="optional · adds up against the budget">COST</Label>
            <div className="flex min-h-[48px] items-center gap-[12px]">
              <Field value={step.cost_cents ? moneyText(step.cost_cents) : ''} empty="Add a cost" aria="Change the cost" onClick={() => onAsk('cost')} />
            </div>
            <div className="flex min-h-[44px] items-center gap-[12px]">
              <Toggle on={Boolean(step.shop_item)} label="Put it on the shopping list" onClick={() => (step.shop_item ? onSet({ shop_item: '' }) : onAsk('shop'))} />
              <span className={`min-w-0 truncate text-wall-detail ${step.shop_item ? 'text-wall-ink' : 'text-wall-ink-2'}`}>{step.shop_item ? `On the shopping list: ${step.shop_item}` : 'Nothing to buy'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label>WHEN IT FITS</Label>
            <div className="flex flex-wrap gap-[7px]">
              {FITS.map((f) => <Pill key={f.key} label={f.label} on={fits.has(f.key)} onClick={() => onSet({ fits: fits.has(f.key) ? step.fits.filter((x) => x !== f.key) : [...step.fits, f.key] })} />)}
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label>ON THE CALENDAR</Label>
            <div className="flex min-h-[48px] items-center gap-[12px]">
              <Toggle on={calOn} label="Put it on the calendar" onClick={() => (calOn ? onSet({ cal_start: '' }) : setPicking('start'))} />
              {calOn ? (
                <>
                  <Field value={`${short(step.cal_start!)}${step.cal_end ? ` – ${short(step.cal_end)}` : ''}`} empty="" aria="Change the dates" onClick={() => setPicking('start')} />
                  {!step.cal_end && <Pill label="+ an end date" onClick={() => setPicking('end')} />}
                </>
              ) : (
                <span className="text-wall-detail text-wall-ink-2">Not on the calendar</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label>NOTES</Label>
            <button type="button" onClick={() => onAsk('notes')} className="line-clamp-2 min-h-[44px] rounded-[12px] border border-dashed border-wall-rule bg-transparent px-[14px] py-[6px] text-left text-wall-detail text-wall-ink">{step.notes || 'Add a note'}</button>
          </div>
        </>
      )}

      <div className="mt-auto flex flex-wrap gap-[8px]">
        <button type="button" onClick={onDone} className="h-[44px] rounded-full border-0 bg-wall-ink px-[18px] text-wall-label font-semibold text-wall-on-pigment">Done</button>
        <Pill label="↑ Earlier" aria="Move it earlier" onClick={() => onMove('up')} />
        <Pill label="↓ Later" aria="Move it later" onClick={() => onMove('down')} />
        <Pill label="Split it up" onClick={() => onAsk('split')} />
        <Pill label="Move to…" onClick={onMoveTo} />
        <Pill label="Delete…" onClick={onDelete} />
      </div>
    </section>
  )
}
